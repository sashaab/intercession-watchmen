import { config, type Role } from "../config.js";
import { getDb } from "../db/index.js";
import type { UserRow } from "../types.js";

type CacheEntry = { role: Role; detail: string; at: number };

const membershipCache = new Map<number, CacheEntry>();

const ACTIVE = new Set([
  "creator",
  "administrator",
  "member",
  "restricted",
]);

async function getChatMemberStatus(
  chatId: number,
  userId: number,
): Promise<string | null> {
  if (!config.runBot) return null;
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/getChatMember`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: { status?: string };
      description?: string;
    };
    if (!data.ok) return null;
    return data.result?.status ?? null;
  } catch {
    return null;
  }
}

async function isInChat(chatId: number | null, userId: number): Promise<boolean> {
  if (!chatId) return false;
  const status = await getChatMemberStatus(chatId, userId);
  return !!status && ACTIVE.has(status);
}

export function resolveBootstrapRole(telegramId: number): Role {
  if (config.adminIds.includes(telegramId)) return "admin";
  if (config.leaderIds.includes(telegramId)) return "leader";
  return "watcher";
}

export type RoleResolution = {
  role: Role;
  detail: string;
};

/**
 * Priority:
 * 1) ADMIN_CHAT_ID membership → admin
 * 2) LEADER_CHAT_ID membership → leader
 * 3) ADMIN_IDS / LEADER_IDS fallback
 * 4) watcher
 */
export async function resolveRole(telegramId: number): Promise<RoleResolution> {
  const cached = membershipCache.get(telegramId);
  if (
    cached &&
    Date.now() - cached.at < config.roleCacheSec * 1000
  ) {
    return { role: cached.role, detail: `${cached.detail} (cached)` };
  }

  const chatsConfigured = Boolean(config.adminChatId || config.leaderChatId);

  if (chatsConfigured && config.runBot) {
    if (await isInChat(config.adminChatId, telegramId)) {
      const result = {
        role: "admin" as const,
        detail: `member of admin chat (${config.adminChatId})`,
      };
      membershipCache.set(telegramId, { ...result, at: Date.now() });
      return result;
    }
    if (await isInChat(config.leaderChatId, telegramId)) {
      const result = {
        role: "leader" as const,
        detail: `member of leader chat (${config.leaderChatId})`,
      };
      membershipCache.set(telegramId, { ...result, at: Date.now() });
      return result;
    }
  }

  const bootstrap = resolveBootstrapRole(telegramId);
  const detail =
    bootstrap !== "watcher"
      ? "from ADMIN IDS / LEADER IDS"
      : chatsConfigured
        ? "not in role chats → watcher"
        : "default watcher (set ADMIN CHAT ID / LEADER CHAT ID)";

  const result = { role: bootstrap, detail };
  membershipCache.set(telegramId, { ...result, at: Date.now() });
  return result;
}

export function clearRoleCache(telegramId?: number): void {
  if (telegramId == null) membershipCache.clear();
  else membershipCache.delete(telegramId);
}

export function upsertUser(
  telegramId: number,
  displayName: string,
  preferredRole?: Role,
): UserRow {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRow | undefined;

  if (existing) {
    if (existing.display_name !== displayName) {
      db.prepare("UPDATE users SET display_name = ? WHERE telegram_id = ?").run(
        displayName,
        telegramId,
      );
      return { ...existing, display_name: displayName };
    }
    return existing;
  }

  const role = preferredRole ?? resolveBootstrapRole(telegramId);
  db.prepare(
    "INSERT INTO users (telegram_id, display_name, role) VALUES (?, ?, ?)",
  ).run(telegramId, displayName, role);

  return db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRow;
}

/** Upsert + sync role from chats / ID lists. */
export async function syncUser(
  telegramId: number,
  displayName: string,
): Promise<UserRow & { roleDetail: string }> {
  const { role, detail } = await resolveRole(telegramId);
  const user = upsertUser(telegramId, displayName, role);
  if (user.role !== role) {
    setUserRole(telegramId, role);
  }
  return {
    ...getUser(telegramId)!,
    roleDetail: detail,
  };
}

export function getUser(telegramId: number): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRow | undefined;
}

export function setUserRole(telegramId: number, role: Role): void {
  getDb()
    .prepare("UPDATE users SET role = ? WHERE telegram_id = ?")
    .run(role, telegramId);
  clearRoleCache(telegramId);
}

export function listUsers(): UserRow[] {
  return getDb()
    .prepare("SELECT * FROM users ORDER BY role, display_name")
    .all() as UserRow[];
}

export function isLeaderOrAdmin(user: UserRow | undefined): boolean {
  return !!user && (user.role === "leader" || user.role === "admin");
}

export function isAdmin(user: UserRow | undefined): boolean {
  return !!user && user.role === "admin";
}

export function displayNameFromCtx(from: {
  first_name?: string;
  last_name?: string;
  username?: string;
  id: number;
}): string {
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (from.username) return `@${from.username}`;
  return `User ${from.id}`;
}
