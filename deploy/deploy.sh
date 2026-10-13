#!/usr/bin/env bash
#
# Runs ON THE SERVER, started by the "Release" step of .github/workflows/ci.yml.
#
# Expects:
#   APP  the app folder, e.g. /opt/pr-review
#   SHA  the commit being deployed
# and the files uploaded by the workflow in $APP/incoming:
#   release.tgz, .env, private-key.pem, deploy.sh (this file)
#
# Layout on the server:
#   $APP/releases/<time>-<short sha>   one folder per deployment
#   $APP/current          a symlink to the release that is running
#   $APP/.env             the settings of the running version
#   $APP/secrets/         the GitHub App private key
#
# The script stops at the first error (set -e). Nothing that is running changes until
# the "switch over" part, so a failure before it leaves the old version untouched.
set -euo pipefail

: "${APP:?APP is not set}"
: "${SHA:?SHA is not set}"

# Every deployment gets its own folder, even for the same commit (a redeployment after a settings
# change), so the running version is never overwritten and a failed deployment can be rolled back.
SHORT_SHA="${SHA:0:7}"
RELEASE="$APP/releases/$(date +%Y%m%d-%H%M%S)-$SHORT_SHA"
INCOMING="$APP/incoming"

# The port of the application's express server
PORT="$(grep -E '^PORT=' "$INCOMING/.env" | cut -d= -f2- | tr -d '"')"
: "${PORT:?PORT is missing in the new .env}"

# 1. Unpack the new version into its own folder and install its dependencies
mkdir -p "$APP/releases" "$APP/secrets"
mkdir "$RELEASE"
tar xzf "$INCOMING/release.tgz" -C "$RELEASE"
cd "$RELEASE"
npm ci --omit=dev --no-audit --no-fund

# 2. Check that the new settings are valid. Loading the app's config exits with an error
#    if a variable is missing or wrong, which stops the script here (the old version keeps running).
#    The key path is overridden because the new key is not installed yet.
GITHUB_PRIVATE_KEY_PATH="$INCOMING/private-key.pem" \
    node --env-file="$INCOMING/.env" build/src/config/index.js

# 3. Update the database schema
node --env-file="$INCOMING/.env" node_modules/.bin/db-migrate up

# 4. Switch over: remember what is running, install the new settings, point "current" at the
#    new release and restart. Restarting the worker waits for a running review to finish.
# (`readlink -f` would return the path itself when "current" does not exist yet, on the first deployment)
PREVIOUS=""
if [ -L "$APP/current" ]; then PREVIOUS="$(readlink -f "$APP/current")"; fi
if [ -f "$APP/.env" ]; then cp "$APP/.env" "$APP/.env.prev"; fi
install -m 600 "$INCOMING/.env" "$APP/.env"
install -m 600 "$INCOMING/private-key.pem" "$APP/secrets/private-key.pem"
ln -sfn "$RELEASE" "$APP/current"
sudo systemctl restart pr-review-server pr-review-worker

# 5. Health check: the server must answer within about 30 seconds
for _ in $(seq 1 10); do
    if curl -fsS http://127.0.0.1:$PORT/health > /dev/null; then
        echo "Deployed $SHORT_SHA"

        # Keep the 3 newest releases for rollbacks, and remove the uploaded files
        ls -1dt "$APP"/releases/* | tail -n +4 | xargs -r rm -rf
        rm -rf "$INCOMING"
        exit 0
    fi
    sleep 3
done

# 6. The new version did not come up: go back to the previous one and fail the deployment
echo "Health check failed, rolling back"
systemctl status pr-review-server pr-review-worker --no-pager || true
if [ -n "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$APP/current"
    if [ -f "$APP/.env.prev" ]; then install -m 600 "$APP/.env.prev" "$APP/.env"; fi
    sudo systemctl restart pr-review-server pr-review-worker
fi
exit 1
