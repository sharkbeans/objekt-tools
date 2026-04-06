# Tencent Cloud Lighthouse — PostgreSQL Setup Guide

This guide walks through provisioning a PostgreSQL instance on Tencent Cloud Lighthouse,
extracting the `DATABASE_URL`, running the schema migration, and updating Vercel.

---

## Part 1 — Create a Lighthouse Instance with PostgreSQL

### 1.1 Log in and open Lighthouse

1. Go to [console.cloud.tencent.com](https://console.cloud.tencent.com)
2. In the top search bar, type **Lighthouse** and click **轻量应用服务器 (Lighthouse App Service)**
3. Click **新建 (New)** in the top-left of the instance list

### 1.2 Configure the instance

On the creation page:

| Field         | Value                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region        | Pick the region**closest to your Vercel deployment** (Vercel defaults to US East — pick `Virginia (us-east-1)` equivalent if available, else Singapore for Asia-Pacific) |
| Image type    | **应用镜像 (App image)**                                                                                                                                                    |
| App image     | Scroll to find**PostgreSQL** (e.g. PostgreSQL 15 or 16)                                                                                                                     |
| Spec          | 2 vCPU / 2 GB RAM is fine for early stage (cheapest option)                                                                                                                       |
| Storage       | 20–40 GB SSD                                                                                                                                                                     |
| Traffic       | Bundled monthly traffic (default) is fine                                                                                                                                         |
| Instance name | e.g.`objekt-trade-db`                                                                                                                                                           |

Click **立即购买 (Buy now)** and complete payment.

> Wait 1–3 minutes for the instance status to show **运行中 (Running)**.

---

## Part 2 — Configure PostgreSQL Access

### 2.1 Open the instance management page

1. From the Lighthouse instance list, click your new instance name
2. You will land on the **实例详情 (Instance Detail)** page

### 2.2 Get the public IP

On the detail page, find **公网IP (Public IP)** — this is your DB host.
Write it down: `<YOUR_LIGHTHOUSE_IP>`

### 2.3 Open the firewall for PostgreSQL (port 5432)

By default Lighthouse blocks all ports except 22/80/443.

1. Click the **防火墙 (Firewall)** tab on the instance detail page
2. Click **添加规则 (Add Rule)**
3. Fill in:
   - Protocol: **TCP**
   - Port: **5432**
   - Source: `0.0.0.0/0` (or restrict to Vercel IP ranges if you know them)
   - Policy: **Allow**
4. Click **确定 (Confirm)**

> If you later want to lock this down, Vercel's outbound IPs are listed at
> https://vercel.com/docs/edge-network/regions — but `0.0.0.0/0` is fine to start.

### 2.4 Connect to the instance via SSH or Web Terminal

Option A — Web terminal (easiest):

1. On the instance detail page, click **登录 (Login)** in the top right
2. A browser-based terminal opens — you are already root

Option B — SSH:

```bash
ssh root@<YOUR_LIGHTHOUSE_IP>
```

Use the key pair or password you set during creation.

### 2.5 Set the PostgreSQL password

Once in the terminal:

```bash
# Switch to the postgres system user
sudo -i -u postgres

# Open the psql shell
psql

# Set a strong password for the postgres superuser
ALTER USER postgres WITH PASSWORD 'your-strong-password-here';

# Create the application database
CREATE DATABASE objekt_trade;

# Exit psql
\q

# Exit the postgres user shell
exit
```

### 2.6 Allow remote connections in PostgreSQL config

PostgreSQL on Lighthouse typically binds to localhost only by default.

```bash
# Find the config file (path depends on installed version)
sudo find /etc -name postgresql.conf 2>/dev/null
# Usually: /etc/postgresql/15/main/postgresql.conf

# Edit it
sudo nano /etc/postgresql/15/main/postgresql.conf
```

Find the line:

```
#listen_addresses = 'localhost'
```

Change it to:

```
listen_addresses = '*'
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

Then edit `pg_hba.conf` to allow password auth from any IP:

```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

Add this line at the **bottom** of the file:

```
host    all             all             0.0.0.0/0               scram-sha-256
```

Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

---

## Part 3 — Build the DATABASE_URL

Your connection string follows this format:

```
postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require
```

Filled in with what you just set up:

```
postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require
```

**SSL note:** Tencent Lighthouse Postgres does not come with a signed TLS cert by default.
The codebase is configured to use `ssl: { rejectUnauthorized: false }` when `sslmode=require`
is in the URL, which enables encryption without strict cert validation. This is the correct
setting for self-hosted Postgres. Do **not** use `sslmode=disable` in production.

If SSL still fails on connection, try `?sslmode=no-verify` as a fallback (same security
level, different syntax).

---

## Part 4 — Test the connection locally

Before touching Vercel, verify the URL works from your machine:

```bash
# Install psql locally if needed: brew install postgresql (macOS)
psql "postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require"
```

You should get a `psql` prompt. If you see a connection refused error:

- Recheck the firewall rule (Part 2.3) — port 5432 must be open
- Recheck `listen_addresses = '*'` in `postgresql.conf`
- Recheck the `pg_hba.conf` line and that PostgreSQL was restarted

---

## Part 5 — Run the schema migration

Once the connection test passes, run the Drizzle migration against the new host.

```bash
# In your local objekt-trade repo
# Temporarily point DATABASE_URL at the new Lighthouse instance

DATABASE_URL="postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require" npm run db:migrate
```

This runs `drizzle-kit migrate` which applies all migration files in `drizzle/`
and recreates the full schema (all tables, indexes, foreign keys).

Verify it worked:

```bash
psql "postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require" \
  -c "\dt"
```

You should see all the tables: `user`, `session`, `trade_post`, `active_trade`, etc.

---

## Part 6 — Update Vercel environment variables

### 6.1 Navigate to Vercel project settings

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click your **objekt-trade** project
3. Click **Settings** (top tab)
4. Click **Environment Variables** (left sidebar)

### 6.2 Update DATABASE_URL

Find the existing `DATABASE_URL` entry.

For **Production**:

1. Click the **...** menu next to `DATABASE_URL`
2. Click **Edit**
3. Replace the value with:
   ```
   postgresql://postgres:your-strong-password-here@<YOUR_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require
   ```
4. Make sure only **Production** environment is checked (not Preview)
5. Click **Save**

For **Preview** (the `testing` branch):

- You can keep Preview pointing at Neon for now if you want to test on the new DB only in production first
- Or create a separate `DATABASE_URL` scoped to Preview with the same Lighthouse URL

### 6.3 Redeploy

After saving the env var, you need to redeploy for it to take effect.

1. Go to the **Deployments** tab
2. Find the latest production deployment
3. Click **...** → **Redeploy**

> The build command `drizzle-kit migrate && next build` will run `db:migrate` against the
> new Lighthouse DB automatically on every Vercel deploy. Since the schema was already
> applied in Part 5, this will be a no-op on the first redeploy.

---

## Part 7 — Smoke test

After redeploy, verify the app works end-to-end:

- [ ] Load the trade board — posts appear
- [ ] Log in via Discord — session persists
- [ ] Open an existing trade or create a new one
- [ ] Check `/api/active-trades` returns data
- [ ] Check Vercel function logs (Vercel dashboard → Logs) for any `connection refused` or `SSL` errors

---

## Rollback plan

If anything breaks, revert `DATABASE_URL` in Vercel back to the Neon URL and redeploy.
The Neon database is untouched — no data was deleted or modified during this migration.

---

## Part 8 — Pull the updated env locally

After changing Vercel env vars, pull them down so your local tools are in sync:

```bash
npm run vercel:env:pull:production
# or for the testing branch preview:
npm run vercel:env:pull:preview
```

---

## Summary of what you will need

| Item                  | Where to get it                                    |
| --------------------- | -------------------------------------------------- |
| Lighthouse public IP  | Instance detail page → 公网IP                     |
| PostgreSQL password   | You set it in Part 2.5                             |
| Database name         | `objekt_trade` (you created it in Part 2.5)      |
| Port                  | `5432` (default, opened in firewall in Part 2.3) |
| Full `DATABASE_URL` | Assembled in Part 3                                |

---

## Part 9 — Migrating to a different region (e.g. Singapore)

Do this if you provisioned in the wrong region, or if latency is unacceptably high and
you want to move the DB closer to your users or closer to Vercel's function region.

### Why region matters

Vercel serverless functions run in the region you configure. Every API route makes at
least one DB query, so DB-to-function round-trip latency shows up directly in your
response times. As a rough guide:

| Vercel function region        | Best Lighthouse region                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| `iad1` — US East (default) | No Tencent region close — consider a US provider instead        |
| `sin1` — Singapore         | Singapore (新加坡)                                               |
| `hkg1` — Hong Kong         | Hong Kong (香港) or Singapore                                    |
| `nrt1` — Tokyo             | No direct Tencent Lighthouse region — Singapore is next closest |

If your users are primarily in Asia and you can pick the Vercel function region freely,
**Singapore on both sides** is the recommended setup.

---

### 9.1 Change Vercel's function region

Vercel runs functions in `iad1` (US East) by default. To move to Singapore:

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → your project
2. Click **Settings** → **Functions** (left sidebar)
3. Under **Function Region**, open the dropdown
4. Select **Singapore (sin1)**
5. Click **Save**
6. Trigger a new deployment (push a commit, or go to **Deployments** → **...** → **Redeploy**)

> This affects all serverless functions in the project — every API route will now
> be deployed to and execute in Singapore.

---

### 9.2 Provision a new Lighthouse instance in Singapore

You cannot change the region of an existing Lighthouse instance. You need to create a
new one.

1. Go to Lighthouse → **新建 (New)**
2. On the region selector at the top of the creation page, click the current region name
   and change it to **新加坡 (Singapore)**
3. Complete the rest of the setup exactly as in Parts 1–2 of this guide
4. Note the new instance's **公网IP**

---

### 9.3 Migrate data from the old instance to the new one

If the old instance has live data you want to keep:

**On the old instance** (SSH in):

```bash
# Dump the data as SQL
sudo -i -u postgres
pg_dump objekt_trade > /tmp/objekt_trade_backup.sql
exit

# Copy the dump to your local machine
# (run this locally, not on the server)
scp root@<OLD_LIGHTHOUSE_IP>:/tmp/objekt_trade_backup.sql ./objekt_trade_backup.sql
```

**On the new instance** (SSH in, after completing Parts 2.4–2.6 on it):

```bash
# Copy the dump to the new server
# (run this locally)
scp ./objekt_trade_backup.sql root@<NEW_LIGHTHOUSE_IP>:/tmp/objekt_trade_backup.sql

# SSH into the new server and restore
ssh root@<NEW_LIGHTHOUSE_IP>
sudo -i -u postgres
psql objekt_trade < /tmp/objekt_trade_backup.sql
exit
exit
```

If you are OK wiping data (schema-only migration, same as the initial setup):

```bash
# Just run the Drizzle migration against the new host — no dump needed
DATABASE_URL="postgresql://postgres:<password>@<NEW_LIGHTHOUSE_IP>:5432/objekt_trade?sslmode=require" npm run db:migrate
```

---

### 9.4 Update DATABASE_URL in Vercel to point at the new instance

Follow Part 6.2 of this guide, replacing the IP with `<NEW_LIGHTHOUSE_IP>`.

Then redeploy (Part 6.3).

---

### 9.5 Decommission the old instance

Once you have confirmed the new instance is healthy (smoke test from Part 7):

1. Go to Lighthouse instance list
2. Click the old instance
3. Click **更多操作 (More actions)** → **销毁/退还 (Destroy/Return)**
4. Confirm destruction

> Do not destroy the old instance until the smoke test passes. Keep it running for at
> least 24 hours after cutover as a safety net.

---

### Latency check after migration

After moving to Singapore, you can verify the round-trip improvement in Vercel logs:

1. Vercel dashboard → your project → **Logs** tab
2. Filter by **Functions**
3. Look at durations on `/api/active-trades` or `/api/trades` — should drop noticeably
   compared to a cross-continent setup
