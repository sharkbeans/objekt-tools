# Tencent Cloud Lighthouse — PostgreSQL Setup Guide

This guide walks through provisioning a PostgreSQL instance on Tencent Cloud Lighthouse
using **Ubuntu + Docker + Docker Compose** (recommended), extracting the `DATABASE_URL`,
running the schema migration, and updating Vercel.

---

## Part 1 — Create a Lighthouse Instance (Ubuntu)

### 1.1 Log in and open Lighthouse

1. Go to [console.cloud.tencent.com](https://console.cloud.tencent.com)
2. In the top search bar, type **Lighthouse** and click **轻量应用服务器 (Lighthouse App Service)**
3. Click **新建 (New)** in the top-left of the instance list

### 1.2 Configure the instance

On the creation page:

| Field | Value |
|-------|-------|
| Region | Singapore (新加坡) — see Part 9 for region guidance |
| Image type | **系统镜像 (OS image)** |
| OS image | **Ubuntu 22.04 LTS** (or 24.04) |
| Spec | 2 vCPU / 2 GB RAM minimum; 4 GB RAM if running multiple projects |
| Storage | 20–40 GB SSD |
| Traffic | Bundled monthly traffic (default) is fine |
| Instance name | e.g. `db-server` |

Click **立即购买 (Buy now)** and complete payment.

> Wait 1–3 minutes for the instance status to show **运行中 (Running)**.

> **Alternative:** If you prefer not to use Docker, you can pick **应用镜像 (App image)** →
> **PostgreSQL** instead. Skip to the bare-metal path in the Appendix at the bottom of
> this document.

---

## Part 2 — Open the Firewall for PostgreSQL

By default Lighthouse blocks all ports except 22/80/443.

1. From the instance list, click your instance name
2. Click the **防火墙 (Firewall)** tab
3. Click **添加规则 (Add Rule)**
4. Fill in:
   - Protocol: **TCP**
   - Port: **5432**
   - Source: `0.0.0.0/0`
   - Policy: **Allow**
5. Click **确定 (Confirm)**

---

## Part 3 — SSH into the Instance

### Option A — Web terminal (easiest, no setup)

1. On the instance detail page, click **登录 (Login)** in the top-right
2. A browser-based terminal opens — you are already root

### Option B — SSH from your machine

```bash
ssh ubuntu@<YOUR_LIGHTHOUSE_IP>
# or root, depending on what you set during creation
```

Find your **public IP** on the instance detail page under **公网IP (Public IP)**.

---

## Part 4 — Install Docker

Run these commands once on the fresh Ubuntu instance:

```bash
# Update package index
sudo apt update && sudo apt upgrade -y

# Install Docker via the official convenience script
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group so you don't need sudo every time
sudo usermod -aG docker $USER

# Apply the group change without logging out
newgrp docker

# Verify
docker --version
```

---

## Part 5 — Write the docker-compose.yml

Create a directory for your DB config:

```bash
mkdir -p ~/postgres && cd ~/postgres
nano docker-compose.yml
```

Paste this content — **replace the password**:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: your-strong-password-here
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

> **Why no `POSTGRES_USER` or `POSTGRES_DB`?** Omitting them defaults to user `postgres`
> and an initial database `postgres`. You will create per-project databases manually in
> Part 6. This keeps the compose file generic and reusable across projects.

---

## Part 6 — Start Postgres and Create the Database

```bash
# Start the container in the background
docker compose up -d

# Verify it's running
docker ps
# Should show the postgres container with status "Up"

# Open a psql shell inside the container
docker exec -it postgres psql -U postgres

# Inside psql — create the database for this project
CREATE DATABASE objekt_trade;

# Verify
\l

# Exit
\q
```

### Adding a second project later

Each new project just gets its own database (and optionally its own user):

```sql
CREATE USER myproject WITH PASSWORD 'another-password';
CREATE DATABASE myproject_db OWNER myproject;
GRANT ALL PRIVILEGES ON DATABASE myproject_db TO myproject;
```

No new containers, no firewall changes — just a new `DATABASE_URL` pointing at the same IP
with a different database name.

---

## Part 7 — Build the DATABASE_URL

```
postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require
```

**SSL note:** The Docker Postgres image does not come with a signed TLS cert by default.
The codebase uses `ssl: { rejectUnauthorized: false }` when `sslmode=require` is in the URL,
which enables encryption without strict cert validation — correct for self-hosted Postgres.

If the connection still fails with SSL errors, try `?sslmode=no-verify` as a fallback.
Do **not** use `sslmode=disable` in production.

---

## Part 8 — Test the Connection Locally

Before touching Vercel, verify the URL works from your machine:

```bash
psql "postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require"
```

You should get a `psql` prompt. If connection is refused:
- Recheck the Lighthouse firewall rule (Part 2) — port 5432 must be open
- Check the container is running: `docker ps` on the server
- Check Docker is actually publishing the port: `docker inspect postgres | grep -A5 Ports`

---

## Part 9 — Run the Schema Migration

Once the connection test passes, run the Drizzle migration against the new host:

```bash
# In your local objekt-trade repo
DATABASE_URL="postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require" npm run db:migrate
```

Verify:

```bash
psql "postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require" \
  -c "\dt"
```

You should see all tables: `user`, `session`, `trade_post`, `active_trade`, etc.

---

## Part 10 — Update Vercel Environment Variables

### 10.1 Navigate to Vercel project settings

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click your **objekt-trade** project
3. Click **Settings** (top tab) → **Environment Variables** (left sidebar)

### 10.2 Update DATABASE_URL

Find the existing `DATABASE_URL` entry.

For **Production**:
1. Click **...** → **Edit**
2. Replace the value with the URL from Part 7
3. Make sure only **Production** environment is checked (not Preview)
4. Click **Save**

For **Preview** (`testing` branch):
- Keep Preview pointing at Neon if you want to test on the new DB in production only first
- Or scope the same Lighthouse URL to Preview as well

### 10.3 Redeploy

1. Go to the **Deployments** tab
2. Find the latest production deployment
3. Click **...** → **Redeploy**

> The build command `drizzle-kit migrate && next build` runs `db:migrate` on every deploy.
> Since the schema was already applied in Part 9, this will be a no-op on the first redeploy.

---

## Part 11 — Smoke Test

- [ ] Load the trade board — posts appear
- [ ] Log in via Discord — session persists
- [ ] Open an existing trade or create a new one
- [ ] Check `/api/active-trades` returns data
- [ ] Check Vercel function logs (dashboard → **Logs**) for any `connection refused` or SSL errors

---

## Rollback Plan

Revert `DATABASE_URL` in Vercel back to the Neon URL and redeploy. The Neon database is
untouched — no data was deleted or modified during this migration.

---

## Part 12 — Pull the Updated Env Locally

```bash
npm run vercel:env:pull:production
# or for the testing branch preview:
npm run vercel:env:pull:preview
```

---

## Part 13 — Migrating to a Different Region (e.g. Singapore)

Do this if you provisioned in the wrong region or latency is too high.

### Why region matters

Vercel serverless functions execute in the region you configure. Every API route makes at
least one DB query, so DB-to-function round-trip latency is directly visible in response times.

| Vercel function region | Best Lighthouse region |
|------------------------|----------------------|
| `iad1` — US East (default) | No Tencent region close — consider a US provider instead |
| `sin1` — Singapore | Singapore (新加坡) |
| `hkg1` — Hong Kong | Hong Kong (香港) or Singapore |
| `nrt1` — Tokyo | No direct Tencent Lighthouse region — Singapore is next closest |

If your users are primarily in Asia, **Singapore on both sides** is the recommended setup.

---

### 13.1 Change Vercel's Function Region

1. Vercel dashboard → your project → **Settings** → **Functions** (left sidebar)
2. Under **Function Region**, open the dropdown
3. Select **Singapore (sin1)**
4. Click **Save**
5. Redeploy (push a commit, or **Deployments** → **...** → **Redeploy**)

---

### 13.2 Provision a New Lighthouse Instance in Singapore

You cannot change the region of an existing instance — create a new one.

1. Lighthouse → **新建 (New)**
2. On the region selector at the top, change to **新加坡 (Singapore)**
3. Complete Parts 1–6 of this guide on the new instance
4. Note the new **公网IP**

---

### 13.3 Migrate Data from the Old Instance

If the old instance has live data you want to keep:

```bash
# On the OLD server — dump to file
docker exec postgres pg_dump -U postgres objekt_trade > /tmp/objekt_trade_backup.sql

# On your LOCAL machine — copy down
scp root@<OLD_IP>:/tmp/objekt_trade_backup.sql ./objekt_trade_backup.sql

# Copy up to the NEW server
scp ./objekt_trade_backup.sql root@<NEW_IP>:/tmp/objekt_trade_backup.sql

# On the NEW server — restore
docker exec -i postgres psql -U postgres objekt_trade < /tmp/objekt_trade_backup.sql
```

If you're OK with schema-only (no data to preserve):

```bash
DATABASE_URL="postgresql://postgres:<password>@<NEW_IP>:5432/objekt_trade?sslmode=require" npm run db:migrate
```

---

### 13.4 Update DATABASE_URL and Redeploy

Follow Part 10.2 with `<NEW_IP>`, then redeploy (Part 10.3).

---

### 13.5 Decommission the Old Instance

After the smoke test passes and 24 hours have elapsed:

1. Lighthouse instance list → click old instance
2. **更多操作 (More actions)** → **销毁/退还 (Destroy/Return)**
3. Confirm

---

### Latency Check After Migration

1. Vercel dashboard → **Logs** tab → filter by **Functions**
2. Compare durations on `/api/active-trades` or `/api/trades` before and after

---

## Summary

| Item | Where to get it |
|------|----------------|
| Lighthouse public IP | Instance detail page → 公网IP |
| PostgreSQL password | Set in `docker-compose.yml` (Part 5) |
| Database name | Created in psql in Part 6 |
| Port | `5432` (opened in Lighthouse firewall, Part 2) |
| Full `DATABASE_URL` | Assembled in Part 7 |

---

## Appendix — Bare-Metal PostgreSQL (No Docker)

Use this path only if you chose the **应用镜像 → PostgreSQL** image in Part 1 instead of Ubuntu.

### A.1 Get the public IP and SSH in (same as Parts 2–3)

### A.2 Set the PostgreSQL password

```bash
sudo -i -u postgres
psql
ALTER USER postgres WITH PASSWORD 'your-strong-password-here';
CREATE DATABASE objekt_trade;
\q
exit
```

### A.3 Allow remote connections

```bash
# Find config — usually /etc/postgresql/15/main/postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf
```

Change:
```
#listen_addresses = 'localhost'
```
to:
```
listen_addresses = '*'
```

```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

Add at the bottom:
```
host    all    all    0.0.0.0/0    scram-sha-256
```

```bash
sudo systemctl restart postgresql
```

### A.4 Adding a second project's database

```bash
sudo -i -u postgres
psql
CREATE USER myproject WITH PASSWORD 'another-password';
CREATE DATABASE myproject_db OWNER myproject;
GRANT ALL PRIVILEGES ON DATABASE myproject_db TO myproject;
\q
exit
```

Then continue from Part 7 of the main guide.
