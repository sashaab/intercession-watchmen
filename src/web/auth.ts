import crypto from "node:crypto";
import { config } from "../config.js";

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type ValidatedInitData = {
  user: TelegramWebAppUser;
  authDate: number;
  raw: string;
};

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Validates Telegram Mini App initData per Bot API docs.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  maxAgeSec = 86400,
): ValidatedInitData | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(config.botToken)
    .digest();

  const calculated = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!timingSafeEqual(calculated, hash)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return null;
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSec) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    return null;
  }
  if (!user?.id) return null;

  return { user, authDate, raw: initData };
}
