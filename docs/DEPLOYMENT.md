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
`JWT_SECRET`, `NODE_ENV=production`, `APP_URL` (attachment capability-URLs are built from it).
**2026-08-07 (second pass, same day)**: email sending was removed entirely — document recipients
get in-app bell notifications only, so no email env var exists anymore (`EMAIL_CRED_SECRET`,
which briefly replaced `RESEND_API_KEY`/`EMAIL_FROM` that morning, is gone too; a leftover value
in `.env` is harmless and simply ignored). No outbound SMTP port is needed.
When migrating from the Vercel demo, copy the values out of the Vercel project settings; keeping
the same `JWT_SECRET` preserves live sessions, changing it just logs everyone out once.

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

### Google Drive (rclone) — the configured off-site target (added 2026-09-11)

The owner's Google account has 2 TB and a folder named **`backup server`** at the root of My
Drive. `scripts/backup-to-gdrive.sh` (committed) dumps the database, tars the config, uploads
both there and prunes old copies. **The server does not have the repo checked out** (it only
pulls images — see Docker below), so the script is *copied* onto it; re-copy it after editing it
here.

**1. Install rclone on the server**

```bash
curl https://rclone.org/install.sh | sudo bash    # or: apt install rclone (older, still fine)
rclone version
```

**2. Authorize Google Drive.** The server has no browser, so the OAuth step happens on the
Windows machine and the token is pasted back. On the server run `rclone config` and answer:
`n` (new remote) → name **`gdrive`** → storage **`drive`** → `client_id`/`client_secret` blank
(see the rate-limit note below) → scope **`1`** (full access — scope `drive.file` cannot see a
folder it did not create, so it cannot write into the existing `backup server` folder) →
`root_folder_id`/`service_account_file` blank → `Edit advanced config? n` →
**`Use auto config? n`**. rclone then prints a command like `rclone authorize "drive" "…"`.

On Windows, download rclone from <https://rclone.org/downloads/>, unzip, and run *that exact
command* in PowerShell (`.\rclone.exe authorize "drive" "…"`). A browser opens, sign in as the
owner's Google account, allow access; PowerShell prints a long token blob. Paste it back into the
server prompt, answer `n` to "configure this as a Shared Drive", `y` to keep, `q` to quit.

Check it: `rclone lsd gdrive:` must list `backup server`.

> ⚠️ **A blank `client_id` is a temporary state, not a permanent one.** It falls back to rclone's
> shared Google API credentials, which rclone itself now warns about on every run:
> *"this remote uses rclone's shared Google Drive client_id, which is being retired and will stop
> working during 2026"* (seen 2026-09-11). It is also throttled. **Create an own OAuth client
> before it cuts out**: Google Cloud Console → new project → enable *Google Drive API* → OAuth
> consent screen, External, add the owner's address as a test user → Credentials → OAuth client
> ID, type *Desktop app*. Then on the server `rclone config` → `e` (edit) → `gdrive` → paste the
> id and secret → re-authorize (same headless flow as above). Nothing else changes; the Drive
> folder, the script and cron stay as they are.

**3. Install the script and schedule it**

```bash
scp scripts/backup-to-gdrive.sh root@<server>:/usr/local/bin/tcs-erp-backup   # from the dev machine
ssh root@<server> 'chmod +x /usr/local/bin/tcs-erp-backup'
timedatectl set-timezone Asia/Bangkok        # cron times below are local time
STACK_DIR=/opt/tcs-erp /usr/local/bin/tcs-erp-backup   # first run, watch it finish
crontab -e                                   # then add:
# 0 2 * * *  STACK_DIR=/opt/tcs-erp /usr/local/bin/tcs-erp-backup >> /var/log/tcs-erp-backup.log 2>&1
```

`STACK_DIR` is the directory holding `docker-compose.yml`/`.env`/`nginx/` — everything else has a
default and is overridable the same way (`REMOTE`, `KEEP_DAILY_DAYS`, `KEEP_MONTHLY_DAYS`,
`KEEP_LOCAL_DAYS`, `LOCAL_DIR`, `LOG_FILE`). The remote default is `gdrive:backup server`, which
is why the remote **must** be named `gdrive` unless `REMOTE` is set.

What ends up on Drive:

```
backup server/daily/    db-YYYY-MM-DD_HHMM.archive.gz + config-…tar.gz   kept 30 days
backup server/monthly/  the 1st-of-month run                             kept ~13 months
```

The script fails loudly (non-zero exit, message in `/var/log/tcs-erp-backup.log`) if the dump is
not valid gzip, is under 100 KB, or if the uploaded byte count on Drive does not match the local
file. It takes a `flock` so a slow run is never overlapped by the next night's.

⚠️ `config-*.tar.gz` contains `.env` (JWT secret, Mongo password) and the TLS private key. It is
in the owner's private Drive folder — **do not share that folder with anyone**, and keep it out of
any link-shared parent.

**Restore** (onto a fresh server, after `docker compose up -d`):

```bash
rclone copy "gdrive:backup server/daily/db-2026-09-11_0200.archive.gz" .
docker compose exec -T mongodb sh -c 'mongorestore \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --archive --gzip --drop' < db-2026-09-11_0200.archive.gz
```

`--drop` replaces each collection as it restores, so restoring over a running stack is
destructive — take a fresh dump first. **Test a restore at least once** on a throwaway machine;
an untested backup is not a backup.

## Updating the app

```bash
git pull && npm install && npm run build && pm2 restart tcs-erp   # or systemctl restart tcs-erp
```

## Docker (added 2026-08-06 — the fully self-contained option)

An alternative to the PM2/nginx-on-the-host setup above: the stack is **two images from one
committed `Dockerfile` (2026-08-07: two targets)** plus MongoDB —

- target **`app`** → the Express API (`npm ci` + `npm run build`, pruned runtime layer)
- target **`web`** → nginx with `nginx/nginx.conf` AND the built frontend (`dist/`) baked in;
  nginx serves the SPA directly (immutable `/assets/` caching, no-cache `index.html`, gzip) and
  proxies only `/api/` to the app container
- **MongoDB** (named volume `mongo_data`, starts empty → Setup Wizard on first visit)

**Build & push happen on the dev machine; the server only pulls** (registry: Docker Hub
`thaics/tcserp-app` + `thaics/tcserp-web` — ⚠️ the compose file must reference the SAME names you
push, or `docker compose pull` silently keeps running the old images and "nothing changes"):

```bash
docker build --target app -t thaics/tcserp-app:latest .
docker build --target web -t thaics/tcserp-web:latest .
docker push thaics/tcserp-app:latest && docker push thaics/tcserp-web:latest
# then on the server:
docker compose pull && docker compose up -d
```

- **`docker-compose.yml` is deliberately NOT committed** (owner request) — the complete reference
  copy is below; recreate it from here on a new machine.
- Only `nginx/certs/` is a volume mount (self-git-ignored, and excluded from the build context via
  `.dockerignore` — keys are never baked in; mounted read-only at `/etc/nginx/certs`). Expected
  filenames (owner's naming, 2026-08-06): **`huma-erp.com.pem`** (certificate/fullchain) +
  **`huma-erp.com.key`** (private key). A self-signed pair for testing:
  `openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout nginx/certs/huma-erp.com.key -out nginx/certs/huma-erp.com.pem -subj "/CN=huma-erp.com"`
- **MongoDB runs with authentication** (2026-08-06): the container initializes its root user from
  `MONGO_USER`/`MONGO_PASS` in `.env` (mapped to the mongo image's `MONGO_INITDB_ROOT_*` vars),
  and the app's connection string is built from the same values (`authSource=admin`).
  ⚠️ The root user is only created on a **fresh volume** — changing the values later needs
  `docker compose down -v` (wipes data) or a manual password change in mongosh. Keep `MONGO_PASS`
  URL-safe (letters/digits) since it's embedded in the URI.
- Env: the `app` service loads `.env` via `env_file` (JWT_SECRET, APP_URL
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
    image: thaics/tcserp-app:latest
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
    image: thaics/tcserp-web:latest
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
(everything incl. attachments is in MongoDB), and copy the file off-machine. This is exactly what
`scripts/backup-to-gdrive.sh` automates — see [Backups → Google Drive (rclone)](#google-drive-rclone--the-configured-off-site-target-added-2026-09-11)
rather than rolling a one-off cron line.

## Relationship to the Vercel demo

**Decommissioned as of the ~2026-08-07 cutover** — the Vercel deployment is no longer used
(`vercel.json` + the `api/` file layout are left untouched, only as a fallback deploy target if
ever needed again). Production runs solely on the standalone Express server described in this
file, on a self-hosted VPS with a self-hosted MongoDB instance (not the old Atlas cluster the
Vercel demo used). See [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) step H.
