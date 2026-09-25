# Running In-Tray on your VPS

The finished setup looks like this:

```
browser ──HTTPS──▶ nginx or Caddy (gtd.rikard.me) ──▶ 127.0.0.1:8787 In-Tray (systemd, user "gtd")
                                                        └─ /var/lib/gtd   lists, uploads, login, API key, backups
```

- **The app is never reachable directly.** It listens on localhost only.
- **Every API call needs a signed-in session.** Signing in takes your password plus a 6-digit authenticator code, or a one-time recovery code.
- **Sessions:**
  - The session cookie is HttpOnly and SameSite=Strict, and lasts 30 days.
  - `⌘K › Sign out on every device` ends all sessions at once.
- **Failed logins:** five in a row lock that IP out for 15 minutes. nginx additionally rate-limits the login URL.
- **Commands** are written for Debian or Ubuntu with a sudo user. Replace `you@vps` with your SSH login.

---

## 1. DNS (when njal.la is back)

Add an `A` record for `gtd.rikard.me` pointing at the VPS's IPv4 address, plus an `AAAA` record if it has IPv6. HTTPS in step 6 only works once this name resolves:

```sh
dig +short gtd.rikard.me
```

## 2. Node.js 24 (skip if `node -v` already says v22.13 or newer)

```sh
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs rsync
```

## 3. Service user and folders

```sh
sudo useradd --system --home-dir /var/lib/gtd --shell /usr/sbin/nologin gtd
sudo install -d -o gtd -g gtd -m 700 /var/lib/gtd
sudo install -d -o $USER -g $USER -m 755 /opt/gtd
```

## 4. Copy the app up and build it (from your Mac)

```sh
cd ~/Code/gtd
./deploy/push.sh you@vps
```

This command:
- copies the code to `/opt/gtd`
- runs `npm ci` and `npm run build` on the server
- restarts the service

On this first run the service doesn't exist yet, so the restart at the end fails. That's expected; step 5 creates the service. Later updates are just this one command.

## 5. Install the service, then set up the login

```sh
sudo cp /opt/gtd/deploy/gtd.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gtd
systemctl status gtd          # should say: login required
```

Set your password and authenticator. Run this on the server; it's interactive:

```sh
cd /opt/gtd
sudo -u gtd env GTD_DATA_DIR=/var/lib/gtd node --import tsx server/auth-setup.ts
```

- Choose a password of at least 12 characters. A passphrase of four or five words is ideal.
- Scan the QR code with your authenticator app.
- Type the code it shows to confirm.
- **Write down the 8 recovery codes.** They are your way back in if you lose your phone.

## 6. Reverse proxy and HTTPS

**If the VPS runs Caddy.** Append `deploy/Caddyfile` to `/etc/caddy/Caddyfile`. Caddy fetches the certificate itself.

```sh
sudo sh -c 'cat /opt/gtd/deploy/Caddyfile >> /etc/caddy/Caddyfile'
sudo systemctl reload caddy
```

**If the VPS runs nginx.**

```sh
sudo cp /opt/gtd/deploy/gtd-proxy.conf /etc/nginx/snippets/gtd-proxy.conf
sudo cp /opt/gtd/deploy/nginx-gtd.conf /etc/nginx/sites-available/gtd.rikard.me
sudo ln -s /etc/nginx/sites-available/gtd.rikard.me /etc/nginx/sites-enabled/
sudo apt-get install -y certbot python3-certbot-nginx     # if not installed already
sudo certbot --nginx -d gtd.rikard.me                     # fills in the certificate lines
sudo nginx -t && sudo systemctl reload nginx
```

If a firewall is on, only 22, 80 and 443 need to be open. Port 8787 must stay closed; it only listens on localhost anyway.

```sh
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

## 7. First sign-in

1. Open **https://gtd.rikard.me** and sign in with your password and authenticator code.
2. Go to **Settings → Claude → API key** and paste your key. It's checked with Claude, then stored in `/var/lib/gtd/.env`, which only the `gtd` user can read.

## 8. Nightly backups

```sh
sudo cp /opt/gtd/deploy/gtd-backup.service /opt/gtd/deploy/gtd-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gtd-backup.timer
sudo systemctl start gtd-backup.service && ls /var/lib/gtd/backups    # test it once
```

- Each night at 03:30 it saves a consistent copy of the database, your uploads and the login settings.
- It keeps 14 days of backups.
- They are stored on the same disk. To survive losing the VPS, copy `/var/lib/gtd/backups` somewhere else now and then.

---

## Everyday tasks

| Task | Command |
|---|---|
| Deploy an update | `./deploy/push.sh you@vps` (from the Mac) |
| See logs, including failed logins | `journalctl -u gtd -f` |
| Change password | `cd /opt/gtd && sudo -u gtd env GTD_DATA_DIR=/var/lib/gtd node --import tsx server/auth-setup.ts --password` |
| New recovery codes | the same, with `--recovery` |
| Sign out every browser | the same, with `--signout` |
| Lost your phone: new authenticator | the same, with `--reset` (a new QR code and new recovery codes) |

## Moving your Mac data up (optional)

If you've already been using the app locally, stop it on the Mac, then copy the data across:

```sh
rsync -a ~/Code/gtd/data/gtd.sqlite ~/Code/gtd/data/files you@vps:/tmp/gtd-import/
ssh you@vps 'sudo systemctl stop gtd && sudo cp -r /tmp/gtd-import/* /var/lib/gtd/ && sudo chown -R gtd:gtd /var/lib/gtd && sudo systemctl start gtd && rm -rf /tmp/gtd-import'
```

## Running locally still works as before

`npm run dev` on the Mac has no login; it only listens on localhost. The login switches on automatically in production (`NODE_ENV=production`). You can also force it on with `GTD_AUTH=1`, or off with `GTD_AUTH=0`.
