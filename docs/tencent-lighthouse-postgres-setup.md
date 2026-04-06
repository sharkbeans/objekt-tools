# Tencent Cloud Lighthouse — Full Docker Deployment Guide

Complete guide to migrate objekt-trade from Vercel + Neon DB to
Tencent Cloud Lighthouse running Docker Compose (Next.js app + Postgres + Redis).

**End state:** everything runs in Docker on your VPS. Vercel and Neon are fully replaced.

---

## Overview

```
GitHub repo
    ↓  git clone / git pull
Lighthouse VPS (Ubuntu)
    ├── app      (Next.js, port 3000)
    ├── postgres (Postgres 16, internal only)
    ├── redis    (Redis 7, internal only)
    ├── cron     (alpine, fires /api/cron/expire-trades at 2 AM UTC)
    └── nginx    (reverse proxy, port 80/443 → app:3000)
```

No Vercel. No Neon. Secrets live only in `.env` on the VPS — never in git.

---

## Part 1 — Provision the Lighthouse Instance

### 1.1 Create the instance

1. Go to [console.cloud.tencent.com](https://console.cloud.tencent.com)
2. Search **Lighthouse** → click **轻量应用服务器**
3. Click **新建 (New)**

| Field | Value |
|-------|-------|
| Region | Singapore (新加坡) — lowest latency for Asia |
| Image type | **系统镜像 (OS image)** |
| OS | **Ubuntu 22.04 LTS** |
| Spec | 2 vCPU / 4 GB RAM minimum |
| Storage | 40 GB SSD |
| Instance name | e.g. `objekt-trade` |

Click **立即购买** and wait ~2 minutes for status **运行中 (Running)**.

### 1.2 Note your public IP

On the instance detail page, copy the **公网IP (Public IP)**. You'll use it everywhere below as `<VPS_IP>`.

---

## Part 2 — Open the Firewall

1. Click your instance → **防火墙 (Firewall)** tab → **添加规则 (Add Rule)**
2. Add these rules:

| Protocol | Port | Source | Policy |
|----------|------|--------|--------|
| TCP | 80 | 0.0.0.0/0 | Allow |
| TCP | 443 | 0.0.0.0/0 | Allow |
| TCP | 22 | 0.0.0.0/0 | Allow |

> Do **not** open port 3000 or 5432 — those stay internal to Docker.

---

## Part 3 — SSH into the Instance

```bash
ssh ubuntu@<VPS_IP>
# If you're root: ssh root@<VPS_IP>
```

Or use the **登录 (Login)** button on the Tencent console for a browser terminal.

---

## Part 4 — Install Docker and Git

Run once on the fresh instance:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker via official script
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version

# Install git (usually pre-installed)
sudo apt install -y git
```

---

## Part 5 — Clone the Repo

```bash
cd ~
git clone https://github.com/<your-github-username>/objekt-trade.git
cd objekt-trade
```

> The repo contains `Dockerfile`, `docker-compose.yml`, and `.env.docker.example`
> but **no secrets**. You add secrets in the next step.

---

## Part 6 — Create the .env File (Secrets)

This is the only place secrets live. The file stays on the VPS only — never committed to git.

```bash
cp .env.docker.example .env
nano .env
```

Fill in every value. Reference table:

| Variable | How to get it |
|----------|--------------|
| `POSTGRES_PASSWORD` | Make up a strong password (16+ chars) |
| `DATABASE_URL` | `postgresql://postgres:<POSTGRES_PASSWORD>@postgres:5432/objekt_trade?sslmode=disable` — use the compose service name `postgres`, not an IP |
| `BETTER_AUTH_SECRET` | Run `openssl rand -hex 32` on any machine |
| `BETTER_AUTH_URL` | Your public domain e.g. `https://trade.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | Same as `BETTER_AUTH_URL` |
| `DISCORD_CLIENT_ID` | [Discord Developer Portal](https://discord.com/developers/applications) → your app → OAuth2 |
| `DISCORD_CLIENT_SECRET` | Same location |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → your app → Bot → Reset Token |
| `DISCORD_INVITE_URL` | Your community server invite link |
| `DISCORD_GUILD_ID` | Right-click your Discord server icon → Copy Server ID |
| `CRON_SECRET` | Run `openssl rand -hex 32` on any machine |

Optional (leave blank to disable):

| Variable | Notes |
|----------|-------|
| `INDEXER_DATABASE_URL` | External Cosmo indexer DB — leave blank if unused |
| `PUSHER_*` | Leave all blank — app falls back to polling |

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

### Verify the file looks right

```bash
# Should print your DATABASE_URL — confirm it has the right password and host "postgres"
grep DATABASE_URL .env
```

---

## Part 7 — Point Your Domain at the VPS

Before setting up HTTPS you need DNS in place.

1. In your DNS provider, create an **A record**:
   - Name: `trade` (or `@` for apex)
   - Value: `<VPS_IP>`
   - TTL: 300
2. Wait for propagation (usually 1–5 min with low TTL):
   ```bash
   # From your local machine — should return your VPS IP
   nslookup trade.yourdomain.com
   ```

> If you don't have a domain yet, you can temporarily use `http://<VPS_IP>:3000` — skip
> Part 8 and set `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` to `http://<VPS_IP>:3000`.
> Discord OAuth requires HTTPS for production, so get a domain eventually.

---

## Part 8 — Set Up Nginx + HTTPS (Certbot)

Nginx sits in front of the app and terminates TLS. The app container never needs to handle certs.

### 8.1 Install Nginx and Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 8.2 Create a minimal Nginx config

```bash
sudo nano /etc/nginx/sites-available/objekt-trade
```

Paste (replace `trade.yourdomain.com`):

```nginx
server {
    listen 80;
    server_name trade.yourdomain.com;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/objekt-trade /etc/nginx/sites-enabled/
sudo nginx -t        # should print "syntax is ok"
sudo systemctl reload nginx
```

### 8.3 Issue a TLS certificate

```bash
sudo certbot --nginx -d trade.yourdomain.com
```

Follow the prompts. Certbot edits the Nginx config to add HTTPS and sets up auto-renewal.

### 8.4 Verify HTTPS works

```bash
curl -I https://trade.yourdomain.com
# Should return HTTP/2 200 (or 502 until the app is running — that's fine for now)
```

---

## Part 9 — Build and Start the Stack

Back in the `~/objekt-trade` directory:

```bash
# Build the app image (this runs drizzle-kit migrate + next build inside the container)
# Takes 3–5 minutes on first run
docker compose build

# Start everything
docker compose up -d

# Watch the logs — wait for "Ready" from the app container
docker compose logs -f app
```

When you see:
```
objekt-trade-app  |  ✓ Ready in Xs
```

the app is live.

### Check all containers are healthy

```bash
docker compose ps
```

All four services (`postgres`, `redis`, `app`, `cron`) should show `healthy` or `running`.

---

## Part 10 — Verify the Deployment

```bash
# Health endpoint
curl https://trade.yourdomain.com/api/health
# → {"ok":true}

# Check the app loads
curl -I https://trade.yourdomain.com
# → HTTP/2 200
```

In a browser:
- [ ] Trade board loads
- [ ] Discord login works
- [ ] Create or open a trade
- [ ] Check `/api/active-trades` returns data

---

## Part 11 — Migrate Data from Neon (if needed)

If your Neon DB has live data you want to keep, do this **before** switching Discord OAuth
and telling users about the new URL.

### 11.1 Dump from Neon

On your **local machine**:

```bash
# Get your Neon DATABASE_URL from Vercel env vars or Neon dashboard
pg_dump "<NEON_DATABASE_URL>" \
  --no-owner --no-acl \
  -f neon_backup.sql
```

### 11.2 Copy to VPS and restore

```bash
# Upload to VPS
scp neon_backup.sql ubuntu@<VPS_IP>:~/objekt-trade/

# SSH in
ssh ubuntu@<VPS_IP>
cd ~/objekt-trade

# Restore into the running Postgres container
docker exec -i objekt-trade-postgres \
  psql -U postgres objekt_trade \
  < neon_backup.sql
```

### 11.3 Verify row counts

```bash
docker exec -it objekt-trade-postgres psql -U postgres objekt_trade \
  -c "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

---

## Part 12 — Update Discord OAuth Redirect URL

Discord only allows OAuth callbacks from URLs you've whitelisted.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Select your app → **OAuth2**
3. Under **Redirects**, add:
   ```
   https://trade.yourdomain.com/api/auth/callback/discord
   ```
4. Click **Save Changes**
5. Remove or keep the old Vercel redirect — keeping it won't break anything

---

## Part 13 — Cut Over from Vercel

Once the VPS deployment is confirmed working:

1. Update your domain's DNS A record to point at `<VPS_IP>` (already done in Part 7 if you set it up fresh)
2. In Vercel: **Settings → Domains** — remove the custom domain so it stops serving traffic
3. Optionally delete the Vercel project entirely

Neon data is still intact until you delete it — keep it as a backup for a few days.

---

## Part 14 — Ongoing Operations

### Deploy a new version

```bash
# On the VPS
cd ~/objekt-trade
git pull

# Rebuild and restart (downtime ~30s)
docker compose build app
docker compose up -d app
```

### View logs

```bash
docker compose logs -f app       # app logs
docker compose logs -f cron      # cron job logs
docker compose logs postgres      # DB logs
```

### Access the database directly

```bash
docker exec -it objekt-trade-postgres psql -U postgres objekt_trade
```

### Backup Postgres

```bash
docker exec objekt-trade-postgres \
  pg_dump -U postgres objekt_trade \
  > ~/backups/objekt_trade_$(date +%Y%m%d).sql
```

Set up a cron on the VPS to run this nightly:

```bash
crontab -e
# Add:
0 3 * * * docker exec objekt-trade-postgres pg_dump -U postgres objekt_trade > /home/ubuntu/backups/objekt_trade_$(date +\%Y\%m\%d).sql
```

### Restart a single service

```bash
docker compose restart app
```

### Rotate a secret

```bash
nano ~/objekt-trade/.env   # update the value
docker compose up -d app   # restarts only the app with new env
```

---

## Part 15 — Rollback Plan

If anything goes wrong before cutover:

- Vercel is still live — just don't update the DNS
- Neon data is untouched

If you've already cut over and need to revert:

1. Point DNS back to Vercel's IP (found in Vercel → Settings → Domains)
2. Re-add the domain in Vercel
3. Vercel redeploys automatically on the next git push, or trigger manually

---

## Appendix — File Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | 3-stage build: install deps → build (runs migrations) → minimal runner |
| `docker-compose.yml` | Defines postgres, redis, app, cron services |
| `.env.docker.example` | Template — copy to `.env` on the VPS, fill in secrets |
| `.dockerignore` | Keeps node_modules, .env, .git out of the image |
| `next.config.ts` | `output: "standalone"` enables the minimal Docker runner |
| `src/app/api/health/route.ts` | `/api/health` used by Docker HEALTHCHECK |

## Appendix — Why .env only on the VPS?

The `.env` file contains database passwords, Discord secrets, and auth keys. It must never be committed to git. The workflow is:

```
git repo  →  has .env.docker.example (safe template, committed)
VPS       →  has .env (real secrets, created manually, never leaves the server)
```

`docker compose` reads `.env` automatically from the same directory as `docker-compose.yml`.
