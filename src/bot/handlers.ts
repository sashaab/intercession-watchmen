import { Bot, InlineKeyboard, type Context } from "grammy";
import { analyzeImpression, formatAiAnalysis } from "../ai/analyze.js";
import { config } from "../config.js";
import {
  clearDraft,
  createImpression,
  getDraft,
  getImpression,
  learningSummary,
  listImpressionsForLeaders,
  listOwnImpressions,
  saveDraft,
  setAiFields,
  topicRadar,
  updateImpressionStatus,
  type DraftPayload,
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
  isAdmin,
  isLeaderOrAdmin,
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
  STATUS_LABELS,
  TYPE_LABELS,
} from "../types.js";
import {
  confirmKeyboard,
  contextKeyboard,
  escapeMd,
  formatImpression,
  impressionActionsKeyboard,
  mainMenuKeyboard,
  rolePickKeyboard,
  skipInterpretationKeyboard,
  statusFilterKeyboard,
  typeKeyboard,
  urgencyKeyboard,
  yesNoKeyboard,
} from "./keyboards.js";

type AppContext = Context;

async function ensureUser(ctx: AppContext) {
  const from = ctx.from;
  if (!from) return null;
  return syncUser(from.id, displayNameFromCtx(from));
}

function escapeHtml(text: string): string {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function showHome(ctx: AppContext): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user) return;
  // HTML parse mode: Markdown breaks on underscores in roleDetail (ADMIN_CHAT_ID etc.)
  const text = [
    `<b>Intercession Watchmen</b>`,
    "",
    `Hello, ${escapeHtml(user.display_name)}.`,
    `Role: <b>${escapeHtml(user.role)}</b>`,
    `<i>${escapeHtml(user.roleDetail)}</i>`,
    "",
    "The app documents perceptions and supports organization.",
    "It never replaces spiritual discernment by the leadership team.",
    "",
    config.webappUrl
      ? "📱 Open the <b>Mini App</b> for dashboard &amp; full form, or record quickly in chat."
      : "Set <code>WEBAPP_URL</code> to enable the Mini App button. Chat recording works now.",
    "",
    "Guardian perceives → App documents → AI suggests → Leadership decides.",
  ].join("\n");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(user),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(user),
    });
  }
}

function draftSummary(draft: DraftPayload): string {
  return [
    "*Draft impression*",
    "",
    `*Perceived:* ${escapeMd(draft.perceived ?? "—")}`,
    `*Interpretation:* ${escapeMd(draft.interpretation ?? "_(none)_")}`,
    `Type: ${draft.type ? TYPE_LABELS[draft.type] : "—"}`,
    `Context: ${draft.context ? CONTEXT_LABELS[draft.context] : "—"}`,
    `Urgency: ${draft.urgency ?? "—"}`,
    `Prayed: ${draft.prayed == null ? "—" : draft.prayed ? "Yes" : "No"}`,
    `Confidential: ${
      draft.confidential == null ? "—" : draft.confidential ? "Yes" : "No"
    }`,
  ].join("\n");
}

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    await showHome(ctx);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "Commands:",
        "/start — main menu",
        "/new — record an impression",
        "/my — your history",
        "/inbox — leadership inbox",
        "/radar — topic radar",
        "/prayer — prayer focuses",
        "/id — your Telegram user ID",
        "/whoami — your role and how it was resolved",
        "/chatid — this chat's ID (run inside a group)",
      ].join("\n"),
    );
  });

  bot.command("id", async (ctx) => {
    await ctx.reply(`Your Telegram ID: \`${ctx.from?.id}\``, {
      parse_mode: "Markdown",
    });
  });

  bot.command("whoami", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    await ctx.reply(
      [
        `Name: ${user.display_name}`,
        `ID: ${user.telegram_id}`,
        `Role: ${user.role}`,
        `Source: ${user.roleDetail}`,
        "",
        config.adminChatId
          ? `ADMIN_CHAT_ID: ${config.adminChatId}`
          : "ADMIN_CHAT_ID: not set",
        config.leaderChatId
          ? `LEADER_CHAT_ID: ${config.leaderChatId}`
          : "LEADER_CHAT_ID: not set",
      ].join("\n"),
    );
  });

  /** Run in a group: /chatid — prints this chat's ID for .env */
  bot.command("chatid", async (ctx) => {
    const chat = ctx.chat;
    if (!chat) return;
    await ctx.reply(
      [
        `Chat title: ${"title" in chat ? chat.title : "(private)"}`,
        `Chat type: ${chat.type}`,
        `Chat ID: \`${chat.id}\``,
        "",
        "Paste into .env as ADMIN_CHAT_ID or LEADER_CHAT_ID",
      ].join("\n"),
      { parse_mode: "Markdown" },
    );
  });

  bot.command("new", async (ctx) => {
    await beginRecord(ctx);
  });

  bot.command("my", async (ctx) => {
    await showMyHistory(ctx);
  });

  bot.command("inbox", async (ctx) => {
    await showLeaderInbox(ctx);
  });

  bot.command("radar", async (ctx) => {
    await showRadar(ctx);
  });

  bot.command("prayer", async (ctx) => {
    await showPrayer(ctx);
  });

  bot.callbackQuery("menu:home", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHome(ctx);
  });

  bot.callbackQuery("menu:about", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      [
        "*How it works*",
        "",
        "1. Watcher records *what was perceived* separately from interpretation.",
        "2. AI clusters themes and offers *possible recommendations* only.",
        "3. Leadership reviews, decides, and documents outcomes.",
        "4. Prayer focuses can be created from confirmed themes.",
        "5. History supports learning — not hit-rates for watchers.",
        "",
        "_AI never says “God says…”. Leadership discerns._",
      ].join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
      },
    );
  });

  bot.callbackQuery("menu:record", async (ctx) => {
    await ctx.answerCallbackQuery();
    await beginRecord(ctx);
  });

  bot.callbackQuery("menu:my_history", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMyHistory(ctx);
  });

  bot.callbackQuery("menu:leader_inbox", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showLeaderInbox(ctx);
  });

  bot.callbackQuery("menu:radar", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showRadar(ctx);
  });

  bot.callbackQuery("menu:prayer", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPrayer(ctx);
  });

  bot.callbackQuery("menu:learning", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showLearning(ctx);
  });

  bot.callbackQuery("menu:roles", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showRoles(ctx);
  });

  bot.callbackQuery("draft:cancel", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    clearDraft(user.telegram_id);
    await ctx.answerCallbackQuery("Cancelled");
    await showHome(ctx);
  });

  bot.callbackQuery("draft:interpretation:skip", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const draft = getDraft(user.telegram_id);
    if (!draft) {
      await ctx.answerCallbackQuery("No draft");
      return;
    }
    draft.interpretation = undefined;
    draft.step = "type";
    saveDraft(user.telegram_id, draft);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "Select *type of impression*:",
      { parse_mode: "Markdown", reply_markup: typeKeyboard() },
    );
  });

  bot.callbackQuery(/^draft:type:(.+)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const draft = getDraft(user.telegram_id);
    if (!draft) return;
    draft.type = ctx.match![1] as ImpressionType;
    draft.step = "context";
    saveDraft(user.telegram_id, draft);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Select *context*:", {
      parse_mode: "Markdown",
      reply_markup: contextKeyboard(),
    });
  });

  bot.callbackQuery(/^draft:context:(.+)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const draft = getDraft(user.telegram_id);
    if (!draft) return;
    draft.context = ctx.match![1] as ContextType;
    draft.step = "urgency";
    saveDraft(user.telegram_id, draft);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Select *urgency* (if applicable):", {
      parse_mode: "Markdown",
      reply_markup: urgencyKeyboard(),
    });
  });

  bot.callbackQuery(/^draft:urgency:(.+)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const draft = getDraft(user.telegram_id);
    if (!draft) return;
    draft.urgency = ctx.match![1] as Urgency;
    draft.step = "prayed";
    saveDraft(user.telegram_id, draft);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Have you already prayed about this?", {
      reply_markup: yesNoKeyboard("draft:prayed"),
    });
  });

  bot.callbackQuery(/^draft:prayed:(yes|no)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const draft = getDraft(user.telegram_id);
    if (!draft) return;
    draft.prayed = ctx.match![1] === "yes";
    draft.step = "confidential";
    saveDraft(user.telegram_id, draft);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "Is this confidential / sensitive information?",
      { reply_markup: yesNoKeyboard("draft:confidential") },
    );
  });

  bot.callbackQuery(/^draft:confidential:(yes|no)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const draft = getDraft(user.telegram_id);
    if (!draft) return;
    draft.confidential = ctx.match![1] === "yes";
    draft.step = "confirm";
    saveDraft(user.telegram_id, draft);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`${draftSummary(draft)}\n\nSubmit this impression?`, {
      parse_mode: "Markdown",
      reply_markup: confirmKeyboard(),
    });
  });

  bot.callbackQuery("draft:submit", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const draft = getDraft(user.telegram_id);
    if (
      !draft?.perceived ||
      !draft.type ||
      !draft.context ||
      !draft.urgency ||
      draft.prayed == null ||
      draft.confidential == null
    ) {
      await ctx.answerCallbackQuery("Draft incomplete");
      return;
    }

    await ctx.answerCallbackQuery("Saving…");
    const impression = createImpression({
      watchmanId: user.telegram_id,
      watchmanName: user.display_name,
      perceived: draft.perceived,
      interpretation: draft.interpretation,
      type: draft.type,
      context: draft.context,
      urgency: draft.urgency,
      prayed: draft.prayed,
      confidential: draft.confidential,
    });
    clearDraft(user.telegram_id);

    const recent = listImpressionsForLeaders({
      includeConfidential: false,
      limit: 30,
    }).filter((i) => i.id !== impression.id);

    const analysis = await analyzeImpression(impression, recent);
    setAiFields(impression.id, analysis.topicCluster, analysis.recommendation);
    const saved = getImpression(impression.id)!;

    await ctx.editMessageText(
      [
        "✅ *Impression recorded*",
        "",
        formatImpression(saved),
        "",
        "*AI structuring (not spiritual authority):*",
        formatAiAnalysis(analysis),
      ].join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
      },
    );

    // Notify leaders (non-confidential summary for confidential items)
    const leaders = listUsers().filter((u) => isLeaderOrAdmin(u));
    for (const leader of leaders) {
      if (leader.telegram_id === user.telegram_id) continue;
      try {
        const preview = saved.confidential
          ? `🔒 Confidential impression #${saved.id} from ${saved.watchman_name} (details restricted). Open Leadership inbox.`
          : `New impression #${saved.id} from ${saved.watchman_name}\nTopic: ${analysis.topicCluster}`;
        await ctx.api.sendMessage(leader.telegram_id, preview, {
          reply_markup: new InlineKeyboard().text(
            "Open",
            `imp:${saved.id}:view`,
          ),
        });
      } catch {
        // Leader may not have started the bot yet
      }
    }
  });

  bot.callbackQuery(/^inbox:filter:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const filter = ctx.match![1];
    await showLeaderInbox(ctx, filter);
  });

  bot.callbackQuery(/^imp:(\d+):view$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user || !isLeaderOrAdmin(user)) {
      await ctx.answerCallbackQuery({ text: "Leaders only", show_alert: true });
      return;
    }
    const id = Number(ctx.match![1]);
    const imp = getImpression(id);
    if (!imp) {
      await ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const text = formatImpression(imp);
    if (ctx.callbackQuery.message) {
      await ctx.reply(text, {
        parse_mode: "Markdown",
        reply_markup: impressionActionsKeyboard(id, !!imp.confidential),
      });
    }
  });

  bot.callbackQuery(/^imp:(\d+):status:(.+)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user || !isLeaderOrAdmin(user)) {
      await ctx.answerCallbackQuery({ text: "Leaders only", show_alert: true });
      return;
    }
    const id = Number(ctx.match![1]);
    const status = ctx.match![2] as Status;
    updateImpressionStatus(id, status, {
      decisionNotes: `Set to ${STATUS_LABELS[status]} by ${user.display_name}`,
    });
    const imp = getImpression(id)!;
    await ctx.answerCallbackQuery(`Status → ${STATUS_LABELS[status]}`);
    await ctx.editMessageText(formatImpression(imp), {
      parse_mode: "Markdown",
      reply_markup: impressionActionsKeyboard(id, !!imp.confidential),
    });

    try {
      await ctx.api.sendMessage(
        imp.watchman_id,
        `Your impression #${imp.id} is now: *${STATUS_LABELS[status]}*`,
        { parse_mode: "Markdown" },
      );
    } catch {
      // watcher unreachable
    }
  });

  bot.callbackQuery(/^imp:(\d+):prayer$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user || !isLeaderOrAdmin(user)) {
      await ctx.answerCallbackQuery({ text: "Leaders only", show_alert: true });
      return;
    }
    const id = Number(ctx.match![1]);
    const imp = getImpression(id);
    if (!imp) {
      await ctx.answerCallbackQuery({ text: "Not found", show_alert: true });
      return;
    }
    const title = imp.topic_cluster || `${CONTEXT_LABELS[imp.context]} focus`;
    const focus = createPrayerFocus({
      title,
      leaderName: user.display_name,
      originNote: `From impression #${imp.id}`,
      impressionIds: [imp.id],
      durationWeeks: 4,
    });
    updateImpressionStatus(id, "intercession", {
      decisionNotes: `Prayer focus #${focus.id} created`,
    });
    await ctx.answerCallbackQuery("Prayer focus created");
    await ctx.reply(
      [
        `🙏 *Prayer focus #${focus.id}*`,
        `Title: ${escapeMd(focus.title)}`,
        `Status: ${focus.status}`,
        `Duration: ${focus.duration_weeks} weeks`,
        `Leader: ${escapeMd(focus.leader_name ?? "—")}`,
        `Origin: ${escapeMd(focus.origin_note ?? "—")}`,
        `Linked watchmen: ${countIntercessorsLinked(focus.id)}`,
      ].join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("« Prayer list", "menu:prayer"),
      },
    );
  });

  bot.callbackQuery(/^role:(\d+):(watcher|leader|admin)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user || !isAdmin(user)) {
      await ctx.answerCallbackQuery({ text: "Admins only", show_alert: true });
      return;
    }
    const targetId = Number(ctx.match![1]);
    const role = ctx.match![2] as "watcher" | "leader" | "admin";
    setUserRole(targetId, role);
    await ctx.answerCallbackQuery(`Role set to ${role}`);
    await showRoles(ctx);
  });

  bot.callbackQuery(/^prayer:(\d+):(active|paused|completed)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user || !isLeaderOrAdmin(user)) {
      await ctx.answerCallbackQuery({ text: "Leaders only", show_alert: true });
      return;
    }
    const id = Number(ctx.match![1]);
    const status = ctx.match![2] as "active" | "paused" | "completed";
    setPrayerStatus(id, status);
    await ctx.answerCallbackQuery(`Status → ${status}`);
    await showPrayer(ctx);
  });

  bot.callbackQuery(/^prayer:(\d+):update$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user || !isLeaderOrAdmin(user)) {
      await ctx.answerCallbackQuery({ text: "Leaders only", show_alert: true });
      return;
    }
    const id = Number(ctx.match![1]);
    saveDraft(user.telegram_id, {
      step: "perceived",
      perceived: `__prayer_update__:${id}`,
    });
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Send the update text for prayer focus #${id} as your next message.`,
    );
  });

  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("inbox:filters", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Filter by status:", {
      reply_markup: statusFilterKeyboard(),
    });
  });

  bot.callbackQuery(/^role:pick:(\d+)$/, async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user || !isAdmin(user)) {
      await ctx.answerCallbackQuery({ text: "Admins only", show_alert: true });
      return;
    }
    const targetId = Number(ctx.match![1]);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`Set role for \`${targetId}\`:`, {
      parse_mode: "Markdown",
      reply_markup: rolePickKeyboard(targetId),
    });
  });

  bot.on("message:text", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const draft = getDraft(user.telegram_id);
    if (!draft) {
      await ctx.reply("Open the menu with /start or tap ✍️ Record impression.");
      return;
    }

    // Prayer update capture
    if (draft.perceived?.startsWith("__prayer_update__:")) {
      const id = Number(draft.perceived.split(":")[1]);
      addPrayerUpdate(id, text);
      clearDraft(user.telegram_id);
      await ctx.reply(`Update added to prayer focus #${id}.`, {
        reply_markup: new InlineKeyboard().text("« Prayer list", "menu:prayer"),
      });
      return;
    }

    if (draft.step === "perceived") {
      draft.perceived = text;
      draft.step = "interpretation";
      saveDraft(user.telegram_id, draft);
      await ctx.reply(
        [
          "Recorded as *what you perceived*.",
          "",
          "Now optionally add *your interpretation* (what you think it might mean).",
          "Keep this separate from the original perception.",
          "Or skip.",
        ].join("\n"),
        {
          parse_mode: "Markdown",
          reply_markup: skipInterpretationKeyboard(),
        },
      );
      return;
    }

    if (draft.step === "interpretation") {
      draft.interpretation = text;
      draft.step = "type";
      saveDraft(user.telegram_id, draft);
      await ctx.reply("Select *type of impression*:", {
        parse_mode: "Markdown",
        reply_markup: typeKeyboard(),
      });
      return;
    }

    // Forward target / decision notes capture could be added later
    await ctx.reply("Use the buttons to continue, or /start for the menu.");
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}

async function beginRecord(ctx: AppContext): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user) return;
  saveDraft(user.telegram_id, { step: "perceived" });
  const msg = [
    "*Step 1 — What did you perceive?*",
    "",
    "Write only the original perception (not your interpretation yet).",
    "You can also describe a dream, image, verse, or prayer burden in free text.",
  ].join("\n");
  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("✖️ Cancel", "draft:cancel"),
    });
  } else {
    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("✖️ Cancel", "draft:cancel"),
    });
  }
}

async function showMyHistory(ctx: AppContext): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user) return;
  const items = listOwnImpressions(user.telegram_id, 8);
  if (!items.length) {
    const empty = "No impressions yet. Tap ✍️ Record impression.";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(empty, {
        reply_markup: mainMenuKeyboard(user),
      });
    } else {
      await ctx.reply(empty, { reply_markup: mainMenuKeyboard(user) });
    }
    return;
  }

  const lines = items.map(
    (i) =>
      `#${i.id} · ${STATUS_LABELS[i.status]} · ${i.created_at.slice(0, 16)}\n${i.perceived.slice(0, 120)}${i.perceived.length > 120 ? "…" : ""}`,
  );
  const text = `*Your history*\n\n${lines.join("\n\n")}`;
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(user),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(user),
    });
  }
}

async function showLeaderInbox(
  ctx: AppContext,
  filter = "open",
): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user || !isLeaderOrAdmin(user)) {
    await ctx.reply("Leadership access required.");
    return;
  }

  let items;
  if (filter === "open") {
    items = listImpressionsForLeaders({ limit: 15 }).filter((i) =>
      ["new", "review", "unconfirmed"].includes(i.status),
    );
  } else {
    items = listImpressionsForLeaders({
      status: filter as Status,
      limit: 15,
    });
  }

  const kb = new InlineKeyboard().text("Filters", "inbox:filters").row();
  for (const item of items.slice(0, 10)) {
    const mark = item.confidential ? "🔒" : "•";
    kb.text(
      `${mark} #${item.id} ${item.topic_cluster ?? item.context}`.slice(0, 60),
      `imp:${item.id}:view`,
    ).row();
  }
  kb.text("« Menu", "menu:home");

  const text = items.length
    ? `*Leadership inbox* (${filter})\nSelect an item:`
    : `*Leadership inbox* (${filter})\nNo items.`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

async function showRadar(ctx: AppContext): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user || !isLeaderOrAdmin(user)) {
    await ctx.reply("Leadership access required.");
    return;
  }
  const rows = topicRadar(10);
  const text = rows.length
    ? [
        "*Topic radar* (last 10 days)",
        "Independent watchers, recurring themes:",
        "",
        ...rows.map(
          (r) =>
            `• *${escapeMd(r.topic)}* — ${r.count} inputs from ${r.watchmen} watchers (ids: ${r.sample_ids})`,
        ),
        "",
        "Review: Is this relevant? Pray together? Forward? Keep monitoring?",
      ].join("\n")
    : "*Topic radar*\nNo recurring multi-watcher themes in the last 10 days yet.";

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
    });
  }
}

async function showPrayer(ctx: AppContext): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user || !isLeaderOrAdmin(user)) {
    await ctx.reply("Leadership access required.");
    return;
  }
  const focuses = listPrayerFocuses();
  if (!focuses.length) {
    const empty =
      "No prayer focuses yet. Open an impression and tap “Make prayer focus”.";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(empty, {
        reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
      });
    } else {
      await ctx.reply(empty, {
        reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
      });
    }
    return;
  }

  const kb = new InlineKeyboard();
  const lines: string[] = ["*Prayer focuses*", ""];
  for (const f of focuses.slice(0, 8)) {
    lines.push(
      `#${f.id} · ${f.status} · ${escapeMd(f.title)}`,
      `Duration: ${f.duration_weeks}w · Leader: ${escapeMd(f.leader_name ?? "—")}`,
      f.origin_note ? `Origin: ${escapeMd(f.origin_note)}` : "",
      "",
    );
    kb.text(`#${f.id} update`, `prayer:${f.id}:update`)
      .text("⏸", `prayer:${f.id}:paused`)
      .text("✅", `prayer:${f.id}:completed`)
      .row();
  }
  kb.text("« Menu", "menu:home");

  const text = lines.filter(Boolean).join("\n");
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } else {
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  }
}

async function showLearning(ctx: AppContext): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user || !isLeaderOrAdmin(user)) {
    await ctx.reply("Leadership access required.");
    return;
  }
  const s = learningSummary();
  const text = [
    "*History & learning*",
    "",
    `Total impressions: ${s.total}`,
    `Completed: ${s.completed}`,
    `No action required: ${s.noAction}`,
    "",
    "Repeated topics:",
    s.repeatedTopics.length
      ? s.repeatedTopics.map((t) => `• ${escapeMd(t.topic)} (${t.c})`).join("\n")
      : "_(none yet)_",
    "",
    "_Not for watcher hit-rates — for spiritual and practical learning._",
  ].join("\n");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("« Menu", "menu:home"),
    });
  }
}

async function showRoles(ctx: AppContext): Promise<void> {
  const user = await ensureUser(ctx);
  if (!user || !isAdmin(user)) {
    await ctx.reply("Admin access required.");
    return;
  }
  const users = listUsers();
  const kb = new InlineKeyboard();
  const lines = ["*Users & roles*", ""];
  for (const u of users.slice(0, 20)) {
    lines.push(`${u.display_name} — ${u.role} (\`${u.telegram_id}\`)`);
    kb.text(
      `${u.display_name.slice(0, 20)} (${u.role})`,
      `role:pick:${u.telegram_id}`,
    ).row();
  }
  kb.text("« Menu", "menu:home");

  // Handle role:pick via dynamic - need another handler
  if (ctx.callbackQuery) {
    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } else {
    await ctx.reply(lines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  }
}
