#!/usr/bin/env bash
# start-china-service.sh
# Starts the china-fundamentals-service (FastAPI on port 8002).
# Designed to be called from the dev script alongside Node.js.
# If Python service fails to start, it logs clearly but does NOT kill Node.js.

set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "$0")/../china-fundamentals-service" && pwd)"
LOG_PREFIX="[china-fundamentals-service]"
PORT=8002

echo "$LOG_PREFIX Starting on port $PORT..."
echo "$LOG_PREFIX Service dir: $SERVICE_DIR"

# Check Python dependencies
PY_SITE="/usr/local/lib/python3.11/dist-packages"
if [ ! -d "$PY_SITE/fastapi" ] || [ ! -d "$PY_SITE/uvicorn" ] || [ ! -d "$PY_SITE/baostock" ] || [ ! -d "$PY_SITE/akshare" ] || [ ! -d "$PY_SITE/efinance" ]; then
  echo "$LOG_PREFIX WARNING: Missing Python dependencies. Installing..."
  sudo /usr/bin/python3.11 -m pip install baostock akshare efinance fastapi uvicorn --quiet || {
    echo "$LOG_PREFIX ERROR: Failed to install dependencies. CN fundamentals will be unavailable."
    exit 0  # exit 0 so parent process continues
  }
fi

# Kill any existing instance on port 8002
if lsof -ti:$PORT >/dev/null 2>&1; then
  echo "$LOG_PREFIX Killing existing process on port $PORT..."
  kill $(lsof -ti:$PORT) 2>/dev/null || true
  sleep 1
fi

# Start uvicorn
# Use explicit python3.11 -m uvicorn to avoid Python version collision.
# pnpm child process may inherit /opt/.manus/.sandbox-runtime/.venv paths (Python 3.13),
# causing SRE module mismatch when /usr/local/bin/uvicorn is called directly.
# Explicitly clearing PYTHONPATH and using python3.11 ensures deterministic interpreter.
cd "$SERVICE_DIR"
env -i \
  HOME="$HOME" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  PYTHONPATH="" \
  PYTHONHOME="" \
  /usr/bin/python3.11 -m uvicorn main:app \
  --host 0.0.0.0 \
  --port $PORT \
  --log-level info \
  --no-access-log \
  2>&1 | sed "s/^/$LOG_PREFIX /" &

UVICORN_PID=$!
echo "$LOG_PREFIX Started with PID $UVICORN_PID"

# Wait briefly and verify it started
sleep 3
if kill -0 $UVICORN_PID 2>/dev/null; then
  echo "$LOG_PREFIX OK — service is running (PID $UVICORN_PID)"
else
  echo "$LOG_PREFIX WARNING — service failed to start. CN fundamentals will be unavailable."
  exit 0  # exit 0 so parent process continues
fi

# Keep script alive (background process)
wait $UVICORN_PID || {
  echo "$LOG_PREFIX Service exited unexpectedly. CN fundamentals unavailable."
  exit 0
}
