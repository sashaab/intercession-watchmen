import "dotenv/config";
import path from "node:path";

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

const devPreview = process.env.DEV_PREVIEW === "1";
const botToken = process.env.BOT_TOKEN?.trim() || "";

if (!botToken && !devPreview) {
  throw new Error("Missing env: BOT_TOKEN (or set DEV_PREVIEW=1 for browser UI preview)");
}

export const config = {
  botToken: botToken || "dev:preview-token",
  adminIds: idList("ADMIN_IDS"),
  leaderIds: idList("LEADER_IDS"),
  /** Group/supergroup ID — members become admins */
  adminChatId: chatId("ADMIN_CHAT_ID"),
  /** Group/supergroup ID — members become leaders */
  leaderChatId: chatId("LEADER_CHAT_ID"),
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  /** OpenAI-compatible endpoint (LiteLLM etc.). Empty = api.openai.com */
  openaiBaseUrl:
    process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, "") || "",
  databasePath:
    process.env.DATABASE_PATH?.trim() ||
    path.join(process.cwd(), "data", "watchmen.db"),
  port: Number(process.env.PORT || 3000),
  webappUrl: process.env.WEBAPP_URL?.trim().replace(/\/$/, "") || "",
  devPreview,
  devPreviewUserId: Number(process.env.DEV_PREVIEW_USER_ID || 0) || null,
  runBot: Boolean(botToken) && !botToken.startsWith("dev:"),
  /** Cache chat membership checks (seconds) */
  roleCacheSec: Number(process.env.ROLE_CACHE_SEC || 300),
};

export type Role = "watcher" | "leader" | "admin";
