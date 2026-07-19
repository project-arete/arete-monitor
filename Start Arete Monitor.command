#!/bin/bash
# ---------------------------------------------------------------------------
# Double-click this file in Finder to launch the Arete Monitor.
# First time only: if macOS says it "cannot verify the developer",
# right-click → Open → Open once.
# ---------------------------------------------------------------------------
cd "$(dirname "$0")"

# Make sure node/npm are found even when Finder launches with a minimal PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js / npm was not found. Install the LTS from https://nodejs.org"
  echo "Press any key to close."
  read -n 1 -s
  exit 1
fi

# First run (or after deleting node_modules): install dependencies.
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies (first run only)"
  npm install
fi

echo "==> Starting Arete Monitor"
npm start
