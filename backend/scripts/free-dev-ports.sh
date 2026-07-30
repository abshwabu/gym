#!/usr/bin/env bash
# Free leftover gym `artisan serve` / Vite from prior `composer run dev` sessions.
# Only kills PIDs whose cmdline clearly belongs to this backend (not unrelated apps).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTS=(8000 5173)

is_ours() {
  local pid="$1"
  local cmd
  cmd="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)"
  [[ -z "$cmd" ]] && return 1
  if [[ "$cmd" == *"${ROOT}"* ]] && [[ "$cmd" == *"vite"* || "$cmd" == *"artisan serve"* || "$cmd" == *"server.php"* ]]; then
    return 0
  fi
  if [[ "$cmd" == *"php artisan serve --host=127.0.0.1 --port=8000"* ]]; then
    return 0
  fi
  if [[ "$cmd" == *"php -S 127.0.0.1:8000"* ]] && [[ "$cmd" == *"laravel/framework"* ]]; then
    return 0
  fi
  return 1
}

kill_pid() {
  local pid="$1"
  if ! is_ours "$pid"; then
    return 0
  fi
  echo "Stopping leftover gym/dev process pid=${pid}: $(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null | head -c 160)"
  kill -TERM "$pid" 2>/dev/null || true
  sleep 0.3
  if [[ -d "/proc/${pid}" ]]; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

for port in "${PORTS[@]}"; do
  # Prefer fuser; fall back to ss parsing.
  if command -v fuser >/dev/null 2>&1; then
    for pid in $(fuser "${port}/tcp" 2>/dev/null || true); do
      kill_pid "$pid"
    done
  fi
  if command -v ss >/dev/null 2>&1; then
    while read -r pid; do
      [[ -n "$pid" ]] && kill_pid "$pid"
    done < <(ss -tlnp "sport = :${port}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || true)
  fi
done

# Also catch vite/npm wrappers that may not hold the listen socket briefly.
while read -r pid; do
  [[ -n "$pid" ]] && kill_pid "$pid"
done < <(pgrep -f "${ROOT}/node_modules/.bin/vite" 2>/dev/null || true)

still_busy=0
for port in "${PORTS[@]}"; do
  if ss -tln "sport = :${port}" 2>/dev/null | grep -q LISTEN; then
    holders="$(ss -tlnp "sport = :${port}" 2>/dev/null || true)"
    echo "Warning: port ${port} still in use (not killed — may be unrelated):"
    echo "$holders"
    still_busy=1
  fi
done

if [[ "$still_busy" -eq 1 ]]; then
  echo "Tip: free the port or change --port / vite server.port, then update APP_URL."
fi
