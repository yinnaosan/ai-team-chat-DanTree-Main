#!/usr/bin/env bash
# start-china-service.sh
# Starts the china-fundamentals-service (FastAPI on port 8001).
# Designed to be called from the dev script alongside Node.js.
# If Python service fails to start, it logs clearly but does NOT kill Node.js.

set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "$0")/../china-fundamentals-service" && pwd)"
LOG_PREFIX="[china-fundamentals-service]"
PORT=8001

echo "$LOG_PREFIX Starting on port $PORT..."
echo "$LOG_PREFIX Service dir: $SERVICE_DIR"

# Check Python dependencies
if ! python3 -c "import fastapi, uvicorn, baostock, akshare, efinance" 2>/dev/null; then
  echo "$LOG_PREFIX WARNING: Missing Python dependencies. Installing..."
  pip3 install baostock akshare efinance fastapi uvicorn --quiet || {
    echo "$LOG_PREFIX ERROR: Failed to install dependencies. CN fundamentals will be unavailable."
    exit 0  # exit 0 so parent process continues
  }
fi

# Kill any existing instance on port 8001
if lsof -ti:$PORT >/dev/null 2>&1; then
  echo "$LOG_PREFIX Killing existing process on port $PORT..."
  kill $(lsof -ti:$PORT) 2>/dev/null || true
  sleep 1
fi

# Start uvicorn
cd "$SERVICE_DIR"
python3 -m uvicorn main:app \
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
