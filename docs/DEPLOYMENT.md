# Deployment — Standalone Server (Express)

> Added 2026-08-06, when the owner gave the go-ahead for the Express migration ("ให้ย้ายจาก vercel
> มาเป็น express เดี่ยวๆเลย"). This is the install guide for running TCS ERP on a self-managed
> server with **no Vercel involvement**. The migration's background, go-live checklist, and
> verification steps live in [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) — read that
> first when actually cutting over; this file is only the "how to run it on a machine" part.

## What runs

One Node.js process: `server/index.ts` (Express) serves both the REST API (the unchanged `api/`
handlers, routed per the same table as `vercel.json`'s rewrites — see `server/app.ts`) and the
built frontend from `dist/` with an SPA fallback. MongoDB is the only other moving part.

```
npm run dev     # local development: Express API (port 3001) + Vite dev server (port 3000, /api proxied)
npm run build   # type-checks src/ + api/ + server/, then builds the frontend into dist/
npm start       # production: one Express process serving API + dist/ (default port 3001)
```

## Requirements

- **Node.js 20+** (22/24 LTS fine)
- **MongoDB** — either keep the existing Atlas cluster (allowlist the server's IP in Atlas
  Network Access) or self-host and `mongodump`/`mongorestore` (attachments travel automatically;
  they live in normal collections)
- **HTTPS is NOT optional**: the session cookie is `secure` when `NODE_ENV=production`, so login
  breaks entirely on plain HTTP

## Install

```bash
git clone <repo> tcs-erp && cd tcs-erp
npm install
cp .env.example .env        # then fill in every value — see the comments in .env.example
npm run build
npm start                   # verify it boots, then put it under a process manager (below)
```

Required env values (full explanations in [.env.example](../.env.example)): `MONGODB_URI`,
`JWT_SECRET`, `NODE_ENV=production`, `APP_URL` (emailed links + attachment capability-URLs are
built from it), and — for email — `RESEND_API_KEY` + `EMAIL_FROM`. When migrating from the Vercel
demo, copy the values out of the Vercel project settings; keeping the same `JWT_SECRET` preserves
live sessions, changing it just logs everyone out once.

The process must run with the **project root as working directory** — the Quotation Templates
import reads `public/Scope of work new template for air pollution control_Technic.xlsx` via
`process.cwd()` (see `api/_lib/templateWorkbookParser.ts`), and `dist/` is resolved the same way.

## Keep it running (pick one)

**PM2** (simplest):

```bash
npm install -g pm2
pm2 start npm --name tcs-erp -- start
pm2 save && pm2 startup     # auto-restart on crash and on boot
```

**systemd** (`/etc/systemd/system/tcs-erp.service`):

```ini
[Unit]
Description=TCS ERP
After=network.target

[Service]
WorkingDirectory=/opt/tcs-erp
ExecStart=/usr/bin/npm start
Restart=always
User=tcs-erp

[Install]
WantedBy=multi-user.target
```

## HTTPS reverse proxy (pick one)

**Caddy** (easiest — automatic Let's Encrypt certificates, `Caddyfile`):

```
erp.example.co.th {
    reverse_proxy localhost:3001
}
```

**nginx** + certbot:

```nginx
server {
    server_name erp.example.co.th;
    client_max_body_size 30m;   # must exceed the 25 MB Express JSON limit (Service photo saves)
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # login rate limiting reads this
        proxy_set_header Host $host;
    }
}
```

Then `certbot --nginx -d erp.example.co.th`. Either way, **`X-Forwarded-For` must reach the app**
— `api/handlers/auth.ts`'s per-IP login rate limiting reads that header (Caddy sets it by
default; nginx needs the line above).

## Backups

- **Atlas**: automatic backups are a paid-tier feature; on M0 free tier, schedule your own
  `mongodump` from anywhere and keep copies off the server.
- **Self-hosted**: cron a nightly `mongodump --uri "$MONGODB_URI" --out /backup/$(date +%F)` and
  copy it off-machine. Everything — including file attachments and photos — is in MongoDB, so a
  dump is a complete backup.

## Updating the app

```bash
git pull && npm install && npm run build && pm2 restart tcs-erp   # or systemctl restart tcs-erp
```

## Relationship to the Vercel demo

The Vercel deployment keeps working unchanged (`vercel.json` + the `api/` file layout are
untouched; `server/` is an additional runtime, not a replacement) — it can stay up as a staging
environment during the transition and be decommissioned per
[SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) step H afterwards. Remember both
deployments share whatever database their `MONGODB_URI` points at.
