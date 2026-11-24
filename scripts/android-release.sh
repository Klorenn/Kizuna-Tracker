#!/usr/bin/env bash
# Build a signed Kizuna APK (Bubblewrap/TWA) and publish it as a GitHub Release.
# Usage: ./scripts/android-release.sh [--dry-run] <version>   e.g. 1.0.1
set -euo pipefail

BUBBLEWRAP="@bubblewrap/cli@1.27.0"
EXPECTED_SHA256="4A:89:D7:46:88:D5:26:1E:CF:45:1D:6E:34:09:17:25:B2:5C:17:66:9A:A7:17:62:5D:54:09:CF:13:FC:0B:D4"
SDK_ROOT="$(node -p "require('$HOME/.bubblewrap/config.json').androidSdkPath")"
BUILD_TOOLS="36.1.0" # must match BUILD_TOOLS_VERSION of the pinned Bubblewrap

die() { echo "error: $*" >&2; exit 1; }

DRY_RUN=0
VERSION=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -*) die "unknown option: $arg" ;;
    *) [[ -z "$VERSION" ]] || die "only one version argument allowed"; VERSION="$arg" ;;
  esac
done
[[ -n "$VERSION" ]] || die "usage: $0 [--dry-run] <version>  (e.g. 1.0.1)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be semver X.Y.Z, got '$VERSION'"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/android"
MANIFEST="twa-manifest.json"
TAG="android-v$VERSION"
APK_NAME="kizuna-v$VERSION.apk"
APKSIGNER="$SDK_ROOT/build-tools/$BUILD_TOOLS/apksigner"
[[ -x "$APKSIGNER" ]] || die "apksigner not found at $APKSIGNER (install build-tools;$BUILD_TOOLS)"

# Escape hatch for pipeline tests ONLY (dummy key). Never set these for a real release.
KEYSTORE_PATH="${ANDROID_KEYSTORE_PATH:-$(node -p "require('./$MANIFEST').signingKey.path")}"
KEY_ALIAS="${ANDROID_KEY_ALIAS:-$(node -p "require('./$MANIFEST').signingKey.alias")}"
[[ -f "$KEYSTORE_PATH" ]] || die "keystore not found: $KEYSTORE_PATH"

if [[ "$DRY_RUN" -eq 0 ]]; then
  gh auth status >/dev/null 2>&1 || die "gh is not authenticated (run: gh auth login)"
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists"
  [[ -z "$(git status --porcelain -- .)" ]] || die "android/ has uncommitted changes; commit or stash them first"
fi

CUR_NAME="$(node -p "require('./$MANIFEST').appVersion")"
CUR_CODE="$(node -p "require('./$MANIFEST').appVersionCode")"
NEW_CODE=$((CUR_CODE + 1))
echo "==> $CUR_NAME (code $CUR_CODE) -> $VERSION (code $NEW_CODE)$([[ "$DRY_RUN" -eq 1 ]] && echo " [dry-run]")"

# Restore the manifest unless the release was committed (covers failures and --dry-run).
BACKUP="$(mktemp)"; cp "$MANIFEST" "$BACKUP"; COMMITTED=0
cleanup() { [[ "$COMMITTED" -eq 1 ]] || cp "$BACKUP" "$MANIFEST"; rm -f "$BACKUP"; }
trap cleanup EXIT

node -e '
  const fs = require("fs"); const [f, name, code] = process.argv.slice(1);
  const m = JSON.parse(fs.readFileSync(f, "utf8"));
  m.appVersion = name; m.appVersionCode = Number(code);
  fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
' "$MANIFEST" "$VERSION" "$NEW_CODE"

# Passwords: from env, else prompt silently. Never echoed.
if [[ -z "${BUBBLEWRAP_KEYSTORE_PASSWORD:-}" ]]; then
  read -r -s -p "Keystore password: " BUBBLEWRAP_KEYSTORE_PASSWORD; echo
fi
if [[ -z "${BUBBLEWRAP_KEY_PASSWORD:-}" ]]; then
  read -r -s -p "Key password (Enter = same as keystore): " BUBBLEWRAP_KEY_PASSWORD; echo
  [[ -n "$BUBBLEWRAP_KEY_PASSWORD" ]] || BUBBLEWRAP_KEY_PASSWORD="$BUBBLEWRAP_KEYSTORE_PASSWORD"
fi
export BUBBLEWRAP_KEYSTORE_PASSWORD BUBBLEWRAP_KEY_PASSWORD

# stdin must be closed: Bubblewrap keeps the process alive on an open stdin.
echo "==> Regenerating Gradle project"
npx --yes "$BUBBLEWRAP" update --skipVersionUpgrade --manifest="./$MANIFEST" </dev/null

# `update` rewrites settings.gradle and app/build.gradle: link the widget module back in, then prove it.
echo "==> Linking the widget module"
[[ -f widget/build.gradle && -f widget/src/main/AndroidManifest.xml ]] || die "android/widget module missing"
node "$ROOT/scripts/android-widget-patch.mjs" settings.gradle app/build.gradle \
  || die "widget patch failed (did Bubblewrap change its layout?)"
rg -q -x "include ':app'" settings.gradle || die "settings.gradle: unexpected Bubblewrap layout (include ':app' missing)"
[[ "$(rg -c -x "include ':widget'" settings.gradle)" == "1" ]] || die "settings.gradle: include ':widget' must appear exactly once"
[[ "$(rg -c -F "implementation project(':widget')" app/build.gradle)" == "1" ]] || die "app/build.gradle: widget dependency must appear exactly once"

echo "==> Building and signing"
rm -f app-release-signed.apk app-release-bundle.aab
npx --yes "$BUBBLEWRAP" build --manifest="./$MANIFEST" \
  --signingKeyPath="$KEYSTORE_PATH" --signingKeyAlias="$KEY_ALIAS" </dev/null
[[ -f app-release-signed.apk ]] || die "build did not produce app-release-signed.apk"

echo "==> Verifying signature"
CERT_OUT="$("$APKSIGNER" verify --verbose --print-certs app-release-signed.apk)"
echo "$CERT_OUT" | rg -i "^Verifies|Verified using|SHA-256" || true
HEX="$(echo "$CERT_OUT" | rg -i -o -r '$1' 'certificate SHA-256 digest: *([0-9a-f]+)' | head -1)"
ACTUAL="$(node -p 'process.argv[1].toUpperCase().match(/../g).join(":")' "$HEX")"
if [[ "${ANDROID_RELEASE_SKIP_FINGERPRINT:-0}" == "1" ]]; then
  echo "WARNING: fingerprint check skipped (ANDROID_RELEASE_SKIP_FINGERPRINT=1, test only). Got: $ACTUAL"
elif [[ "$ACTUAL" != "$EXPECTED_SHA256" ]]; then
  die "certificate SHA-256 mismatch (wrong keystore?). Expected $EXPECTED_SHA256, got '$ACTUAL'. Aborting: this key would break updates and assetlinks."
fi

# The widget must survive the merge and R8. Runs in --dry-run too (before the APK is copied out).
echo "==> Verifying the widget is in the APK"
AAPT2="$SDK_ROOT/build-tools/$BUILD_TOOLS/aapt2"
DEXDUMP="$SDK_ROOT/build-tools/$BUILD_TOOLS/dexdump"
[[ -x "$AAPT2" && -x "$DEXDUMP" ]] || die "aapt2/dexdump not found in build-tools $BUILD_TOOLS"
MERGED_XML="$("$AAPT2" dump xmltree --file AndroidManifest.xml app-release-signed.apk)" || die "aapt2 could not read the APK manifest"
for pat in \
  'name\(0x01010003\)="com\.kizunatracker\.widget\.KizunaWidgetProvider"' \
  '"android\.appwidget\.action\.APPWIDGET_UPDATE"' \
  '"android\.appwidget\.provider"' \
  'name\(0x01010003\)="com\.kizunatracker\.widget\.WidgetSetupActivity"' \
  'name\(0x01010003\)="android\.permission\.INTERNET"'; do
  rg -q -- "$pat" <<<"$MERGED_XML" || die "merged manifest lacks: $pat"
done
# Capture first: `dexdump | rg -q` would die of SIGPIPE under pipefail.
DEX_CLASSES="$("$DEXDUMP" app-release-signed.apk 2>/dev/null || true)"
if ! rg -q "Class descriptor\\s+: 'Lcom/kizunatracker/widget/KizunaWidgetProvider;'" <<<"$DEX_CLASSES"; then
  # dexdump may stop at the first dex of a multi-dex APK: scan every classes*.dex as a fallback.
  # Into a temp file, never `unzip | rg -q`: rg exiting early would SIGPIPE unzip and pipefail turns that into a failure.
  DEX_TMP="$(mktemp)"
  unzip -p app-release-signed.apk 'classes*.dex' >"$DEX_TMP" || { rm -f "$DEX_TMP"; die "could not read classes*.dex from the APK"; }
  rg -a -q 'Lcom/kizunatracker/widget/KizunaWidgetProvider;' "$DEX_TMP" \
    || { rm -f "$DEX_TMP"; die "R8 removed the widget provider (check consumer-rules.pro)"; }
  rm -f "$DEX_TMP"
fi

cp app-release-signed.apk "$ROOT/$APK_NAME"
echo "==> APK ready: $ROOT/$APK_NAME"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> --dry-run: skipping commit, tag, push and release (manifest restored)."
  exit 0
fi

cd "$ROOT"
git add android  # build outputs and keystores are gitignored
git commit -m "chore(android): release v$VERSION"
COMMITTED=1
git tag "$TAG"
git push origin HEAD "$TAG"

NOTES="$(cat <<NOTES_EOF
Kizuna Tracker para Android v$VERSION (APK directo, fuera de Google Play).

**Instalar o actualizar**
1. Descarga \`$APK_NAME\` desde los archivos de esta release, en tu teléfono.
2. Ábrelo y, si Android lo pide, permite instalar apps desde esta fuente.
3. Para actualizar, instala el nuevo APK encima del anterior: no hace falta desinstalar y tus datos se conservan.
NOTES_EOF
)"
gh release create "$TAG" "$APK_NAME" --title "Kizuna Android v$VERSION" --notes "$NOTES"
echo "==> Released $TAG"
