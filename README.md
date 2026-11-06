# b2b-auto-reporter

A Node.js background service that pulls daily sales statistics (order count, revenue, average order value) from a MySQL database and sends a formatted report to Telegram on a schedule.

```
📊 DAILY SALES REPORT
📅 Saturday, November 7, 2026
━━━━━━━━━━━━━━━━━━
🛒 Total Orders: 42
💰 Total Revenue: TRY 128,450.50
📈 Avg. Order Value: TRY 3,058.35
━━━━━━━━━━━━━━━━━━
🤖 Automated report • 19:00
```

## Features

- Scheduled reports with `node-cron` (configurable cron expression and timezone)
- MySQL / MariaDB connection pool via `mysql2/promise`
- Telegram delivery with HTML formatting
- Connects with a **read-only** database user
- Failures never crash the service; if a report can't be built, a warning is sent to Telegram instead
- Overlap protection: a new run is skipped while the previous one is still in progress
- Sample schema and data generator for local development

## Requirements

- Node.js 20+
- MySQL 8 or MariaDB 10.4+ (e.g. the one bundled with XAMPP)
- A Telegram bot

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values
```

### 1. Telegram

1. Open **@BotFather** in Telegram → `/newbot` → put the token in `TELEGRAM_BOT_TOKEN`.
2. **Send any message to your bot first.** A bot cannot message you until you do (otherwise you get `chat not found`).
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id": ...}` into `TELEGRAM_CHAT_ID`.
   For a group, add the bot to the group; group IDs start with `-`.

### 2. Database (sample data for development)

With MySQL/MariaDB running:

```bash
mysql -u root < db/schema.sql
mysql -u root -e "CREATE USER 'reporter_ro'@'localhost' IDENTIFIED BY '<password>'; GRANT SELECT ON business_db.* TO 'reporter_ro'@'localhost';"
npm run seed
```

`npm run seed` generates 60 days of orders (busier on weekdays) and a few products below their critical stock level. It connects as `root` with an empty password by default; override with `SEED_DB_USER` / `SEED_DB_PASSWORD`.

To use your own database, edit the query in [src/services/reporter.js](src/services/reporter.js). The default query expects an `orders` table with `id`, `amount`, `status` and `created_at` columns.

> `CURDATE()` uses the MySQL server's timezone. If the server runs in UTC while you are in Türkiye, "today" will be shifted by 3 hours.

## Usage

```bash
npm start      # start the service; sends the report at REPORT_CRON_SCHEDULE
npm run dev    # same, but also sends one test report immediately (development mode)
npm run seed   # (re)generate sample data
```

> **Windows PowerShell:** if you get `running scripts is disabled on this system`, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `npm.cmd run dev`.

## Environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` enables the `--test-run` flag |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection (use a read-only user) |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_CHAT_ID` | Chat or group ID that receives the report |
| `REPORT_CRON_SCHEDULE` | Cron expression, e.g. `0 19 * * *` = every day at 19:00 |
| `REPORT_TIMEZONE` | Timezone for the schedule (default `Europe/Istanbul`) |
| `REPORT_CURRENCY` | ISO currency code for amounts (default `TRY`) |

## Project structure

```
db/
├── schema.sql              # sample tables: products, orders, order_items
└── seed.js                 # sample data generator
src/
├── config/db.js            # MySQL pool + connection check
├── services/reporter.js    # SQL query and message template
├── services/notifier.js    # Telegram delivery
├── jobs/dailyReportJob.js  # node-cron job
└── index.js                # entry point
```

## Roadmap

- [ ] Comparison with yesterday / same day last week (▲▼ %)
- [ ] Top-selling products
- [ ] Low-stock alerts
- [ ] Config-driven reports (define queries without code changes)
- [ ] Additional channels (email, WhatsApp)
