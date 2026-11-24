#!/usr/bin/env bash
# Ship a JS-only change over the air (EAS Update, channel production) to installed Kizuna APKs.
# Usage: ./scripts/native-update.sh "<message>"
# Only for JS/asset changes. If native code changed (a native module, a config plugin, native fields of app.config.ts) the
# runtimeVersion fingerprint changes and installed apps will NOT receive this update: cut a new APK with native-release.sh.
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }
MESSAGE="${1:-}"
[[ -n "$MESSAGE" ]] || die "usage: $0 \"<message>\""
command -v eas >/dev/null || die "eas-cli not found (npm i -g eas-cli)"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree has uncommitted changes; commit them first so the update matches git"

cd "$ROOT/mobile"
eas update --channel production --message "$MESSAGE" --non-interactive
