#!/usr/bin/env bash
set -e

echo "=== SoCPulse Setup ==="

# Check Node.js for MCP server
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required for the MongoDB MCP server."
  echo "Install it from https://nodejs.org and re-run setup."
  exit 1
fi
echo "[✓] Node.js $(node --version)"

# Check Python 3.10+ (3.12 preferred — langchain-mcp-adapters requires >= 3.10)
PYTHON_BIN=""
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" &>/dev/null; then
    version=$($candidate --version 2>&1 | awk '{print $2}')
    major=$(echo "$version" | cut -d. -f1)
    minor=$(echo "$version" | cut -d. -f2)
    if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
      PYTHON_BIN="$candidate"
      echo "[✓] Python $version ($candidate)"
      break
    fi
  fi
done
if [ -z "$PYTHON_BIN" ]; then
  echo "ERROR: Python 3.10+ is required. Install via brew: brew install python@3.12"
  exit 1
fi

# Create backend .env from example if not present (empty keys — use setup wizard to fill)
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "[!] Created backend/.env — use http://localhost:3000/setup after ./start.sh"
else
  echo "[✓] backend/.env already exists"
fi

# Create frontend .env.local from example if not present
if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.example frontend/.env.local
  if command -v openssl &>/dev/null; then
    SECRET=$(openssl rand -base64 32)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=${SECRET}|" frontend/.env.local
    else
      sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${SECRET}|" frontend/.env.local
    fi
  fi
  echo "[!] Created frontend/.env.local — setup wizard will fill login credentials"
else
  echo "[✓] frontend/.env.local already exists"
fi

# Backend virtual environment
echo ""
echo "--- Setting up Python environment ---"
if [ ! -d backend/.venv ]; then
  "$PYTHON_BIN" -m venv backend/.venv
  echo "[✓] Created backend/.venv"
fi
source backend/.venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r backend/requirements.txt
echo "[✓] Python dependencies installed"
deactivate

# Frontend
echo ""
echo "--- Setting up frontend ---"
cd frontend
npm install --silent
echo "[✓] npm dependencies installed"
cd ..

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Run: ./start.sh"
echo "  2. Open http://localhost:3000/setup and paste your Atlas + AI keys"
echo "  3. Restart ./start.sh, seed the database, then sign in at /login"
echo ""
echo "Manual alternative: edit backend/.env and frontend/.env.local directly."
echo "Customer deployment: see DEPLOYMENT.md"
