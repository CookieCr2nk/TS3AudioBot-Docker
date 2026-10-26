#!/bin/bash
# The .NET Core 3.1 host exits before Main when it cannot load ICU.
# libicu70 is on the default loader path. If this host still cannot load it,
# start again with invariant globalization so the API listens.
set -u

bot=/opt/TS3AudioBot/TS3AudioBot
args=(--non-interactive --stats-disabled)
log=/tmp/ts3audiobot-start.log

"$bot" "${args[@]}" >"$log" 2>&1 &
pid=$!

stop() {
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  exit 143
}
trap stop TERM INT

ready=0
for _ in $(seq 1 20); do
  if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:58913/; then
    ready=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ] && kill -0 "$pid" 2>/dev/null; then
  ready=1
fi

if [ "$ready" -eq 1 ]; then
  tail -n +1 -F "$log" &
  tailpid=$!
  trap 'kill -TERM "$pid" 2>/dev/null || true; kill "$tailpid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; exit 143' TERM INT
  wait "$pid"
  code=$?
  kill "$tailpid" 2>/dev/null || true
  exit "$code"
fi

wait "$pid" 2>/dev/null || true
if grep -q "Couldn't find a valid ICU package" "$log"; then
  cat "$log" >&2
  echo "ts3audiobot: ICU package was not loaded; restarting with invariant globalization" >&2
  export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
  exec "$bot" "${args[@]}"
fi

cat "$log" >&2
exit 1
