import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { registerApi } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createWebServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  registerApi(app);

  const publicDir = path.join(__dirname, "../../public");
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  return app;
}

export function startWebServer(): void {
  const app = createWebServer();
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Mini App server listening on 0.0.0.0:${config.port}`);
    if (config.devPreview) {
      console.log("DEV_PREVIEW=1 — browser preview auth enabled");
    }
    if (config.webappUrl) {
      console.log(`WEBAPP_URL: ${config.webappUrl}`);
    } else {
      console.log(
        "WEBAPP_URL not set — set HTTPS domain (EasyPanel / tunnel) for Telegram Mini App",
      );
    }
  });
}
