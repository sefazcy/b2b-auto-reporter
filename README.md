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
- **Config-driven reports:** queries, message templates and schedules live in a YAML file, so the service adapts to any schema without code changes
- Scheduled reports with `node-cron` (each report has its own cron expression)
- MySQL / MariaDB connection pool via `mysql2/promise`
- Telegram delivery with HTML formatting
- Connects with a **read-only** database user
- Failures never crash the service; if a report can't be built, a warning is sent to Telegram instead
- Overlap protection: a new run is skipped while the previous one is still in progress
- Sample schema and data generator for local development

## Requirements

- Node.js 20+ (or Docker)
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

> `CURDATE()` uses the MySQL server's timezone. If the server runs in UTC while you are in Türkiye, "today" will be shifted by 3 hours.

## Configuring reports

Reports are defined in [config/reports.yml](config/reports.yml), so they can be adapted to any database schema **without changing code**. Each report has its own schedule, period, comparisons and sections:

```yaml
reports:
  - id: daily
    title: DAILY SALES REPORT
    emoji: "📊"
    schedule: "0 19 * * *"
    period: today                      # today | yesterday
    compare:                           # same queries, shifted back in time
      - { shift: 1 DAY, label: yesterday }
      - { shift: 7 DAY, label: "last {weekday}" }
    sections:
      - type: metrics                  # one row → numbers with ▲▼ comparisons
        query: |
          SELECT COUNT(*) AS orders, IFNULL(SUM(amount), 0) AS revenue
          FROM orders
          WHERE created_at >= {{from}} AND created_at < {{to}}
        metrics:
          - { column: orders,  label: Orders,  emoji: "🛒", format: number }
          - { column: revenue, label: Revenue, emoji: "💰", format: currency }

      - type: list                     # many rows → one line per row
        title: Top Products
        emoji: "🏆"
        ranked: true                   # 🥇🥈🥉
        query: SELECT name, revenue FROM ... WHERE created_at >= {{from}} AND created_at < {{to}} LIMIT 3
        item: "{name} — {revenue|currency}"
```

- `{{from}}` / `{{to}}` are replaced with the period's start (inclusive) and end (exclusive) as SQL expressions. For comparisons the same query is run again with the range shifted back (`N DAY`, `N WEEK`, `N MONTH`).
- For `today`, comparisons are cut at the same time of day.
- Item templates use `{column}` or `{column|format}`; formats are `number`, `currency`, `percent`, `text`. Values are HTML-escaped.
- List options: `ranked`, `bullet` (line prefix, `""` for none), `totalColumn` (adds "…and N more"), `emptyText` (otherwise empty lists are hidden).
- Put conditional logic in SQL, e.g. `IF(stock <= 0, '🔴', '🟠') AS icon`.
- Set `enabled: false` to turn a report off. Try a single report with `npm start -- --test-run=<id>`.
- The config is validated on startup; mistakes are reported with their exact location, e.g.
  `reports[0] (daily).sections[0].metrics[1]: unknown format "money"`.

The shipped config targets the sample schema in [db/schema.sql](db/schema.sql):

| Table | Columns used |
|---|---|
| `orders` | `id`, `amount`, `status` (`cancelled` is excluded), `created_at` |
| `order_items` | `order_id`, `product_id`, `quantity`, `unit_price` |
| `products` | `id`, `name`, `stock`, `critical_stock` |

> Instant alerts (below) still use these tables directly; see [src/services/alerts.js](src/services/alerts.js).

## Usage

```bash
npm start      # start the service; reports run on their schedules
npm run dev    # same, but also sends every enabled report immediately (development mode)
npm start -- --test-run=daily   # send only the given report(s) now (comma-separated)
npm start -- --alert-check      # also run the alert checks once right away
npm run seed   # (re)generate sample data
npm test       # unit tests (no database needed)
```

> **Windows PowerShell:** if you get `running scripts is disabled on this system`, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `npm.cmd run dev`.

## Deployment

The service has to run on a machine that is always on, typically a small VPS (1 vCPU / 512 MB RAM is plenty). Pick one of the options below.

### Option A: Docker (recommended)

```bash
git clone https://github.com/sefazcy/b2b-auto-reporter.git && cd b2b-auto-reporter
cp .env.example .env && nano .env      # fill in DB + Telegram settings
docker compose up -d --build
docker compose logs -f                 # check it started
```

- `restart: unless-stopped` brings it back after crashes and server reboots.
- Alert state is kept in the `reporter-data` volume, so rebuilding doesn't resend alerts.
- Update to a new version: `git pull && docker compose up -d --build`.
- `config/` is mounted read-only, so after editing `config/reports.yml` a `docker compose restart` is enough.
- **Database on the same server:** inside the container `127.0.0.1` is the container itself. Use `DB_HOST=host.docker.internal`, make MySQL listen on that interface, and create the user for the Docker network (e.g. `'reporter_ro'@'172.%'`) instead of `@'localhost'`.

### Option B: pm2

```bash
npm ci --omit=dev
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup                # start on boot
pm2 logs b2b-auto-reporter
```

### Remote database

If the database is on another server, don't expose MySQL to the internet. Prefer, in order:
1. A private network / VPN between the two servers
2. An SSH tunnel: `ssh -N -L 3307:127.0.0.1:3306 user@db-server`, then `DB_HOST=127.0.0.1`, `DB_PORT=3307`
3. If 3306 must be open, allow only this server's IP in the firewall and require TLS

Always connect with a user that only has `SELECT` rights.

### Monitoring (recommended)

If the service crashes, it can't tell you about it, and "no report today" looks like "no sales today". To catch that:

1. Create a free check on [healthchecks.io](https://healthchecks.io) (or Uptime Kuma, Better Stack…) with a period of **15 minutes** and a grace time of ~10 minutes.
2. Put its ping URL in `HEARTBEAT_URL`.
3. Connect the check to Telegram or email in the monitor's settings.

The service pings after every alert check and report, and pings `<url>/fail` when a run fails. When pings stop, the monitor alerts you.
(If `ALERTS_ENABLED=false`, the only ping is the daily report, so set the period to 1 day.)

## Environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` enables the `--test-run` flag |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection (use a read-only user) |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_CHAT_ID` | Chat or group ID that receives the report |
| `REPORTS_CONFIG` | Path to the reports file (default `config/reports.yml`) |
| `REPORT_CRON_SCHEDULE` | Fallback schedule for reports without `schedule` (default `0 19 * * *`) |
| `REPORT_TIMEZONE` | Timezone for the schedule (default `Europe/Istanbul`) |
| `REPORT_CURRENCY` | ISO currency code for amounts (default `TRY`) |
| `ALERTS_ENABLED` | `false` disables instant alerts (default `true`) |
| `ALERT_CRON_SCHEDULE` | How often alerts are checked (default `*/15 * * * *`) |
| `ALERT_NO_ORDER_HOURS` | Hours without orders before alerting (default `3`, decimals allowed) |
| `ALERT_BUSINESS_HOURS` | Hours when silence counts, e.g. `9-18` (end exclusive) |
| `ALERT_BUSINESS_DAYS` | ISO weekdays, e.g. `1-5` (Mon–Fri) or `1-6` |
| `ALERT_STATE_FILE` | Where sent alerts are remembered (default `data/alert-state.json`) |
| `HEARTBEAT_URL` | Optional monitor URL pinged after each run (`/fail` appended on failure) |

> Silence is only counted from the start of business hours, so a quiet night never triggers an alert at 09:00.

## Project structure

```
config/
└── reports.yml                  # report definitions (queries, templates, schedules)
db/
├── schema.sql                   # sample tables: products, orders, order_items
└── seed.js                      # sample data generator
src/
├── config/db.js                 # MySQL pool + connection check
├── config/reports.js            # loads and validates reports.yml
├── services/periods.js          # periods, {{from}}/{{to}}, comparison shifts
├── services/reportEngine.js     # runs a report's queries
├── services/reportFormatter.js  # renders the message (pure functions)
├── services/notifier.js         # Telegram delivery
├── services/alerts.js           # alert checks and decision logic
├── services/alertState.js       # remembers sent alerts across restarts
├── services/heartbeat.js        # dead man's switch ping
├── jobs/reportJob.js            # one cron job per report
├── jobs/alertJob.js             # alert check cron job
└── index.js                     # entry point
test/                            # node:test unit tests
```

## Roadmap

- [x] Comparison with yesterday / same day last week (▲▼ %)
- [x] Top-selling products
- [x] Low-stock alerts in the daily report
- [x] Instant alerts during the day (stock hits zero, no orders for hours)
- [x] Config-driven reports (define queries without code changes)
- [ ] Weekly summary report
- [ ] Additional channels (email, WhatsApp)
