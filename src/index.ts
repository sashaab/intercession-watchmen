import { config } from "./config.js";
import { createBot } from "./bot/handlers.js";
import { closeDb, initDb } from "./db/index.js";
import { startWebServer } from "./web/server.js";

let bot: ReturnType<typeof createBot> | null = null;

async function main() {
  await initDb();

  if (!config.runBot) {
    startWebServer();
    console.log(
      "Bot skipped (no BOT_TOKEN). Mini App preview is available in the browser.",
    );
    return;
  }

  bot = createBot(config.botToken);
  bot.catch((err) => {
    console.error("Bot error:", err.error ?? err);
  });

  console.log(
    `AI: ${config.openaiApiKey ? `OpenAI (${config.openaiModel})` : "rule-based fallback"}`,
  );
  console.log(`Bot mode: ${config.botMode}`);

  if (config.botMode === "webhook") {
    if (!config.webappUrl) {
      throw new Error("WEBAPP_URL is required for webhook mode");
    }

    startWebServer(bot);

    const webhookUrl = `${config.webappUrl}${config.webhookPath}`;

    // Clear any leftover polling session, then register webhook.
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: true });
    } catch (err) {
      console.warn("deleteWebhook warning:", err);
    }

    await bot.api.setWebhook(webhookUrl, {
      secret_token: config.webhookSecret,
      drop_pending_updates: true,
    });

    const me = await bot.api.getMe();
    console.log(`Bot @${me.username} webhook → ${webhookUrl}`);
    console.log("Ready. Do not run a second instance with the same BOT_TOKEN.");
    return;
  }

  startWebServer(bot);
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
  } catch (err) {
    console.warn("deleteWebhook warning:", err);
  }

  await bot.start({
    onStart: (info) => {
      console.log(`Bot @${info.username} polling`);
    },
  });
}

function shutdown(signal: string) {
  console.log(`Shutting down (${signal})…`);
  const done =
    bot && config.botMode === "polling" ? bot.stop() : Promise.resolve();
  void done.finally(async () => {
    await closeDb();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
