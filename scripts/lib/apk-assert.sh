#!/usr/bin/env bash
# Shared APK checks for android-release.sh (TWA) and native-release.sh (Expo). Source it; it needs `die` defined by the caller.
# shellcheck shell=bash

# apk_assert_fingerprint <apksigner> <apk> <expected SHA-256 (AA:BB:...)>
# Aborts when the signing certificate is not the release key (a wrong key would break updates and assetlinks).
apk_assert_fingerprint() {
  local apksigner="$1" apk="$2" expected="$3" cert_out hex actual
  echo "==> Verifying signature"
  cert_out="$("$apksigner" verify --verbose --print-certs "$apk")" || die "apksigner could not verify $apk"
  echo "$cert_out" | rg -i "^Verifies|Verified using|SHA-256" || true
  hex="$(echo "$cert_out" | rg -i -o -r '$1' 'certificate SHA-256 digest: *([0-9a-f]+)' | head -1)"
  actual="$(node -p 'process.argv[1].toUpperCase().match(/../g)?.join(":") ?? ""' "$hex")"
  if [[ "${ANDROID_RELEASE_SKIP_FINGERPRINT:-0}" == "1" ]]; then
    echo "WARNING: fingerprint check skipped (ANDROID_RELEASE_SKIP_FINGERPRINT=1, test only). Got: $actual"
  elif [[ "$actual" != "$expected" ]]; then
    die "certificate SHA-256 mismatch (wrong keystore?). Expected $expected, got '$actual'. Aborting: this key would break updates and assetlinks."
  fi
}

# apk_assert_widget <aapt2> <dexdump> <apk>
# The widget must survive the manifest merge and R8.
apk_assert_widget() {
  local aapt2="$1" dexdump="$2" apk="$3" merged_xml dex_classes dex_tmp pat
  echo "==> Verifying the widget is in the APK"
  [[ -x "$aapt2" && -x "$dexdump" ]] || die "aapt2/dexdump not found ($aapt2, $dexdump)"
  merged_xml="$("$aapt2" dump xmltree --file AndroidManifest.xml "$apk")" || die "aapt2 could not read the APK manifest"
  for pat in \
    'name\(0x01010003\)="com\.kizunatracker\.widget\.KizunaWidgetProvider"' \
    '"android\.appwidget\.action\.APPWIDGET_UPDATE"' \
    '"android\.appwidget\.provider"' \
    'name\(0x01010003\)="com\.kizunatracker\.widget\.WidgetSetupActivity"' \
    'name\(0x01010003\)="android\.permission\.INTERNET"'; do
    rg -q -- "$pat" <<<"$merged_xml" || die "merged manifest lacks: $pat"
  done
  # Capture first: `dexdump | rg -q` would die of SIGPIPE under pipefail.
  dex_classes="$("$dexdump" "$apk" 2>/dev/null || true)"
  if ! rg -q "Class descriptor\\s+: 'Lcom/kizunatracker/widget/KizunaWidgetProvider;'" <<<"$dex_classes"; then
    # dexdump may stop at the first dex of a multi-dex APK: scan every classes*.dex as a fallback.
    # Into a temp file, never `unzip | rg -q`: rg exiting early would SIGPIPE unzip and pipefail turns that into a failure.
    dex_tmp="$(mktemp)"
    unzip -p "$apk" 'classes*.dex' >"$dex_tmp" || { rm -f "$dex_tmp"; die "could not read classes*.dex from the APK"; }
    rg -a -q 'Lcom/kizunatracker/widget/KizunaWidgetProvider;' "$dex_tmp" \
      || { rm -f "$dex_tmp"; die "R8 removed the widget provider (check consumer-rules.pro / the widget plugin)"; }
    rm -f "$dex_tmp"
  fi
}
