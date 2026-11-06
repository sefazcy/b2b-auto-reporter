# b2b-auto-reporter

A Node.js background service that pulls daily sales statistics from a MySQL database and sends a formatted report to Telegram on a schedule: how today compares to yesterday and last week, what sold best, and what is running out of stock.

```
📊 DAILY SALES REPORT
📅 Friday, November 6, 2026
━━━━━━━━━━━━━━━━━━
🛒 Orders: 32
    ▲ +14% vs yesterday · ▼ −3% vs last Friday
💰 Revenue: TRY 128,450.50
    ▲ +9% vs yesterday · ▲ +21% vs last Friday
📈 Avg. Order Value: TRY 4,014.08
    ▼ −4.4% vs yesterday · ▲ +25% vs last Friday
━━━━━━━━━━━━━━━━━━
🏆 Top Products
🥇 27" Monitor — TRY 71,991.00 (9 pcs)
🥈 Ergonomic Office Chair — TRY 25,794.00 (6 pcs)
🥉 Mechanical Keyboard — TRY 9,495.00 (5 pcs)
━━━━━━━━━━━━━━━━━━
⚠️ Low Stock (2 products)
🔴 HP 85A Compatible Toner — OUT OF STOCK (min 10)
🟠 Stapler — 4 left (min 5)
━━━━━━━━━━━━━━━━━━
🤖 Automated report • 19:00 · compared up to the same time
```

## Features

- **Fair comparisons:** today so far is compared with yesterday and the same weekday last week *up to the same time of day*, so a report sent at 14:00 isn't measured against a full day
- **Top 3 products** of the day by revenue
- **Low-stock alerts** for products at or below their critical level, most urgent first
- **Instant alerts** (checked every 15 minutes), each sent once and followed by an all-clear:
  - 🔴 a product runs out of stock → ✅ back in stock
  - ⏰ no orders for N hours during business hours (often means the site or payments are down) → ✅ orders resumed
- Cancelled orders are excluded from all figures
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

To use your own database, edit the queries in [src/services/reporter.js](src/services/reporter.js). They expect the tables in [db/schema.sql](db/schema.sql):

| Table | Columns used |
|---|---|
| `orders` | `id`, `amount`, `status` (`cancelled` is excluded), `created_at` |
| `order_items` | `order_id`, `product_id`, `quantity`, `unit_price` |
| `products` | `id`, `name`, `stock`, `critical_stock` |

> `CURDATE()` uses the MySQL server's timezone. If the server runs in UTC while you are in Türkiye, "today" will be shifted by 3 hours.

## Usage

```bash
npm start      # start the service; sends the report at REPORT_CRON_SCHEDULE
npm run dev    # same, but also sends one test report immediately (development mode)
npm start -- --alert-check   # also run the alert checks once right away
npm run seed   # (re)generate sample data
npm test       # unit tests for the message formatter (no database needed)
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
| `ALERTS_ENABLED` | `false` disables instant alerts (default `true`) |
| `ALERT_CRON_SCHEDULE` | How often alerts are checked (default `*/15 * * * *`) |
| `ALERT_NO_ORDER_HOURS` | Hours without orders before alerting (default `3`, decimals allowed) |
| `ALERT_BUSINESS_HOURS` | Hours when silence counts, e.g. `9-18` (end exclusive) |
| `ALERT_BUSINESS_DAYS` | ISO weekdays, e.g. `1-5` (Mon–Fri) or `1-6` |
| `ALERT_STATE_FILE` | Where sent alerts are remembered (default `data/alert-state.json`) |

> Silence is only counted from the start of business hours, so a quiet night never triggers an alert at 09:00.

## Project structure

```
db/
├── schema.sql              # sample tables: products, orders, order_items
└── seed.js                 # sample data generator
src/
├── config/db.js            # MySQL pool + connection check
├── services/reporter.js         # SQL queries
├── services/reportFormatter.js  # message template (pure functions)
├── services/notifier.js         # Telegram delivery
├── services/alerts.js           # alert checks and decision logic
├── services/alertState.js       # remembers sent alerts across restarts
├── jobs/dailyReportJob.js       # daily report cron job
├── jobs/alertJob.js             # alert check cron job
└── index.js                     # entry point
test/
├── reportFormatter.test.js      # node:test unit tests
└── alerts.test.js
```

## Roadmap

- [x] Comparison with yesterday / same day last week (▲▼ %)
- [x] Top-selling products
- [x] Low-stock alerts in the daily report
- [x] Instant alerts during the day (stock hits zero, no orders for hours)
- [ ] Config-driven reports (define queries without code changes)
- [ ] Additional channels (email, WhatsApp)
