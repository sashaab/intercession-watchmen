import type { Express, NextFunction, Request, Response } from "express";
import { analyzeImpression, formatAiAnalysis } from "../ai/analyze.js";
import { config, type Role } from "../config.js";
import {
  createImpression,
  getImpression,
  learningSummary,
  listImpressionsForLeaders,
  listOwnImpressions,
  setAiFields,
  topicRadar,
  updateImpressionStatus,
} from "../services/impressions.js";
import {
  addPrayerUpdate,
  countIntercessorsLinked,
  createPrayerFocus,
  listPrayerFocuses,
  setPrayerStatus,
} from "../services/prayer.js";
import {
  displayNameFromCtx,
  listUsers,
  setUserRole,
  syncUser,
} from "../services/users.js";
import type {
  ContextType,
  ImpressionType,
  Status,
  Urgency,
} from "../types.js";
import {
  CONTEXT_LABELS,
  CONTEXTS,
  IMPRESSION_TYPES,
  STATUS_LABELS,
  STATUSES,
  TYPE_LABELS,
  URGENCY_LEVELS,
} from "../types.js";
import { validateInitData } from "./auth.js";

export type AuthedRequest = Request & {
  telegramUser: {
    id: number;
    displayName: string;
    role: Role;
  };
};

function authed(req: Request): AuthedRequest["telegramUser"] {
  return (req as unknown as AuthedRequest).telegramUser;
}

function setAuthed(
  req: Request,
  user: AuthedRequest["telegramUser"],
): void {
  (req as unknown as AuthedRequest).telegramUser = user;
}

function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const initData = String(req.header("x-telegram-init-data") || "");
      const validated = validateInitData(initData);

      if (validated) {
        const displayName = displayNameFromCtx(validated.user);
        const user = await syncUser(validated.user.id, displayName);
        setAuthed(req, {
          id: user.telegram_id,
          displayName: user.display_name,
          role: user.role,
        });
        next();
        return;
      }

      if (config.devPreview) {
        const previewId =
          Number(req.header("x-dev-user-id") || 0) ||
          config.devPreviewUserId ||
          config.adminIds[0] ||
          1;
        const user = await syncUser(previewId, `Preview ${previewId}`);
        setAuthed(req, {
          id: user.telegram_id,
          displayName: user.display_name,
          role: user.role,
        });
        next();
        return;
      }

      res.status(401).json({ error: "Invalid Telegram initData" });
    } catch (err) {
      console.error("authMiddleware", err);
      res.status(500).json({ error: "Auth failed" });
    }
  })();
}

function requireLeader(req: Request, res: Response, next: NextFunction): void {
  const user = authed(req);
  if (user.role !== "leader" && user.role !== "admin") {
    res.status(403).json({ error: "Leaders only" });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = authed(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admins only" });
    return;
  }
  next();
}

export function registerApi(app: Express): void {
  app.get("/api/meta", (_req, res) => {
    res.json({
      types: IMPRESSION_TYPES.map((t) => ({ id: t, label: TYPE_LABELS[t] })),
      contexts: CONTEXTS.map((c) => ({ id: c, label: CONTEXT_LABELS[c] })),
      urgencies: URGENCY_LEVELS,
      statuses: STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s] })),
      devPreview: config.devPreview,
    });
  });

  app.use("/api", authMiddleware);

  app.get("/api/me", (req, res) => {
    const u = authed(req);
    res.json({
      id: u.id,
      displayName: u.displayName,
      role: u.role,
      webappUrlConfigured: Boolean(config.webappUrl),
      devPreview: config.devPreview,
    });
  });

  app.get("/api/impressions/mine", async (req, res) => {
    const u = authed(req);
    res.json({ items: await listOwnImpressions(u.id, 30) });
  });

  app.post("/api/impressions", async (req, res) => {
    const u = authed(req);
    const body = req.body as {
      perceived?: string;
      interpretation?: string;
      type?: ImpressionType;
      context?: ContextType;
      urgency?: Urgency;
      prayed?: boolean;
      confidential?: boolean;
    };

    if (!body.perceived?.trim() || !body.type || !body.context) {
      res.status(400).json({ error: "perceived, type, context required" });
      return;
    }

    const impression = await createImpression({
      watchmanId: u.id,
      watchmanName: u.displayName,
      perceived: body.perceived.trim(),
      interpretation: body.interpretation?.trim() || undefined,
      type: body.type,
      context: body.context,
      urgency: body.urgency || "none",
      prayed: Boolean(body.prayed),
      confidential: Boolean(body.confidential),
    });

    const recent = (
      await listImpressionsForLeaders({
        includeConfidential: false,
        limit: 30,
      })
    ).filter((i) => i.id !== impression.id);

    const analysis = await analyzeImpression(impression, recent);
    await setAiFields(impression.id, analysis.topicCluster, analysis.recommendation);
    const saved = (await getImpression(impression.id))!;

    res.status(201).json({
      impression: saved,
      analysis,
      analysisText: formatAiAnalysis(analysis),
    });
  });

  app.get("/api/inbox", requireLeader, async (req, res) => {
    const status = String(req.query.status || "");
    const items = status
      ? await listImpressionsForLeaders({ status: status as Status, limit: 50 })
      : await listImpressionsForLeaders({ limit: 50 });
    res.json({ items });
  });

  app.get("/api/impressions/:id", async (req, res) => {
    const u = authed(req);
    const id = Number(req.params.id);
    const item = await getImpression(id);
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const leader = u.role === "leader" || u.role === "admin";
    if (!leader && item.watchman_id !== u.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!leader && item.confidential) {
      // owner can see own confidential
    }
    res.json({ item });
  });

  app.patch("/api/impressions/:id/status", requireLeader, async (req, res) => {
    const u = authed(req);
    const id = Number(req.params.id);
    const body = req.body as {
      status?: Status;
      decisionNotes?: string;
      outcome?: string;
      forwardedTo?: string;
    };
    if (!body.status || !STATUSES.includes(body.status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    const existing = await getImpression(id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await updateImpressionStatus(id, body.status, {
      decisionNotes:
        body.decisionNotes ||
        `Set to ${STATUS_LABELS[body.status]} by ${u.displayName}`,
      outcome: body.outcome,
      forwardedTo: body.forwardedTo,
    });
    res.json({ item: await getImpression(id) });
  });

  app.get("/api/radar", requireLeader, async (_req, res) => {
    res.json({ items: await topicRadar(10) });
  });

  app.get("/api/learning", requireLeader, async (_req, res) => {
    res.json(await learningSummary());
  });

  app.get("/api/prayer", requireLeader, async (_req, res) => {
    const focuses = await Promise.all(
      (await listPrayerFocuses()).map(async (f) => ({
        ...f,
        linkedWatchmen: await countIntercessorsLinked(f.id),
      })),
    );
    res.json({ items: focuses });
  });

  app.post("/api/prayer", requireLeader, async (req, res) => {
    const u = authed(req);
    const body = req.body as {
      title?: string;
      durationWeeks?: number;
      sharedWith?: string;
      impressionId?: number;
    };
    if (!body.title?.trim()) {
      res.status(400).json({ error: "title required" });
      return;
    }
    const impressionIds = body.impressionId ? [body.impressionId] : [];
    if (body.impressionId) {
      await updateImpressionStatus(body.impressionId, "intercession", {
        decisionNotes: `Prayer focus created by ${u.displayName}`,
      });
    }
    const focus = await createPrayerFocus({
      title: body.title.trim(),
      durationWeeks: body.durationWeeks ?? 4,
      leaderName: u.displayName,
      sharedWith: body.sharedWith,
      originNote: body.impressionId
        ? `From impression #${body.impressionId}`
        : undefined,
      impressionIds,
    });
    res.status(201).json({
      item: {
        ...focus,
        linkedWatchmen: await countIntercessorsLinked(focus.id),
      },
    });
  });

  app.post("/api/prayer/:id/update", requireLeader, async (req, res) => {
    const id = Number(req.params.id);
    const text = String((req.body as { text?: string }).text || "").trim();
    if (!text) {
      res.status(400).json({ error: "text required" });
      return;
    }
    await addPrayerUpdate(id, text);
    res.json({ ok: true });
  });

  app.patch("/api/prayer/:id/status", requireLeader, async (req, res) => {
    const id = Number(req.params.id);
    const status = (req.body as { status?: string }).status;
    if (!status || !["active", "paused", "completed"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    await setPrayerStatus(
      id,
      status as "active" | "paused" | "completed",
      (req.body as { reflection?: string }).reflection,
    );
    res.json({ ok: true });
  });

  app.get("/api/users", requireAdmin, async (_req, res) => {
    res.json({ items: await listUsers() });
  });

  app.patch("/api/users/:id/role", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const role = (req.body as { role?: Role }).role;
    if (!role || !["watcher", "leader", "admin"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    await setUserRole(id, role);
    res.json({ ok: true });
  });
}
