# Running Stiltje on your VPS (Rocky Linux 9)

The finished setup:

```
browser ──HTTPS──▶ nginx (gtd.hevosmaa.net) ──▶ 127.0.0.1:8787 Stiltje (systemd, user "gtd")
                                                   └─ /var/lib/gtd   lists, uploads, login, backups
```

- **The app is never reachable directly.** It listens on localhost only, behind your existing nginx; rikard.me is untouched.
- **Every API call needs a signed-in session.** Signing in takes your password plus a 6-digit authenticator code, or a one-time recovery code.
- **Sessions:**
  - The session cookie is HttpOnly and SameSite=Strict, and lasts 30 days.
  - `⌘K › Sign out on every device` ends all sessions at once.
- **Failed logins:** five in a row lock that IP out for 15 minutes. nginx additionally rate-limits the login URL.
- **Placeholders:** replace `you@vps` with your SSH login (for example `rikard@203.0.113.7`). Commands marked **Mac** run on your Mac; the rest run on the VPS.

---

## 0. Mac: commit and push

The VPS installs from GitHub, so everything has to be pushed first.

```sh
cd ~/Code/gtd
git add -A
git commit -m "Ready for the VPS"
git push origin main
```

## 1. DNS

At the DNS provider for **hevosmaa.net**, add an `A` record:
- **Name:** `gtd`
- **Value:** the VPS's IPv4 address

Also add an `AAAA` record with the IPv6 address if the VPS has one.

Check that it resolves before step 6 (it can take a few minutes):

```sh
dig +short gtd.hevosmaa.net
```

## 2. Node.js and git

SSH into the VPS (`ssh you@vps`), then run:

Rocky ships its own, older Node.js. Switch that off first, so the NodeSource version 24 is the one installed:

```sh
sudo dnf module reset -y nodejs
sudo dnf module disable -y nodejs
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs git
/usr/bin/node -v          # must say v24.x (the service and sudo use this one)
```

If it shows an older version (for example v16), run `sudo dnf remove -y nodejs npm` and repeat the lines above. An old Node shows up later as `node: bad option: --import`.

## 3. Service user and folders

```sh
sudo useradd --system --home-dir /var/lib/gtd --shell /sbin/nologin gtd
sudo install -d -o gtd -g gtd -m 700 /var/lib/gtd
sudo install -d -o $USER -g $USER -m 755 /opt/gtd
```

## 4. Give the VPS read access to the repo, then clone it

The repo is private, so the VPS gets its own **read-only deploy key**. It can pull this one repo and nothing else, and can never push.

```sh
ssh-keygen -t ed25519 -f ~/.ssh/gtd_deploy -N "" -C "gtd deploy key (VPS)"
cat >> ~/.ssh/config <<'CFG'
Host github-gtd
  HostName github.com
  User git
  IdentityFile ~/.ssh/gtd_deploy
  IdentitiesOnly yes
CFG
chmod 600 ~/.ssh/config
cat ~/.ssh/gtd_deploy.pub
```

On GitHub, open **rikhev/gtd → Settings → Deploy keys → Add deploy key**:
- Paste the key.
- Name it "VPS".
- **Leave "Allow write access" off.**

Back on the VPS, clone and build:

```sh
ssh -T github-gtd            # answer "yes" once; it should greet you with "rikhev/gtd"
git clone github-gtd:rikhev/gtd.git /opt/gtd
cd /opt/gtd && npm ci && npm run build
```

## 5. Start the app, then set up your login

```sh
sudo cp /opt/gtd/deploy/gtd.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gtd
systemctl status gtd          # should be "active (running)"
```

Set your password and authenticator. It asks you questions, so type the answers:

```sh
cd /opt/gtd
sudo -u gtd env GTD_DATA_DIR=/var/lib/gtd node --import tsx server/auth-setup.ts
```

- Choose a password of at least 12 characters. A passphrase of four or five words is ideal.
- Scan the QR code with your authenticator app.
- Type the code it shows to confirm.
- **Write down the 8 recovery codes.** They are your way back in if you lose your phone.

## 6. nginx and HTTPS

Your existing nginx gets one new file. It doesn't touch the rikard.me config.

```sh
sudo mkdir -p /etc/nginx/snippets
sudo cp /opt/gtd/deploy/gtd-proxy.conf /etc/nginx/snippets/gtd-proxy.conf
sudo cp /opt/gtd/deploy/nginx-gtd.conf /etc/nginx/conf.d/gtd.hevosmaa.net.conf
sudo setsebool -P httpd_can_network_connect 1      # SELinux: let nginx forward to the app
sudo nginx -t && sudo systemctl reload nginx
```

Now the certificate. If `certbot --version` already works (you probably use it for rikard.me), skip the install line:

```sh
sudo dnf install -y epel-release && sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d gtd.hevosmaa.net
```

certbot adds the HTTPS part and the redirect from http to https to that file. If it asks whether to redirect, choose **redirect**. Renewal is automatic, the same as for rikard.me.

The firewall should already allow the web ports, since rikard.me is served. To check:

```sh
sudo firewall-cmd --list-services     # should include http and https
```

If they're missing: `sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload`. Port 8787 must **not** be opened; the app only listens on localhost.

## 7. First sign-in

1. Open **https://gtd.hevosmaa.net** and sign in with your password and authenticator code.

## 8. Nightly backups

```sh
sudo cp /opt/gtd/deploy/gtd-backup.service /opt/gtd/deploy/gtd-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gtd-backup.timer
sudo systemctl start gtd-backup.service && sudo ls /var/lib/gtd/backups    # test it once
```

- Each night at 03:30 it saves a consistent copy of the database, your uploads and the login settings.
- It keeps 14 days of backups.
- They are stored on the same disk. To survive losing the VPS, copy `/var/lib/gtd/backups` somewhere else now and then.

---

## Deploying updates

Mac, once: tell the deploy script which server to use.

```sh
git config gtd.deployHost you@vps
```

From then on, after making changes:

```sh
git commit -am "What changed"
./deploy/deploy.sh
```

`deploy.sh` checks that you're on `main` with everything committed. It then pushes to GitHub and runs `/opt/gtd/deploy/update.sh` on the VPS, which:

1. **Pulls** `main` (fast-forward only; it refuses if files were edited on the server).
2. **Installs** dependencies, but only when `package-lock.json` changed.
3. **Updates** the systemd unit files if they changed in the repo.
4. **Builds and restarts**, then checks that the app answers.
5. **Rolls back automatically** to the previous commit if the new version doesn't come up, and shows the last log lines.

The service runs on Stockholm time (`Environment=TZ=Europe/Stockholm` in `gtd.service`), so the app's "today" turns at your midnight; change it there if you move. Calendar appointments are shown in your browser's time zone either way.

Your data, uploads and login live in `/var/lib/gtd` and are never touched by a deploy. `./deploy/deploy.sh --force` rebuilds even if nothing changed. On the server itself, `/opt/gtd/deploy/update.sh` does the same without the push.

The script asks for your sudo password to restart the service. To skip that, allow just these commands without a password, with `sudo visudo -f /etc/sudoers.d/gtd` (replace `you` with your VPS username):

```
you ALL=(root) NOPASSWD: /usr/bin/systemctl restart gtd, /usr/bin/systemctl daemon-reload, /usr/bin/cp /opt/gtd/deploy/gtd*.service /etc/systemd/system/*, /usr/bin/cp /opt/gtd/deploy/gtd*.timer /etc/systemd/system/*
```

## If something doesn't work

| What you see | What to do |
|---|---|
| **502 Bad Gateway** | Most likely SELinux: run `sudo setsebool -P httpd_can_network_connect 1`. Otherwise the app isn't running: `systemctl status gtd`. |
| **`nginx -t` fails** | Read the line it names. If it mentions `gtd_login` twice, the file was copied into `conf.d` twice; keep one. |
| **certbot can't verify the domain** | DNS isn't ready yet (`dig +short gtd.hevosmaa.net` must show the VPS address) or port 80 is closed in firewalld. |
| **The app won't start** | `journalctl -u gtd -n 50` shows why. |

## Everyday tasks

| Task | Command |
|---|---|
| Deploy an update | Mac: commit, then `./deploy/deploy.sh` |
| See logs, including failed logins | `journalctl -u gtd -f` |
| Change password | `cd /opt/gtd && sudo -u gtd env GTD_DATA_DIR=/var/lib/gtd node --import tsx server/auth-setup.ts --password` |
| New recovery codes | the same, with `--recovery` |
| Sign out every browser | the same, with `--signout` |
| Lost your phone: new authenticator | the same, with `--reset` (a new QR code and new recovery codes) |

## Moving your Mac data up (optional)

If you've already been using the app locally, stop it on the Mac, then copy the data across:

```sh
rsync -a ~/Code/gtd/data/gtd.sqlite ~/Code/gtd/data/files you@vps:/tmp/gtd-import/
ssh -t you@vps 'sudo systemctl stop gtd && sudo cp -r /tmp/gtd-import/* /var/lib/gtd/ && sudo chown -R gtd:gtd /var/lib/gtd && sudo restorecon -R /var/lib/gtd && sudo systemctl start gtd && rm -rf /tmp/gtd-import'
```

(`rsync` needs to be on the VPS: `sudo dnf install -y rsync`.)

## Running locally still works as before

`npm run dev` on the Mac has no login; it only listens on localhost. The login switches on automatically in production (`NODE_ENV=production`). You can also force it on with `GTD_AUTH=1`, or off with `GTD_AUTH=0`.
