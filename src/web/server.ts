import cors from "cors";
import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Bot } from "grammy";
import { webhookCallback } from "grammy";
import { config } from "../config.js";
import { registerApi } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createWebServer(bot?: Bot): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  if (bot && config.botMode === "webhook") {
    app.post(
      config.webhookPath,
      webhookCallback(bot, "express", {
        secretToken: config.webhookSecret,
      }),
    );
    console.log(`Telegram webhook route: POST ${config.webhookPath}`);
  }

  registerApi(app);

  const publicDir = path.join(__dirname, "../../public");
  app.use(express.static(publicDir));
  app.get(/^(?!\/api)(?!\/telegram).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  return app;
}

export function startWebServer(bot?: Bot): Express {
  const app = createWebServer(bot);
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Mini App server listening on 0.0.0.0:${config.port}`);
    if (config.devPreview) {
      console.log("DEV_PREVIEW=1 — browser preview auth enabled");
    }
    if (config.webappUrl) {
      console.log(`WEBAPP_URL: ${config.webappUrl}`);
    }
  });
  return app;
}
