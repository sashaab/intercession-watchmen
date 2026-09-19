# Деплой на EasyPanel

EasyPanel даёт постоянный HTTPS-домен — туннель (ngrok/cloudflared) не нужен.

## 1. Залейте код

GitHub / Git / Upload в EasyPanel → New Service → **App**.

Builder: **Dockerfile** (файл уже в корне проекта).

## 2. Domains

- Добавьте домен (свой или `*.easypanel.host`)
- Port: **3000**
- Включите HTTPS

## 3. MySQL

Создайте отдельную базу в phpMyAdmin (SQL или **New**):

```sql
CREATE DATABASE icf_watchmen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Она появится в группе `icf` рядом с `icf_english_db`.

В EasyPanel у сервиса Watchmen:

```env
MYSQL_HOST=icl-english_db
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=icf_watchmen
MYSQL_TABLE_PREFIX=watchmen_
```

`MYSQL_HOST` внутри EasyPanel — имя MySQL-сервиса (как в списке сервисов), не публичный `*.easypanel.host`.

Пользователю MySQL нужны права на `icf_watchmen` (**CREATE**, SELECT, INSERT, UPDATE, DELETE). Таблицы создадутся сами при старте приложения.

Если в phpMyAdmin у `icf_watchmen` написано **No tables found** — приложение либо не стартовало с этой БД, либо у пользователя нет CREATE. Тогда:
1. Проверьте `MYSQL_DATABASE=icf_watchmen` и логи старта (`MySQL tables: watchmen_…`).
2. Или вручную: phpMyAdmin → `icf_watchmen` → **SQL** → выполните файл `sql/schema.sql` из репозитория.
3. Redeploy / Restart сервиса.

Volume `/app/data` больше не нужен.

## 4. Environment

```env
BOT_TOKEN=
ADMIN_CHAT_ID=
LEADER_CHAT_ID=
PORT=3000
DEV_PREVIEW=0
WEBAPP_URL=https://$(PRIMARY_DOMAIN)
BOT_MODE=webhook

MYSQL_HOST=icl-english_db
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=icf_watchmen
MYSQL_TABLE_PREFIX=watchmen_

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

## Важно при 409 / 502

Ошибка `getUpdates … terminated by setWebhook` — это **старый** контейнер с polling, который убивается новым webhook.

1. Scale / Replicas = **1**
2. **Stop** сервис полностью (подождать 10–20 сек)
3. **Deploy** / Start заново
4. В логах должна остаться одна линия `webhook → …` без `Bot.start` / `getUpdates`
5. Проверка: `https://ваш-домен/health` → `{"ok":true}`

Локально с тем же `BOT_TOKEN` ничего не запускайте.

