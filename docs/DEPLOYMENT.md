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
built from it), and — for email — `EMAIL_CRED_SECRET` (**2026-08-07**, encrypts users' stored Gmail
App Passwords; replaces the removed `RESEND_API_KEY`/`EMAIL_FROM` — email now sends from each
user's own Gmail, see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients").
When migrating from the Vercel demo, copy the values out of the Vercel project settings; keeping
the same `JWT_SECRET` preserves live sessions, changing it just logs everyone out once. Rotating
`EMAIL_CRED_SECRET` never breaks login, but every user must re-enter their App Password. The host
must allow **outbound TCP 465** (Gmail SMTP).

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

## Docker (added 2026-08-06 — the fully self-contained option)

An alternative to the PM2/nginx-on-the-host setup above: `docker compose up -d --build` runs the
whole stack — the app image (committed `Dockerfile`, multi-stage: `npm ci` + `npm run build`, then
a pruned runtime layer), **its own MongoDB** (named volume `mongo_data`, starts empty → Setup
Wizard on first visit), and **nginx** for HTTPS termination.

- **`docker-compose.yml` is deliberately NOT committed** (owner request) — the complete reference
  copy is below; recreate it from here on a new machine.
- **`nginx/` IS committed**: `nginx/nginx.conf` (HTTP→HTTPS redirect, TLS, 30 MB body limit,
  `X-Forwarded-For` for login rate limiting) is **baked into a custom nginx image** at build time
  (`nginx/Dockerfile`: `COPY nginx.conf /etc/nginx/conf.d/default.conf`; compose uses
  `build: ./nginx` — owner request 2026-08-06, for the server deployment). After editing the conf,
  `docker compose up -d --build`. Only `nginx/certs/` stays a volume mount (self-git-ignored, and
  excluded from the image via `nginx/.dockerignore` — keys are never baked in; mounted read-only
  at `/etc/nginx/certs`). Expected filenames (owner's naming, 2026-08-06): **`huma-erp.com.pem`**
  (certificate/fullchain) + **`huma-erp.com.key`** (private key). A self-signed pair for testing:
  `openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout nginx/certs/huma-erp.com.key -out nginx/certs/huma-erp.com.pem -subj "/CN=huma-erp.com"`
- **MongoDB runs with authentication** (2026-08-06): the container initializes its root user from
  `MONGO_USER`/`MONGO_PASS` in `.env` (mapped to the mongo image's `MONGO_INITDB_ROOT_*` vars),
  and the app's connection string is built from the same values (`authSource=admin`).
  ⚠️ The root user is only created on a **fresh volume** — changing the values later needs
  `docker compose down -v` (wipes data) or a manual password change in mongosh. Keep `MONGO_PASS`
  URL-safe (letters/digits) since it's embedded in the URI.
- Env: the `app` service loads `.env` via `env_file` (JWT_SECRET, APP_URL, EMAIL_CRED_SECRET
  pass straight through) and compose interpolation additionally requires
  `JWT_SECRET`/`MONGO_USER`/`MONGO_PASS` (hard error at `up` if missing). `MONGODB_URI` in the
  `environment` block always overrides any value from `.env` — inside compose the app talks to
  the compose MongoDB (to target Atlas instead, drop the `mongodb` service and set the URI in
  `environment`).
- Verified 2026-08-06 (twice — before and after auth was added): full `up -d --build` on the dev
  machine — `GET /api/auth/session` → `{"user":null,"needsSetup":true}` through nginx HTTPS,
  frontend 200, HTTP→HTTPS 301, `/api/quotes` → 401 JSON; with auth on: unauthenticated
  `db.stats()` inside the container → `Unauthorized`, root login with the `.env` credentials →
  `ping ok:1`, app connects via the authenticated URI.

Reference `docker-compose.yml` (keep in sync with the local untracked copy):

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: "3001"
      MONGODB_URI: mongodb://${MONGO_USER:?put MONGO_USER in .env}:${MONGO_PASS:?put MONGO_PASS in .env}@mongodb:27017/?authSource=admin
      MONGODB_DB: ${MONGODB_DB:-tcs_erp}
      JWT_SECRET: ${JWT_SECRET:?put JWT_SECRET in .env next to docker-compose.yml}
      APP_URL: ${APP_URL:-https://localhost}
    depends_on:
      mongodb:
        condition: service_healthy

  mongodb:
    image: mongo:8
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:?put MONGO_USER in .env}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASS:?put MONGO_PASS in .env}
    volumes:
      - mongo_data:/data/db
    # ports:
    #   - "27017:27017"   # uncomment to reach the DB from the host (Compass, mongodump, ...)
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  nginx:
    build: ./nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - app

volumes:
  mongo_data:
```

Backups under Docker (authenticated):
`docker compose exec mongodb sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive' > backup-$(date +%F).archive`
(everything incl. attachments is in MongoDB), and copy the file off-machine.

## Relationship to the Vercel demo

The Vercel deployment keeps working unchanged (`vercel.json` + the `api/` file layout are
untouched; `server/` is an additional runtime, not a replacement) — it can stay up as a staging
environment during the transition and be decommissioned per
[SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) step H afterwards. Remember both
deployments share whatever database their `MONGODB_URI` points at.
