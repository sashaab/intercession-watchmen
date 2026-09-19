import "dotenv/config";

function idList(name: string): number[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

function chatId(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing env: ${name}. Create a MySQL database in phpMyAdmin and set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.`,
    );
  }
  return value;
}

const devPreview = process.env.DEV_PREVIEW === "1";
const botToken = process.env.BOT_TOKEN?.trim() || "";
const webappUrl = process.env.WEBAPP_URL?.trim().replace(/\/$/, "") || "";

if (!botToken && !devPreview) {
  throw new Error("Missing env: BOT_TOKEN (or set DEV_PREVIEW=1 for browser UI preview)");
}

const runBot = Boolean(botToken) && !botToken.startsWith("dev:");

/** Prefer webhook in production when WEBAPP_URL is set. Force polling with BOT_MODE=polling */
const botModeEnv = (process.env.BOT_MODE || "").trim().toLowerCase();
const botMode: "webhook" | "polling" = !runBot
  ? "polling"
  : botModeEnv === "polling"
    ? "polling"
    : botModeEnv === "webhook" || webappUrl
      ? "webhook"
      : "polling";

export const config = {
  botToken: botToken || "dev:preview-token",
  adminIds: idList("ADMIN_IDS"),
  leaderIds: idList("LEADER_IDS"),
  adminChatId: chatId("ADMIN_CHAT_ID"),
  leaderChatId: chatId("LEADER_CHAT_ID"),
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  openaiBaseUrl:
    process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, "") || "",
  mysql: {
    host: requiredEnv("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: requiredEnv("MYSQL_USER"),
    password: process.env.MYSQL_PASSWORD ?? "",
    database: requiredEnv("MYSQL_DATABASE"),
    /** Prefix so tables can live inside a shared DB like icf_english_db. */
    tablePrefix: process.env.MYSQL_TABLE_PREFIX?.trim() || "watchmen_",
  },
  port: Number(process.env.PORT || 3000),
  webappUrl,
  webhookPath: "/telegram/webhook",
  webhookSecret:
    process.env.WEBHOOK_SECRET?.trim() ||
    (botToken ? `whsec_${botToken.slice(-16)}` : "dev-secret"),
  botMode,
  devPreview,
  devPreviewUserId: Number(process.env.DEV_PREVIEW_USER_ID || 0) || null,
  runBot,
  roleCacheSec: Number(process.env.ROLE_CACHE_SEC || 300),
};

export type Role = "watcher" | "leader" | "admin";
