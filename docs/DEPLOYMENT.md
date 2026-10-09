# Deployment Guide

Production deployment of T.E.R.M. Edu on a single Ubuntu VM (20.04 / 22.04 / 24.04) using **Node.js 20**, **PM2** and **Nginx**.

The Express server serves both the REST API and the pre-built React client from `server/public`, so only one process needs to run.

---

## 1. Prepare the server

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx git
npm install -g pm2
```

## 2. Get the code and build

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/milansingla/Termedu-LMS.git termedu
cd termedu

npm ci --prefix client
npm run build --prefix client        # outputs to server/public
npm ci --prefix server --omit=dev
```

## 3. Configure environment

```bash
cp server/.env.example server/.env
nano server/.env
```

Minimum required values:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key (server-side only) |
| `ALLOWED_ORIGIN` | Public origin, e.g. `https://app.yourdomain.com` |

Third-party keys (Daily.co, Gemini, SMTP, Firebase) can be entered later from **Admin → Settings**; they are stored in the Supabase `settings` table and loaded at runtime without a restart.

## 4. Initialise the database

Run `server/database/schema.sql` in the Supabase SQL editor (and `migration.sql` for existing installs). Optionally seed legacy JSON data:

```bash
node server/migrate.js
```

## 5. Start with PM2

```bash
cd /var/www/termedu/server
pm2 start index.js --name termedu --max-memory-restart 512M --time
pm2 save
pm2 startup
```

## 6. Nginx reverse proxy

```bash
cp /var/www/termedu/deploy/nginx/termedu.conf /etc/nginx/sites-available/termedu
nano /etc/nginx/sites-available/termedu      # set server_name
ln -sf /etc/nginx/sites-available/termedu /etc/nginx/sites-enabled/termedu
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

## 7. DNS and HTTPS

Add an `A` record pointing your domain (e.g. `app`) to the VM's IP, then:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d app.yourdomain.com
```

## 8. Firewall

```bash
ufw allow 22 && ufw allow 80 && ufw allow 443
ufw enable
```

---

## Updating

```bash
cd /var/www/termedu
git pull
npm ci --prefix client && npm run build --prefix client
npm ci --prefix server --omit=dev
pm2 restart termedu
```

## Operations

| Command | Purpose |
|---|---|
| `pm2 status` | Process status |
| `pm2 logs termedu` | Live logs |
| `pm2 restart termedu` | Restart after changes |
| `pm2 monit` | CPU / memory monitor |
| `curl localhost:8080/health` | Health check |
| `certbot renew --dry-run` | Test SSL renewal |
