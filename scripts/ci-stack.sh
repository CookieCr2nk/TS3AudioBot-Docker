#!/usr/bin/env bash
# Build the bot and the panel, start them, and check that the bot API
# is reachable from the panel only. Refuses to run outside CI because
# cleanup deletes the named volume ts3audiobot-data.
set -euo pipefail

if [ "${CI:-}" != "true" ]; then
  echo "scripts/ci-stack.sh deletes the ts3audiobot-data volume and is only for GitHub Actions." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Compose pulls the GHCR tags. CI tests the images built from this
# checkout, so those tags stay local.
PULL_OVERRIDE="$(mktemp)"
cat > "$PULL_OVERRIDE" <<'EOF'
services:
  ts3audiobot:
    pull_policy: never
  panel:
    pull_policy: never
EOF

COMPOSE=(docker compose -f docker-compose.panel.yml -f "$PULL_OVERRIDE")
export PANEL_DB_PASSWORD="${PANEL_DB_PASSWORD:-ci-db-password}"
export PANEL_DB_ROOT_PASSWORD="${PANEL_DB_ROOT_PASSWORD:-ci-root-password}"
export PANEL_TOKEN_KEY="${PANEL_TOKEN_KEY:-ci-token-key-value}"
export PANEL_ADMIN_PASSWORD="${PANEL_ADMIN_PASSWORD:-ci-admin-password}"

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans || true
}
trap cleanup EXIT

BOT_IMAGE="$(awk '/image: ghcr.io\/cookiecr2nk\/ts3audiobot-docker:/{print $2; exit}' docker-compose.yml)"
PANEL_IMAGE="$(awk '/image: ghcr.io\/cookiecr2nk\/ts3audiobot-docker-panel:/{print $2; exit}' docker-compose.panel.yml)"
docker build -t "$BOT_IMAGE" .
docker build -t "$PANEL_IMAGE" ./panel
"${COMPOSE[@]}" up -d

wait_healthy() {
  local name="$1"
  local status="missing"
  for _ in $(seq 1 40); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo missing)"
    if [ "$status" = "healthy" ]; then
      echo "$name is healthy"
      return 0
    fi
    sleep 10
  done
  echo "$name did not become healthy (last status: $status)" >&2
  docker logs "$name" >&2 || true
  return 1
}

wait_healthy ts3panel-db
wait_healthy ts3panel
wait_healthy ts3audiobot

python3 - <<'PY'
import json
import subprocess
import sys

def inspect(name):
    raw = subprocess.check_output(
        ["docker", "inspect", name, "--format", "{{json .}}"],
        text=True,
    )
    return json.loads(raw)

def network_ids(doc):
    return set(doc["NetworkSettings"]["Networks"])

def published(doc):
    ports = doc["NetworkSettings"]["Ports"] or {}
    return any(ports.values())

bot = inspect("ts3audiobot")
panel = inspect("ts3panel")
db = inspect("ts3panel-db")
bot_nets = network_ids(bot)
panel_nets = network_ids(panel)
db_nets = network_ids(db)

if published(bot):
    sys.exit("bot published a host port")
if not (bot_nets & panel_nets):
    sys.exit("panel is not on the bot network")
if bot_nets & db_nets:
    sys.exit("database shares a network with the bot")
if not (panel_nets & db_nets):
    sys.exit("panel cannot reach the database network")
print("networks isolated")
PY

"${COMPOSE[@]}" exec -T panel node -e "fetch('http://ts3audiobot:58913/api/version').then(async (r) => { const body = await r.text(); console.log(r.status, body.slice(0, 180)); process.exit(r.ok ? 0 : 1); }).catch((err) => { console.error(err); process.exit(1); })"

if curl --max-time 3 --silent --output /dev/null "http://127.0.0.1:58913/api/version"; then
  echo "bot API answered on the host" >&2
  exit 1
fi

echo "stack ok"
