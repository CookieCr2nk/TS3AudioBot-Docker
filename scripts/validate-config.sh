#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for candidate in "${ROOT}/data/bots/default/bot.toml" "${ROOT}/config/bots/default/bot.toml"; do
  if [ -f "$candidate" ]; then
    BOT_TOML="$candidate"
    break
  fi
done

if [ -z "${BOT_TOML:-}" ]; then
  echo "error: bot.toml not found — run 'make init-data' first" >&2
  exit 1
fi

if grep -qE '^address = ""' "$BOT_TOML"; then
  echo "warn: [connect].address is still empty in $BOT_TOML" >&2
fi

if grep -qE '^key = ""' "$BOT_TOML"; then
  echo "warn: identity key is empty — generated on first connect" >&2
fi

echo "config files present"