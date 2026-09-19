# Intercession Watchmen — Telegram Bot + Mini App

Гибрид по брифу: **бот** для быстрого ввода в чате, **Mini App** для формы и лидерского дашборда.

## Что умеет

1. Record impression (чат или Mini App) — восприятие ≠ интерпретация  
2. AI analysis — *Possible recommendation* only  
3. Leadership inbox, статусы, решения  
4. Topic radar  
5. Prayer focuses  
6. History & learning  
7. Roles: watcher / leader / admin  

## Быстрый просмотр UI (без Telegram)

1. Скопируйте `.env.example` → `.env`, укажите любой валидный `BOT_TOKEN` (или реальный от BotFather) и свой ID:

```env
BOT_TOKEN=...
ADMIN_IDS=ваш_id
LEADER_IDS=ваш_id
DEV_PREVIEW=1
DEV_PREVIEW_USER_ID=ваш_id
PORT=3000
MYSQL_HOST=icl-english_db_db-3306.easypanel.host
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=icf_watchmen
MYSQL_TABLE_PREFIX=watchmen_
```

2. Запуск:

```bash
npm install
npm run dev
```

3. Откройте в браузере: **http://localhost:3000**

Увидите Mini App в preview-режиме (баннер сверху). Так можно смотреть интерфейс до деплоя.

## Mini App внутри Telegram

Telegram требует **HTTPS**. Локально — туннель:

```bash
# пример с cloudflared
cloudflared tunnel --url http://localhost:3000
```

В `.env`:

```env
DEV_PREVIEW=0
WEBAPP_URL=https://ваш-туннель.trycloudflare.com
```

Перезапустите `npm run dev`, в боте `/start` → кнопка **Open Mini App**.

В [@BotFather](https://t.me/BotFather) можно также задать Menu Button → Web App URL = тот же `WEBAPP_URL`.

## Роли

Предпочтительно — по членству в Telegram-чатах:

1. Добавьте бота в группу лидеров и/или админов  
2. В группе напишите `/chatid`  
3. Вставьте ID в `.env` как `LEADER_CHAT_ID` / `ADMIN_CHAT_ID`  

Приоритет: участник admin-чата → admin; leader-чата → leader; иначе watcher.  
`ADMIN_IDS` / `LEADER_IDS` — запасной вариант без чатов.  
Проверка: `/whoami`

| Роль | Возможности |
|------|-------------|
| Watcher | Запись, своя история |
| Leader | Inbox, radar, prayer, learning |
| Admin | + роли пользователей |

## Принцип AI

> AI supports perception and organization — it never assumes spiritual authority.

## Структура

```
src/          bot + API + AI
public/       Mini App (HTML/CSS/JS)
```

Данные хранятся в **MySQL** в базе `icf_watchmen` (таблицы с префиксом `watchmen_`). Нужны `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.

## Дальше

- Голосовой ввод  
- Хостинг на **EasyPanel** — см. [EASYPANEL.md](./EASYPANEL.md) (HTTPS без туннеля)  
- Меню-кнопка BotFather на Mini App по умолчанию  
