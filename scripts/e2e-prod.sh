#!/usr/bin/env bash
# Production smoke suite. Needs the macOS Keychain (credentials) and ~300 MB for chromium.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=scripts/e2e-credentials.sh
source scripts/e2e-credentials.sh

browser_installed() {
  node -e 'const fs=require("fs");const p=require("@playwright/test").chromium.executablePath();process.exit(fs.existsSync(p)?0:1)' 2>/dev/null
}

if ! browser_installed; then
  free_mb=$(df -m . | awk 'NR==2 {print $4}')
  if [ "${free_mb:-0}" -lt 500 ]; then
    echo "Playwright chromium is not installed and only ${free_mb} MB are free (need >= 500 MB, chromium takes ~300 MB)." >&2
    echo "Free some disk space and run again." >&2
    exit 1
  fi
  npx playwright install chromium
fi

exec npx playwright test -c playwright.prod.config.ts "$@"
