# Деплой на EasyPanel

EasyPanel даёт постоянный HTTPS-домен — туннель (ngrok/cloudflared) не нужен.

## 1. Залейте код

GitHub / Git / Upload в EasyPanel → New Service → **App**.

Builder: **Dockerfile** (файл уже в корне проекта).

## 2. Domains

- Добавьте домен (свой или `*.easypanel.host`)
- Port: **3000**
- Включите HTTPS

## 3. Storage (важно для SQLite)

Mount:
- Mount Path: `/app/data`
- иначе база сотрётся при каждом редеплое

## 4. Environment

```env
BOT_TOKEN=
ADMIN_CHAT_ID=
LEADER_CHAT_ID=
PORT=3000
DATABASE_PATH=/app/data/watchmen.db
DEV_PREVIEW=0
WEBAPP_URL=https://$(PRIMARY_DOMAIN)

OPENAI_BASE_URL=https://ai-llm.hecosys.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=DeepSeek-V4.1-Flash
```

`$(PRIMARY_DOMAIN)` EasyPanel подставит сам. Или впишите домен вручную: `https://watchmen.ваш-домен.com`

## 5. Deploy

После деплоя:
1. Откройте `https://ваш-домен` — должен открыться Mini App UI  
2. В BotFather → Bot Settings → Menu Button → URL = тот же HTTPS  
3. Перезапустите локально не обязательно — на сервере бот уже крутится с polling  

Локальный `npm run dev` для продакшена остановите, иначе будет конфликт двух polling у одного бота.
