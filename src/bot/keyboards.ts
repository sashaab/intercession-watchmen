import { InlineKeyboard } from "grammy";
import { config } from "../config.js";
import {
  CONTEXT_LABELS,
  CONTEXTS,
  IMPRESSION_TYPES,
  STATUS_LABELS,
  STATUSES,
  TYPE_LABELS,
  URGENCY_LEVELS,
  type ImpressionRow,
  type Status,
} from "../types.js";
import type { UserRow } from "../types.js";

export function mainMenuKeyboard(user: UserRow): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (config.webappUrl) {
    kb.webApp("📱 Open Mini App", config.webappUrl).row();
  }

  kb.text("✍️ Record in chat", "menu:record")
    .row()
    .text("📜 My history", "menu:my_history")
    .text("ℹ️ How it works", "menu:about");

  if (user.role === "leader" || user.role === "admin") {
    kb.row()
      .text("🛡 Leadership inbox", "menu:leader_inbox")
      .text("📡 Topic radar", "menu:radar")
      .row()
      .text("🙏 Prayer focuses", "menu:prayer")
      .text("📈 Learning", "menu:learning");
  }

  if (user.role === "admin") {
    kb.row().text("👤 Manage roles", "menu:roles");
  }

  return kb;
}

export function typeKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  IMPRESSION_TYPES.forEach((t, i) => {
    kb.text(TYPE_LABELS[t], `draft:type:${t}`);
    if (i % 2 === 1) kb.row();
  });
  if (IMPRESSION_TYPES.length % 2 === 1) kb.row();
  kb.text("✖️ Cancel", "draft:cancel");
  return kb;
}

export function contextKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  CONTEXTS.forEach((c, i) => {
    kb.text(CONTEXT_LABELS[c], `draft:context:${c}`);
    if (i % 2 === 1) kb.row();
  });
  if (CONTEXTS.length % 2 === 1) kb.row();
  kb.text("✖️ Cancel", "draft:cancel");
  return kb;
}

export function urgencyKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const u of URGENCY_LEVELS) {
    kb.text(u, `draft:urgency:${u}`);
  }
  return kb.row().text("✖️ Cancel", "draft:cancel");
}

export function yesNoKeyboard(prefix: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Yes", `${prefix}:yes`)
    .text("No", `${prefix}:no`)
    .row()
    .text("✖️ Cancel", "draft:cancel");
}

export function confirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Submit", "draft:submit")
    .text("✖️ Cancel", "draft:cancel");
}

export function skipInterpretationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Skip interpretation", "draft:interpretation:skip")
    .row()
    .text("✖️ Cancel", "draft:cancel");
}

export function impressionActionsKeyboard(
  id: number,
  confidential: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const actions: Status[] = [
    "review",
    "monitor",
    "intercession",
    "forward",
    "pastoral",
    "no_action",
    "unconfirmed",
    "completed",
  ];
  actions.forEach((s, i) => {
    kb.text(STATUS_LABELS[s], `imp:${id}:status:${s}`);
    if (i % 2 === 1) kb.row();
  });
  if (actions.length % 2 === 1) kb.row();
  kb.text("🙏 Make prayer focus", `imp:${id}:prayer`).row();
  if (confidential) {
    kb.text("🔒 Confidential item", "noop");
  }
  kb.text("« Back", "menu:leader_inbox");
  return kb;
}

export function formatImpression(
  imp: ImpressionRow,
  opts?: { hideSensitive?: boolean },
): string {
  const hide = opts?.hideSensitive && imp.confidential;
  const perceived = hide ? "_[confidential — restricted]_" : imp.perceived;
  const interpretation = hide
    ? "_[hidden]_"
    : imp.interpretation || "_(none)_";

  return [
    `*Impression #${imp.id}* · ${STATUS_LABELS[imp.status]}`,
    `👤 ${escapeMd(imp.watchman_name)}`,
    `🕒 ${imp.created_at}`,
    `📌 Type: ${TYPE_LABELS[imp.type]} · Context: ${CONTEXT_LABELS[imp.context]}`,
    `⚡ Urgency: ${imp.urgency}`,
    `🙏 Already prayed: ${imp.prayed ? "Yes" : "No"}`,
    `🔒 Confidential: ${imp.confidential ? "Yes" : "No"}`,
    "",
    `*What was perceived:*`,
    escapeMd(perceived),
    "",
    `*Interpretation (separate):*`,
    escapeMd(interpretation),
    imp.topic_cluster ? `\n🧭 Cluster: ${escapeMd(imp.topic_cluster)}` : "",
    imp.ai_recommendation
      ? `\n🤖 ${escapeMd(imp.ai_recommendation)}`
      : "",
    imp.decision_notes
      ? `\n📝 Decision: ${escapeMd(imp.decision_notes)}`
      : "",
    imp.outcome ? `\n🏁 Outcome: ${escapeMd(imp.outcome)}` : "",
    imp.forwarded_to
      ? `\n➡️ Forwarded to: ${escapeMd(imp.forwarded_to)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function escapeMd(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}

export function statusFilterKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard().text("All new/review", "inbox:filter:open");
  for (const s of STATUSES) {
    kb.row().text(STATUS_LABELS[s], `inbox:filter:${s}`);
  }
  return kb.row().text("« Menu", "menu:home");
}

export function rolePickKeyboard(telegramId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Watcher", `role:${telegramId}:watcher`)
    .text("Leader", `role:${telegramId}:leader`)
    .text("Admin", `role:${telegramId}:admin`)
    .row()
    .text("« Menu", "menu:home");
}
