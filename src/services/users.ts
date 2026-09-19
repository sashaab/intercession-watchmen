import { config, type Role } from "../config.js";
import { exec, queryOne, queryRows, tables } from "../db/index.js";
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
 * 1) ADMIN_IDS / LEADER_IDS (explicit)
 * 2) LEADER_CHAT_ID membership → leader
 * 3) watcher
 */
export async function resolveRole(telegramId: number): Promise<RoleResolution> {
  const cached = membershipCache.get(telegramId);
  if (
    cached &&
    Date.now() - cached.at < config.roleCacheSec * 1000
  ) {
    return { role: cached.role, detail: `${cached.detail} (cached)` };
  }

  const bootstrap = resolveBootstrapRole(telegramId);
  if (bootstrap !== "watcher") {
    const result = {
      role: bootstrap,
      detail:
        bootstrap === "admin"
          ? "from ADMIN_IDS"
          : "from LEADER_IDS",
    };
    membershipCache.set(telegramId, { ...result, at: Date.now() });
    return result;
  }

  if (config.leaderChatId && config.runBot) {
    if (await isInChat(config.leaderChatId, telegramId)) {
      const result = {
        role: "leader" as const,
        detail: `member of leader chat (${config.leaderChatId})`,
      };
      membershipCache.set(telegramId, { ...result, at: Date.now() });
      return result;
    }
  }

  const result = {
    role: "watcher" as const,
    detail: config.leaderChatId
      ? "not in ADMIN_IDS / LEADER_CHAT → watcher"
      : "default watcher (set ADMIN_IDS or LEADER_CHAT_ID)",
  };
  membershipCache.set(telegramId, { ...result, at: Date.now() });
  return result;
}

export function clearRoleCache(telegramId?: number): void {
  if (telegramId == null) membershipCache.clear();
  else membershipCache.delete(telegramId);
}

function mapUser(row: UserRow): UserRow {
  return { ...row, telegram_id: Number(row.telegram_id) };
}

export async function upsertUser(
  telegramId: number,
  displayName: string,
  preferredRole?: Role,
): Promise<UserRow> {
  const existing = await queryOne<UserRow>(
    `SELECT * FROM ${tables.users} WHERE telegram_id = ?`,
    [telegramId],
  );

  if (existing) {
    const user = mapUser(existing);
    const nextRole = preferredRole ?? user.role;
    const nextName = displayName;
    if (user.display_name !== nextName || user.role !== nextRole) {
      await exec(
        `UPDATE ${tables.users} SET display_name = ?, role = ? WHERE telegram_id = ?`,
        [nextName, nextRole, telegramId],
      );
      return { ...user, display_name: nextName, role: nextRole };
    }
    return user;
  }

  const role = preferredRole ?? resolveBootstrapRole(telegramId);
  await exec(
    `INSERT INTO ${tables.users} (telegram_id, display_name, role) VALUES (?, ?, ?)`,
    [telegramId, displayName, role],
  );

  return (await getUser(telegramId))!;
}

/** Upsert + sync role from chats / ID lists. */
export async function syncUser(
  telegramId: number,
  displayName: string,
): Promise<UserRow & { roleDetail: string }> {
  const { role, detail } = await resolveRole(telegramId);
  const user = await upsertUser(telegramId, displayName, role);
  if (user.role !== role) {
    await setUserRole(telegramId, role);
  }
  return {
    ...(await getUser(telegramId))!,
    roleDetail: detail,
  };
}

export async function getUser(
  telegramId: number,
): Promise<UserRow | undefined> {
  const row = await queryOne<UserRow>(
    `SELECT * FROM ${tables.users} WHERE telegram_id = ?`,
    [telegramId],
  );
  return row ? mapUser(row) : undefined;
}

export async function setUserRole(
  telegramId: number,
  role: Role,
): Promise<void> {
  await exec(`UPDATE ${tables.users} SET role = ? WHERE telegram_id = ?`, [
    role,
    telegramId,
  ]);
  clearRoleCache(telegramId);
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = await queryRows<UserRow>(
    `SELECT * FROM ${tables.users} ORDER BY role, display_name`,
  );
  return rows.map(mapUser);
}

export function isLeaderOrAdmin(user: UserRow | undefined): boolean {
  if (!user) return false;
  if (user.role === "leader" || user.role === "admin") return true;
  return (
    config.adminIds.includes(user.telegram_id) ||
    config.leaderIds.includes(user.telegram_id)
  );
}

export function isAdmin(user: UserRow | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return config.adminIds.includes(user.telegram_id);
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
