#!/usr/bin/env bash
set -e

# Enable local setup wizard (never used on Vercel/Railway)
export ALLOW_SETUP=true

# Load env vars so all subprocesses inherit them
if [ -f backend/.env ]; then
  set -a
  source backend/.env
  set +a
else
  echo "[!] backend/.env not found — open http://localhost:3000/setup after services start"
fi

echo "=== Starting SoCPulse ==="
echo ""

# Clear ports 8000 and 3000 before starting — prevents "address already in use" on restart
echo "[0/2] Clearing ports 8000 and 3000..."
for PORT in 8000 3000; do
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null) || true
  if [ -n "$PIDS" ]; then
    echo "      Killing existing process(es) on :$PORT — PIDs: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
    sleep 0.5
  fi
done
echo "      Ports clear."
echo ""

# 1. FastAPI backend
echo "[1/2] Starting FastAPI backend on http://localhost:8000 ..."
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..
echo "      Backend PID: $BACKEND_PID (simulator managed by backend)"

# 2. Next.js frontend
echo "[2/2] Starting Next.js frontend on http://localhost:3000 ..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..
echo "      Frontend PID: $FRONTEND_PID"

echo ""
echo "=== All services running ==="
echo "  Setup:      http://localhost:3000/setup  (first run — paste Atlas + AI keys)"
echo "  Dashboard:  http://localhost:3000"
echo "  API docs:   http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

# Trap Ctrl+C and kill all children + any uvicorn reload workers on the same port
cleanup() {
  echo ''
  echo 'Stopping...'
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  pkill -f "simulator/emit_tests.py" 2>/dev/null || true
  lsof -ti tcp:8000 | xargs kill -9 2>/dev/null || true
  lsof -ti tcp:3000 | xargs kill -9 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

wait
