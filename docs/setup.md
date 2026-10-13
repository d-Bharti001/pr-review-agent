# Setup

Two ways to run the app: Docker Compose (any machine with Docker), or directly on a server with systemd (no Docker). The last part describes the CI/CD pipeline that deploys to the server.

## Prepare

#### GitHub App

1. Create a GitHub App with the `pull_request` event. It needs read access to contents and pull requests, and write access to pull request comments. Set the webhook URL to `https://<your-host>/webhook` and use a webhook secret.
2. Download the private key (`.pem`). The app reads it from the path in `GITHUB_PRIVATE_KEY_PATH`.
3. Install the App on the repositories to review. Keep it private ("Only on this account") unless you want others to use your LLM key.

#### Configuration

Copy `.env.example` to `.env` and fill in the GitHub App and LLM values.

## Setup with Docker

```bash
docker compose up --build
```

This starts MySQL and Redis, runs the migrations, and starts the server (port 3031, `GET /health`) and the worker. Put the private key at `secrets/private-key.pem`; the compose file mounts `./secrets` read-only.

- View logs: `docker compose logs -f server worker`
- Stop everything: `docker compose down`; add `-v` to also delete the database and queue data.
- Containers cannot reach `localhost` on the machine. For Ollama running on the machine, use `LLM_BASE_URL=http://host.docker.internal:11434/v1` and an arbitrary api key `LLM_API_KEY=xyz`.

## Local development

Start only MySQL and Redis from the compose file (`docker compose up -d mysql redis`), then:

```bash
npm run migrate:up
npm run dev           # webhook server
npm run dev:worker    # review worker
```

**Receiving GitHub webhooks locally (ngrok):**

1. Start the app, then run `ngrok http 3031`.
2. Copy the forwarding URL that ngrok prints (`https://....ngrok-free.app`).
3. In the GitHub App settings, set the Webhook URL to `<forwarding URL>/webhook`.
4. Open or update a pull request. The delivery appears in the App's **Advanced** tab, under **Recent deliveries**.

The URL changes each time ngrok restarts; to keep it fixed, claim the free static domain in your ngrok account (Domains) and start the tunnel with `ngrok http --url=<your-domain> 3031`.

## Setup with systemd (no Docker)

For an Ubuntu or Debian server. Run the commands on the server as a user with `sudo`, unless a step says otherwise. Replace `DOMAIN_NAME`, `SERVER_IP` and `DB_PASSWORD`. After this one-time setup, every deployment is done by the GitHub Actions workflow (see the next section).

The files used here are in `deploy/`: `systemd/` (two services), `nginx/pr-review.conf` and `deploy.sh` (run on the server by the pipeline).

**1. Preparations**

- A domain with an A record that points to the server's IP (GitHub webhooks need a public HTTPS URL).
- Ports 22, 80 and 443 open:
    ```bash
    sudo ufw allow OpenSSH
    sudo ufw allow 'Nginx Full'
    sudo ufw enable
    ```

**2. Swap space, if required (small servers run out of memory easily)**

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**3. Package installations**

```bash
sudo apt update
sudo apt install -y mysql-server redis-server git ripgrep nginx curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Below command should print /usr/bin/node, which is the path in the systemd units.
# If nvm is installed and the output isn't `/usr/bin/node`, try running
# `/usr/bin/node --version` to ensure successful installation.
which node
```

`git` and `ripgrep` are used by the pr-review worker.

**4. The `deploy` user and its SSH key**

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo mkdir -p /opt/pr-review/releases /opt/pr-review/secrets
sudo chown -R deploy:deploy /opt/pr-review
```

- On **your computer**, create a key that only GitHub Actions will use:

    ```bash
    ssh-keygen -t ed25519 -f deploy_key -C "github-actions-deploy-digitalocean" -N ""
    ```

- On the server, put the content of `deploy_key.pub` into `authorized_keys` of the `deploy` user (needs `sudo`):

    ```bash
    sudo mkdir -p /home/deploy/.ssh
    echo 'CONTENT_OF_deploy_key.pub' | sudo tee /home/deploy/.ssh/authorized_keys
    sudo chmod 700 /home/deploy/.ssh
    sudo chmod 600 /home/deploy/.ssh/authorized_keys
    sudo chown -R deploy:deploy /home/deploy/.ssh
    ```

    Check from your computer that `ssh -i deploy_key deploy@SERVER_IP` logs in without a password.

- Put the info into GitHub secrets (refer section [`#github-settings`](#github-settings))
    - Put the content of `deploy_key` into the GitHub secret `DEPLOY_SSH_KEY`, then delete the local copy.
    - Put the output of `ssh-keyscan -H SERVER_IP` into the GitHub secret `DEPLOY_KNOWN_HOSTS`.

**5. MySQL Database**

Settings for a small server, in `/etc/mysql/mysql.conf.d/zz-small.cnf`:

```ini
[mysqld]
bind-address = 127.0.0.1
innodb_buffer_pool_size = 128M
performance_schema = OFF
max_connections = 30
```

```bash
sudo systemctl restart mysql
sudo mysql <<'SQL'
CREATE DATABASE pr_review CHARACTER SET utf8mb4;
CREATE USER 'pr_review_user'@'localhost' IDENTIFIED BY 'DB_PASSWORD';
GRANT ALL PRIVILEGES ON pr_review.* TO 'pr_review_user'@'localhost';
SQL
```

`DB_PASSWORD` must be the same as the GitHub secret `MYSQL_PASSWORD`. The tables are created by the migrations during the first deployment.

**6. Redis**

Keep jobs on disk and use a bounded amount of memory (BullMQ needs `noeviction`):

```bash
sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
printf 'maxmemory 128mb\nmaxmemory-policy noeviction\n' | sudo tee -a /etc/redis/redis.conf
sudo systemctl restart redis-server
```

It listens on `127.0.0.1` only by default; leave it that way.

**7. systemd services**

Run on **your computer**, from the repo root:

```bash
scp deploy/systemd/*.service YOUR_USER@SERVER_IP:/tmp/
```

On the server:

```bash
sudo mv /tmp/pr-review-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pr-review-server pr-review-worker   # they start at the first deployment
```

Let the `deploy` user restart only these two services without a password:

```bash
which systemctl   # use this path below if it is not /usr/bin/systemctl
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart pr-review-server pr-review-worker' | sudo tee /etc/sudoers.d/pr-reviewer
sudo chmod 440 /etc/sudoers.d/pr-reviewer
sudo visudo -c
```

The worker service waits up to 6 minutes on a restart, so an active review can finish.

**8. Nginx and HTTPS**

A TLS certificate is needed for `DOMAIN_NAME` as two files on the server: the **full chain** certificate and the private key. GitHub checks the certificate of the webhook URL, so a self-signed, expired or incomplete one makes deliveries fail.

Put the files in a folder only root can read, for example:

```bash
sudo mkdir -p /etc/ssl/pr-review
sudo mv name.cert.pem name.key.pem /etc/ssl/pr-review/
sudo chmod 600 /etc/ssl/pr-review/name.key.pem
```

In `deploy/nginx/pr-review.conf` (on your computer), replace `DOMAIN_NAME` in both `server` blocks and set `ssl_certificate` and `ssl_certificate_key` to those file paths. Then run on **your computer**:

```bash
scp deploy/nginx/pr-review.conf YOUR_USER@SERVER_IP:/tmp/
```

On the server:

```bash
sudo mv /tmp/pr-review.conf /etc/nginx/sites-available/pr-review
sudo ln -s /etc/nginx/sites-available/pr-review /etc/nginx/sites-enabled/pr-review
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` fails if a certificate path is wrong. Do not reload until it passes. Only `POST /webhook` is forwarded to the app; every other path returns 404.

## CI/CD

The workflow is `.github/workflows/ci.yml`.

| Event                        | What runs                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Pull request to `main`       | `check`: typecheck, build, unit tests and integration tests (the runner has the Docker that Testcontainers needs) |
| Push to `main` (a merged PR) | `check` again, then `deploy` after it passes **and** you approve it                                               |

A merge into `main` is a push to `main`, so that is what deploys. A PR that is only open never deploys.

### What `deploy` does

1. Builds in CI (a small server can run out of memory during `tsc`) and packs the release.
2. Writes the `.env` file and the GitHub App key from the secrets and variables below.
3. Uploads the release, `.env`, key and `deploy/deploy.sh` to a temporary `incoming` folder on the server over SSH.
4. Runs `deploy/deploy.sh` on the server, which:
    1. unpacks the release into `releases/<commit>` and installs the production dependencies;
    2. checks that the new settings are valid, and stops here if not (the running version is untouched);
    3. runs the database migrations;
    4. switches the `current` symlink to the new release and restarts both services;
    5. checks `/health` for about 30 seconds. If it never answers, it points `current` back to the previous release, restores the previous `.env` and fails the job.
5. Keeps the last 3 releases.

### GitHub settings

In the repository, create the environment `production` (Settings, Environments) and add yourself as a **required reviewer** (that is the approval step). Add these to the environment:

- **Secrets:** `GH_APP_WEBHOOK_SECRET`, `GH_APP_PRIVATE_KEY` (the whole `.pem`), `MYSQL_PASSWORD`, `LLM_API_KEY`, `LANGSMITH_API_KEY`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`.
- **Variables:** `GH_APP_ID`, `PORT` (`3031`), `MYSQL_HOST` and `MYSQL_PORT` (`127.0.0.1`, `3306`), `REDIS_HOST` and `REDIS_PORT` (`127.0.0.1`, `6379`), `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `BATCH_TOKEN_BUDGET`, `LANGSMITH_TRACING`, `LANGSMITH_PROJECT`, `LANGSMITH_ENDPOINT`, `DEPLOY_USER` (`deploy`), `DEPLOY_HOST` (the server's IP or domain).

GitHub does not allow names that start with `GITHUB_`, which is why the app values are called `GH_APP_*`. The workflow turns them into the `GITHUB_*` settings the app expects. To add a new setting to the app, add it to `.env.example`, to the "Generate .env" step of the workflow, and to the environment.

The Nginx file (`proxy_pass`) has the app's port written in it, so keep it equal to the `PORT` variable.

Also set the GitHub App's webhook URL to `https://DOMAIN_NAME/webhook`.

### First deployment and checks

Merge a pull request into `main` and approve the deployment in GitHub. Then, on the server:

```bash
systemctl status pr-review-server pr-review-worker
journalctl -u pr-review-worker -f
curl http://127.0.0.1:3031/health
```

Open a test pull request. In the GitHub App's "Advanced" tab, the recent deliveries should show a `200`.

To roll back by hand, point `/opt/pr-review/current` at an older folder in `releases/` and restart the two services.

### Changing a setting

Update the secret or variable in the `production` environment, then open the **Actions** tab, choose **CI/CD**, click **Run workflow** on `main`, and approve the deployment. The server's `.env` is rewritten on every deployment, so do not edit it on the server.
