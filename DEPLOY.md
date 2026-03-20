# CRM Deployment Guide

## Prerequisites

- Node.js 22+ (or Docker)
- npm 10+

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite: `file:./data/crm.db` — Turso: `libsql://your-db.turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso only | Auth token from `turso db tokens create` |
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Defaults to `3000` |

## Quick Start (Local Production)

```bash
# 1. Install dependencies
npm ci

# 2. Set up environment
cp .env.example .env
# Edit .env — set DATABASE_URL="file:./data/crm.db"

# 3. Run migrations
npm run db:migrate

# 4. Build
npm run build

# 5. Start
npm start
```

The app auto-seeds demo data (10 leads, 7 tasks, 8 deals) on first run if the database is empty.

## Deployment Options

### Option A: Fly.io (Recommended — simplest)

Fly.io runs the Docker image with a persistent volume for SQLite. No external database needed.

```bash
# 1. Install Fly CLI
curl -L https://fly.io/install.sh | sh

# 2. Sign up / log in
fly auth login

# 3. Launch (creates app + volume)
fly launch --no-deploy

# 4. Create persistent volume for SQLite
fly volumes create crm_data --size 1 --region iad

# 5. Deploy
fly deploy

# 6. Run migrations (first time only)
fly ssh console -C "npx prisma migrate deploy"

# 7. Open
fly open
```

Cost: ~$0 on the free tier (shared-cpu-1x, 256MB).

### Option B: Docker (Any Host)

```bash
# Build
docker build -t crm .

# Run with a volume for persistent SQLite data
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="file:/data/crm.db" \
  -e NODE_ENV=production \
  -v crm_data:/data \
  --name crm \
  crm

# Run migrations (first time only)
docker exec crm npx prisma migrate deploy
```

### Option C: VPS / Bare Metal

```bash
# On server:
git clone <your-repo> /opt/crm && cd /opt/crm
npm ci --omit=dev
cp .env.example .env   # edit with production values
npm run db:migrate
npm run build
npm start
```

Use a process manager (pm2, systemd) and a reverse proxy (nginx, caddy):

```bash
# pm2
npm i -g pm2
pm2 start npm --name crm -- start
pm2 save && pm2 startup
```

```nginx
# /etc/nginx/sites-available/crm
server {
    listen 80;
    server_name crm.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option D: Turso (Hosted Database)

If you need the app on a serverless platform (Vercel, Cloudflare) or want the database hosted separately:

```bash
# 1. Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# 2. Create database
turso db create crm
turso db show crm --url    # → libsql://crm-yourorg.turso.io

# 3. Create auth token
turso db tokens create crm

# 4. Set env vars
DATABASE_URL="libsql://crm-yourorg.turso.io"
DATABASE_AUTH_TOKEN="<token>"

# 5. Push schema
npx prisma migrate deploy
```

Then deploy the Next.js app to any platform — no volume needed since the DB is remote.

## Demo Accounts

| Email | Password | Role |
|---|---|---|
| admin@crm.com | admin123 | Admin (sees all data) |
| sales@crm.com | sales123 | Sales (sees own + unassigned) |

## Post-Deployment Checklist

- [ ] `DATABASE_URL` is set and database is reachable
- [ ] `npm run db:migrate` has been run
- [ ] App starts and login page loads
- [ ] Both demo accounts can log in
- [ ] Admin sees all leads/deals, sales sees filtered subset
- [ ] Creating a lead/deal persists after page refresh
- [ ] Reset Demo Data (Settings page) works
- [ ] HTTPS is enabled (cookies use `Secure` flag automatically on HTTPS)

## Production Notes

- **Auth**: Demo-only with hardcoded credentials. For real use, replace `DEMO_USERS` in `src/context/AuthContext.tsx` with a proper auth provider.
- **Session**: Cookie-based (`crm_session`). Automatically sets `Secure; SameSite=Strict` when served over HTTPS.
- **Database**: SQLite via libSQL adapter. Works with both local files and Turso. Auto-seeds on empty database.
- **Standalone output**: `next.config.ts` uses `output: "standalone"` — the `.next/standalone` directory contains everything needed to run without `node_modules`.
