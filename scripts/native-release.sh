#!/usr/bin/env bash
# Build the signed Kizuna native (Expo) APK on EAS and publish it as a GitHub Release.
# Usage: ./scripts/native-release.sh [--dry-run] <version>   e.g. 1.1.2
# Local credentials only: mobile/credentials.json (gitignored) points at the release keystore. No passwords are read here.
# --dry-run: builds and verifies, skips the (permanent) commit, tag, push and release. The bump is committed temporarily so
# EAS sees it, then the branch is moved back to where it started (tracked files only; untracked files are never touched).
set -euo pipefail

EXPECTED_SHA256="4A:89:D7:46:88:D5:26:1E:CF:45:1D:6E:34:09:17:25:B2:5C:17:66:9A:A7:17:62:5D:54:09:CF:13:FC:0B:D4"
PACKAGE="com.kizunatracker.app"
BUILD_TOOLS="36.1.0"

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
[[ -n "$VERSION" ]] || die "usage: $0 [--dry-run] <version>  (e.g. 1.1.2)"

ROOT="$(git rev-parse --show-toplevel)"
LIB="$ROOT/scripts/native-release-lib.mjs"
CONFIG="$ROOT/mobile/app.config.ts"
# Pure checks first: semver, patch-bump-only, >= 1.1.1. Prints the new versionCode.
NEW_CODE="$(node "$LIB" plan "$CONFIG" "$VERSION")" || exit 1
CUR_CODE=$((NEW_CODE - 1))

TAG="android-v$VERSION"
APK_NAME="kizuna-v$VERSION.apk"
SDK_ROOT="${ANDROID_SDK_ROOT:-$(node -p "require('$HOME/.bubblewrap/config.json').androidSdkPath")}"
BT="$SDK_ROOT/build-tools/$BUILD_TOOLS"
# shellcheck source=lib/apk-assert.sh
source "$ROOT/scripts/lib/apk-assert.sh"

for t in "$BT/apksigner" "$BT/aapt2" "$BT/dexdump"; do [[ -x "$t" ]] || die "$t not found (install build-tools;$BUILD_TOOLS)"; done
command -v eas >/dev/null || die "eas-cli not found (npm i -g eas-cli)"
[[ -f "$ROOT/mobile/credentials.json" ]] || die "mobile/credentials.json missing (local credentials for the release keystore)"

cd "$ROOT"
BRANCH="$(git symbolic-ref --short -q HEAD)" || die "detached HEAD: check out a branch first"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree has uncommitted changes; commit or stash them first"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated (run: gh auth login)"
echo "==> versionCode $CUR_CODE -> $NEW_CODE, version $VERSION$([[ "$DRY_RUN" -eq 1 ]] && echo " [dry-run]")"

START_SHA="$(git rev-parse HEAD)"
KEEP=0
WORK=""
# On failure or --dry-run the bump commit is undone (the tree was clean, so only the bump is lost).
cleanup() {
  [[ "$KEEP" -eq 1 ]] || git reset -q --hard "$START_SHA"
  [[ -z "$WORK" ]] || rm -rf "$WORK"
}
trap cleanup EXIT

node "$LIB" apply "$CONFIG" "$VERSION" "$NEW_CODE"
git add mobile/app.config.ts
git commit -q -m "chore(mobile): release v$VERSION (versionCode $NEW_CODE)"
[[ "$DRY_RUN" -eq 1 ]] || KEEP=1 # from here a real release keeps the bump commit

echo "==> EAS build (production, local credentials)"
WORK="$(mktemp -d)"
cd "$ROOT/mobile"
eas build -p android --profile production --non-interactive --wait --json >"$WORK/build.json" || die "eas build failed"
BUILD_ID="$(node -p "const b=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); (Array.isArray(b)?b[0]:b).id" "$WORK/build.json")"
[[ -n "$BUILD_ID" ]] || die "could not read the build id from eas"
eas build:view "$BUILD_ID" --json >"$WORK/view.json" || die "eas build:view failed"
BUILD_URL="$(node -p "const b=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(b.status!=='FINISHED') throw new Error('build status '+b.status); b.artifacts.buildUrl" "$WORK/view.json")" || die "build did not finish or has no artifact"
curl -fsSL --output "$WORK/$APK_NAME" "$BUILD_URL" || die "APK download failed"
APK="$WORK/$APK_NAME"

apk_assert_fingerprint "$BT/apksigner" "$APK" "$EXPECTED_SHA256"

echo "==> Verifying package and versionCode"
"$BT/aapt2" dump badging "$APK" | node "$LIB" identity "$PACKAGE" "$CUR_CODE" || die "APK identity check failed"

apk_assert_widget "$BT/aapt2" "$BT/dexdump" "$APK"

cd "$ROOT"
cp "$APK" "$ROOT/$APK_NAME"
echo "==> APK ready: $ROOT/$APK_NAME"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> --dry-run: skipping tag, push and release (the temporary bump commit is undone)."
  exit 0
fi

git tag "$TAG"
git push origin "$BRANCH" "$TAG"

NOTES="$(cat <<NOTES_EOF
Kizuna v$VERSION: la app nativa.

Esta versión reemplaza a la app anterior, que funcionaba sobre Chrome. Ahora Kizuna es una app nativa, más rápida y con notificaciones propias.

**Cómo instalar**
1. Descarga \`$APK_NAME\` desde los archivos de esta release, en tu teléfono.
2. Instálalo encima de la app actual: no hace falta desinstalar. Si Android lo pide, permite instalar apps desde esta fuente.
3. Abre la app e inicia sesión una sola vez.

**Qué esperar**
- El widget sigue funcionando: no hace falta volver a vincularlo.
- Tus hábitos y tu historial se conservan: están en tu cuenta.
- Si algo falla, avísanos y puedes volver a la versión 1.0.x instalando su APK.
NOTES_EOF
)"
gh release create "$TAG" "$APK_NAME" --latest --title "Kizuna v$VERSION" --notes "$NOTES"
echo "==> Released $TAG"
