#!/usr/bin/env bash
# Source me: exports E2E_USERNAME / E2E_EMAIL / E2E_PASSWORD for the prod smoke suite.
# The password lives only in the macOS Keychain (service kizuna-e2e, account kizuna_e2e).
# It is never printed, logged or written to disk.
_e2e_svc="kizuna-e2e"
_e2e_acct="kizuna_e2e"

if ! security find-generic-password -s "$_e2e_svc" -a "$_e2e_acct" >/dev/null 2>&1; then
  _e2e_pw="$(openssl rand -base64 18)"
  security add-generic-password -s "$_e2e_svc" -a "$_e2e_acct" -w "$_e2e_pw" -U >/dev/null
  unset _e2e_pw
fi

export E2E_USERNAME="kizuna_e2e"
export E2E_EMAIL="e2e-bot@kizunatracker.invalid"
E2E_PASSWORD="$(security find-generic-password -s "$_e2e_svc" -a "$_e2e_acct" -w)"
export E2E_PASSWORD
unset _e2e_svc _e2e_acct
