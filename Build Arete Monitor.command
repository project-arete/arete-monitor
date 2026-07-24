#!/bin/bash
# ---------------------------------------------------------------------------
# Double-click this file in Finder to build the Arete Monitor macOS app.
# It installs dependencies (first run only), builds a .dmg installer, and opens
# the folder containing it. After this, you just double-click the .dmg, drag the
# app to Applications, and launch it like any other Mac app — no Terminal.
#
# First time only: if macOS says it "cannot verify the developer", right-click
# this file → Open → Open (that clears the download quarantine once).
# ---------------------------------------------------------------------------
set -e
cd "$(dirname "$0")"

echo "==> Building Arete Monitor"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js / npm was not found."
  echo "Install the LTS version from https://nodejs.org , then double-click this file again."
  echo
  echo "Press any key to close."
  read -n 1 -s
  exit 1
fi

echo "==> Installing dependencies (first run can take a minute)"
npm install

echo
echo "==> Packaging the app into a .dmg"
npm run dist

echo
echo "==> Done. Opening the 'release' folder"
open release || true

echo
echo "Your installer is the .dmg inside the 'release' folder."
echo "Open it, drag 'Arete Monitor' to Applications, and you're set."
echo "You can close this window."
