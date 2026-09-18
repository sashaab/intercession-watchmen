import { config } from "./config.js";
import { createBot } from "./bot/handlers.js";
import { getDb, closeDb } from "./db/index.js";
import { startWebServer } from "./web/server.js";

getDb();
startWebServer();

let bot: ReturnType<typeof createBot> | null = null;

if (config.runBot) {
  bot = createBot(config.botToken);
  console.log(
    `AI: ${config.openaiApiKey ? `OpenAI (${config.openaiModel})` : "rule-based fallback"}`,
  );
  bot.start({
    onStart: (info) => {
      console.log(`Bot @${info.username} is running`);
    },
  });
} else {
  console.log(
    "Bot polling skipped (no BOT_TOKEN). Mini App preview is available in the browser.",
  );
}

function shutdown(signal: string) {
  console.log(`Shutting down (${signal})…`);
  const done = bot ? bot.stop() : Promise.resolve();
  void done.finally(() => {
    closeDb();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
