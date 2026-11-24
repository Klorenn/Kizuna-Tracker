#!/usr/bin/env bash
# migrate-region.sh - move Kizuna from OLD (us-west-2) to NEW (sa-east-1) in SEQUENTIAL phases.
#
# The free plan allows only ONE active project at a time, so OLD and NEW are never online together:
#   export  (OLD active)  ->  pause OLD, restore NEW in the dashboard  ->  import  ->  switch-vercel
#
# Run by a HUMAN, in their own terminal. OLD is only read (plus one idempotent cron.unschedule in `export`).
#
# USAGE
#   scripts/migrate-region.sh export [--no-unschedule] [--yes]
#   scripts/migrate-region.sh import <export-dir> [--dry-run] [--force-reset] [--yes]
#   scripts/migrate-region.sh import --fallback-backup <file.backup.gz> [--storage-from <export-dir>] [--dry-run] [--force-reset] [--yes]
#   scripts/migrate-region.sh switch-vercel [<export-dir>] [--yes]
#   scripts/migrate-region.sh rollback-vercel <backup-file>
#
# INPUTS (environment, or a silent prompt when missing; never echoed or logged)
#   export:  OLD_DB_URL (session pooler or direct, port 5432), OLD_SECRET_KEY (sb_secret_...; if OLD's Storage API
#            rejects it, OLD_SERVICE_ROLE_KEY = the legacy service_role JWT is used instead)
#   import:  NEW_DB_URL, NEW_SECRET_KEY (same fallback with NEW_SERVICE_ROLE_KEY)
#   switch-vercel: NEW_SECRET_KEY (and OLD_SECRET_KEY only if Vercel's current SUPABASE_SECRET_KEY is unreadable)
#   optional: OLD_SUPABASE_URL / NEW_SUPABASE_URL (default https://<ref>.supabase.co)
# Do not run with `bash -x`: it would print the secrets.
#
# DESIGN NOTES
#  * export: ONE pg_dump (--data-only, public.* + auth.users + auth.identities) = one consistent snapshot. Expected row
#    counts are computed FROM that dump (counts.json), because OLD will be paused during the import.
#  * import: only the COPY blocks of auth.users, auth.identities and public.* are extracted from data.sql (or from a
#    dashboard cluster dump) and loaded; the source file is never executed as a whole. Loaded in ONE psql
#    --single-transaction with session_replication_role = replica (no triggers, no FK order). Generated columns are skipped
#    by pg_dump and recomputed by NEW. Sessions, refresh tokens, audit log, vault, cron, net, realtime and
#    supabase_migrations are never copied (users log in again; NEW keeps its own vault.cron_secret and kizuna-cron).
#  * Seed data: the only seeded table is public.exercises (30 catalog rows with random uuids from migration 0015) and
#    workout_sets.exercise_id references them, so NEW's seed is DELETED inside the restore transaction and OLD's rows load.
#  * Storage: files are uploaded through the Storage API with the same path, content type and upsert=false; storage.objects
#    is never written directly. sb_secret_ keys go in the `apikey` header ONLY (the gateway swaps them for a service_role
#    JWT); legacy JWT keys go in both headers.

set -euo pipefail
umask 077

OLD_REF="wdrroprcszbamrjktmuf"
NEW_REF="xhjgybtyfkfixkrzlfmx"
NEW_PUBLISHABLE_KEY="sb_publishable_BReCjMnG-cBbZ6pKrGBDIg_kQn5Zglx" # public by design
APP_URL="https://kizuna-tracker.vercel.app"
VERCEL_VARS="NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY SUPABASE_JWKS_URL"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$REPO_ROOT/backups"
VERCEL_BACKUP="$BACKUP_DIR/vercel-env-before-$TS.env"

PHASE=""
POSITIONAL=""
DRY_RUN=0
FORCE_RESET=0
ASSUME_YES=0
NO_UNSCHEDULE=0
FALLBACK_BACKUP=""
STORAGE_FROM=""

TMP=""
cleanup() {
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() { printf '[%s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ---------------------------------------------------------------- argument parsing
[ $# -gt 0 ] || usage 1
case "$1" in
  export|import|switch-vercel|rollback-vercel) PHASE="$1"; shift ;;
  -h|--help) usage 0 ;;
  *) printf 'unknown phase: %s\n' "$1" >&2; usage 1 ;;
esac
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force-reset) FORCE_RESET=1 ;;
    --yes) ASSUME_YES=1 ;;
    --no-unschedule) NO_UNSCHEDULE=1 ;;
    --fallback-backup) shift; [ $# -gt 0 ] || die "--fallback-backup needs a file"; FALLBACK_BACKUP="$1" ;;
    --storage-from) shift; [ $# -gt 0 ] || die "--storage-from needs an export directory"; STORAGE_FROM="$1" ;;
    -h|--help) usage 0 ;;
    -*) printf 'unknown option: %s\n' "$1" >&2; usage 1 ;;
    *)
      [ -z "$POSITIONAL" ] || die "unexpected extra argument: $1"
      POSITIONAL="$1"
      ;;
  esac
  shift
done
if [ "$PHASE" != "import" ]; then
  [ "$DRY_RUN" = 0 ] && [ "$FORCE_RESET" = 0 ] && [ -z "$FALLBACK_BACKUP" ] && [ -z "$STORAGE_FROM" ] \
    || die "--dry-run, --force-reset, --fallback-backup and --storage-from are only valid for the import phase"
fi
if [ "$PHASE" != "export" ] && [ "$NO_UNSCHEDULE" = 1 ]; then die "--no-unschedule is only valid for export"; fi

# ---------------------------------------------------------------- helpers
prompt_db_url() { # VAR REF POOLER_HOST "label"  (asks only the DB password and builds the session-pooler URL)
  local var="$1" ref="$2" host="$3" label="$4" pw enc
  [ -n "${!var:-}" ] && return 0
  [ -t 0 ] || die "$var is not set and there is no terminal to ask for it"
  printf '%s: ' "$label" >&2
  IFS= read -rs pw
  printf '\n' >&2
  [ -n "$pw" ] || die "password for $var is empty"
  enc="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$pw")"
  printf -v "$var" 'postgresql://postgres.%s:%s@%s:5432/postgres' "$ref" "$enc" "$host"
}

prompt_secret() { # VAR "label"  (silent read when the variable is empty)
  local var="$1" label="$2" val
  val="${!var:-}"
  if [ -z "$val" ]; then
    [ -t 0 ] || die "$var is not set and there is no terminal to ask for it"
    printf '%s: ' "$label" >&2
    IFS= read -rs val
    printf '\n' >&2
    [ -n "$val" ] || die "$var is empty"
  fi
  printf -v "$var" '%s' "$val"
  export "${var?}"
}

confirm() { # "question" expected-word
  local q="$1" want="$2" ans
  [ "$ASSUME_YES" = 1 ] && return 0
  [ -t 0 ] || die "confirmation needed but there is no terminal (use --yes to skip)"
  printf '%s\nType %s to continue: ' "$q" "$want" >&2
  IFS= read -r ans
  [ "$ans" = "$want" ] || die "aborted"
}

# libpq / postgresql@17 are keg-only in brew: put libpq first when it exists
for d in /usr/local/opt/libpq/bin /usr/local/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/libpq/bin; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
export PATH

pg_major() { "$1" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/'; }

check_pg_tools() {
  local t m
  for t in "$@"; do
    command -v "$t" >/dev/null 2>&1 || die "$t not found. Install the Postgres client tools: brew install libpq (then put /opt/homebrew/opt/libpq/bin on PATH)."
    m="$(pg_major "$t")"
    [ "$m" -ge 17 ] || die "$t is version $m, 17 or newer is required (found $(command -v "$t"))."
  done
}

need_cmds() {
  local c
  for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "$c not found"; done
}

# curl auth header file (never on the command line)
write_auth_headers() { # file key
  local f="$1" key="$2"
  : >"$f"
  chmod 600 "$f"
  printf 'apikey: %s\n' "$key" >>"$f"
  case "$key" in
    sb_secret_*) : ;; # the gateway swaps the opaque key for a service_role JWT; never send it as Bearer
    *) printf 'Authorization: Bearer %s\n' "$key" >>"$f" ;;
  esac
}

probe_storage() { # base-url header-file -> http code
  curl -sS -o /dev/null -w '%{http_code}' -H "@$2" "$1/storage/v1/bucket" || printf '000'
}

# build a header file that works: try the secret key first, then the legacy service_role JWT
prepare_storage_headers() { # side(OLD|NEW) url hdrfile secret-key legacy-key
  local side="$1" url="$2" hdr="$3" key="$4" legacy="$5" code
  write_auth_headers "$hdr" "$key"
  code="$(probe_storage "$url" "$hdr")"
  [ "$code" = "200" ] && return 0
  if [ -n "$legacy" ]; then
    warn "$side Storage API rejected the secret key (HTTP $code); falling back to ${side}_SERVICE_ROLE_KEY"
    write_auth_headers "$hdr" "$legacy"
    code="$(probe_storage "$url" "$hdr")"
    [ "$code" = "200" ] && return 0
    die "$side Storage API rejected the legacy key too (HTTP $code)"
  fi
  die "$side Storage API rejected the key (HTTP $code). Export ${side}_SERVICE_ROLE_KEY (legacy service_role JWT: Project Settings > API Keys > Legacy) and re-run. (If the project is paused, restore it first.)"
}

# ---------------------------------------------------------------- COPY-block utilities (untrusted input safe)
COPY_HEADER_RE='^COPY (auth[.]users|auth[.]identities|public[.][a-z0-9_]+) [(][a-z0-9_", ]+[)] FROM stdin;$'

# stdin: any pg_dump / pg_dumpall SQL text. stdout: ONLY the COPY blocks of auth.users, auth.identities and public.*
extract_copy_blocks() {
  awk -v re="$COPY_HEADER_RE" '
    p { print; if ($0 == "\\.") p = 0; next }
    $0 ~ re { print; p = 1 }
  '
}

# stdin: COPY blocks. stdout: "table|rowcount" for every block
copy_counts() {
  awk -v re="$COPY_HEADER_RE" '
    p { if ($0 == "\\.") { p = 0; print t "|" n } else { n++ } next }
    $0 ~ re { t = $2; n = 0; p = 1 }
  ' | LC_ALL=C sort
}

# stdin: COPY blocks. stdout: "table|col1,col2,..." (double quotes removed)
copy_columns() {
  awk -v re="$COPY_HEADER_RE" '
    $0 ~ re {
      t = $2
      line = $0
      sub(/^[^(]*\(/, "", line)
      sub(/\) FROM stdin;$/, "", line)
      gsub(/[" ]/, "", line)
      print t "|" line
    }
  ' | LC_ALL=C sort
}

counts_to_json() { jq -Rn '[inputs | select(length > 0) | split("|") | {(.[0]): (.[1] | tonumber)}] | add'; }
json_to_counts() { jq -r 'to_entries | sort_by(.key) | .[] | "\(.key)|\(.value)"' "$1" | LC_ALL=C sort; }

COUNT_SQL="
select 'auth.users' as t, (xpath('/row/c/text()', query_to_xml('select count(*) as c from auth.users', false, true, '')))[1]::text as n
union all select 'auth.identities', (xpath('/row/c/text()', query_to_xml('select count(*) as c from auth.identities', false, true, '')))[1]::text
union all select 'public.' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1"

# ---------------------------------------------------------------- vercel helpers
vercel_env_has() { # name
  local out
  out="$(vercel env ls production 2>/dev/null)" || return 1
  printf '%s\n' "$out" | awk '{print $1}' | grep -qx "$1"
}

vercel_env_set() { # name value  (value only through stdin, never echoed)
  local name="$1" value="$2"
  if ! vercel env rm "$name" production --yes >/dev/null 2>&1; then
    if vercel_env_has "$name"; then
      die "vercel env rm $name failed and the variable still exists"
    fi
    warn "$name did not exist in production; adding it"
  fi
  printf '%s' "$value" | vercel env add "$name" production >/dev/null 2>&1 \
    || die "vercel env add $name failed (the variable may now be missing: restore with: scripts/migrate-region.sh rollback-vercel <backup>)"
  log "vercel: $name set"
}

env_file_get() { # file name -> value (dotenv: NAME="value" or NAME=value)
  local line v
  line="$(grep -E "^$2=" "$1" | tail -n 1 || true)"
  [ -n "$line" ] || return 0
  v="${line#*=}"
  v="${v#\"}"
  v="${v%\"}"
  printf '%s' "$v"
}

require_vercel_cli() {
  command -v vercel >/dev/null 2>&1 || die "vercel CLI not found (npm i -g vercel) and it must be logged in"
  [ -d "$REPO_ROOT/.vercel" ] || die "$REPO_ROOT/.vercel not found: the repo must be linked to the Vercel project"
}

backup_vercel_env() {
  local pulled name val old_key
  require_vercel_cli
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  pulled="$TMP/vercel-pull.env"
  # `vercel env pull` writes plaintext, so it goes to a private temp dir; only the 6 vars are kept, in a chmod 600 file
  (cd "$REPO_ROOT" && vercel env pull "$pulled" --environment=production --yes >/dev/null 2>&1) \
    || die "vercel env pull failed (logged in? linked?)"
  : >"$VERCEL_BACKUP"
  chmod 600 "$VERCEL_BACKUP"
  old_key="${OLD_SECRET_KEY:-${OLD_SERVICE_ROLE_KEY:-}}"
  for name in $VERCEL_VARS; do
    val="$(env_file_get "$pulled" "$name")"
    if [ -z "$val" ] && [ "$name" = "SUPABASE_SECRET_KEY" ] && [ -n "$old_key" ]; then
      warn "SUPABASE_SECRET_KEY is not readable from Vercel (sensitive variable); the backup uses OLD_SECRET_KEY"
      val="$old_key"
    fi
    [ -n "$val" ] || die "cannot back up $name (empty in the Vercel pull). Nothing was changed. (Export OLD_SECRET_KEY to use it for SUPABASE_SECRET_KEY.)"
    printf '%s="%s"\n' "$name" "$val" >>"$VERCEL_BACKUP"
  done
  rm -f "$pulled"
  log "vercel: current production values saved to $VERCEL_BACKUP (chmod 600, not printed)"
}

print_rollback_steps() {
  cat <<EOF

ROLLBACK (OLD still holds all the pre-cutover data):
  1. Dashboard: pause NEW ($NEW_REF), then restore OLD ($OLD_REF) and wait until it is ACTIVE_HEALTHY (~5-10 min each).
  2. scripts/migrate-region.sh rollback-vercel <backup-file printed by switch-vercel>
  3. Revert vercel.json regions to ["pdx1"], commit and push (redeploy).
  4. On OLD, SQL editor:  select cron.schedule('kizuna-cron', '*/15 * * * *', 'select public.call_cron_endpoints()');
  Anything written to NEW after the cutover is NOT in OLD.
EOF
}

# =====================================================================================================================
# PHASE rollback-vercel
# =====================================================================================================================
phase_rollback_vercel() {
  local file="$POSITIONAL" name val
  [ -n "$file" ] || die "usage: scripts/migrate-region.sh rollback-vercel <backup-file>"
  [ -f "$file" ] || die "backup file not found: $file"
  require_vercel_cli
  for name in $VERCEL_VARS; do
    val="$(env_file_get "$file" "$name")"
    [ -n "$val" ] || die "$name is missing or empty in $file"
  done
  cd "$REPO_ROOT"
  for name in $VERCEL_VARS; do
    vercel_env_set "$name" "$(env_file_get "$file" "$name")"
  done
  log "vercel: the 6 production variables were restored from $file"
  cat <<EOF

Next:
  1. Redeploy production (NEXT_PUBLIC_* values are inlined at build time) and revert vercel.json to pdx1.
  2. Make sure OLD is ACTIVE (pause NEW first on the free plan), then on OLD:
       select cron.schedule('kizuna-cron', '*/15 * * * *', 'select public.call_cron_endpoints()');
EOF
}

# =====================================================================================================================
# PHASE switch-vercel
# =====================================================================================================================
phase_switch_vercel() {
  local dir="$POSITIONAL"
  NEW_SUPABASE_URL="${NEW_SUPABASE_URL:-https://$NEW_REF.supabase.co}"
  case "$NEW_SUPABASE_URL" in *"$NEW_REF"*) : ;; *) die "NEW_SUPABASE_URL does not point at NEW" ;; esac
  if [ -n "$dir" ]; then
    [ -f "$dir/import-verified" ] || die "$dir/import-verified not found: run the import phase (it must pass verification) first"
  else
    confirm "No export dir given, so I cannot check that the import was verified." "SWITCH"
  fi
  prompt_secret NEW_SECRET_KEY "NEW_SECRET_KEY (sb_secret_... of NEW)"
  TMP="$(mktemp -d)"
  log "switching the 6 Vercel production variables to NEW (no deploy is triggered)"
  backup_vercel_env
  cd "$REPO_ROOT"
  vercel_env_set NEXT_PUBLIC_SUPABASE_URL "$NEW_SUPABASE_URL"
  vercel_env_set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$NEW_PUBLISHABLE_KEY"
  vercel_env_set SUPABASE_URL "$NEW_SUPABASE_URL"
  vercel_env_set SUPABASE_PUBLISHABLE_KEY "$NEW_PUBLISHABLE_KEY"
  vercel_env_set SUPABASE_SECRET_KEY "$NEW_SECRET_KEY"
  vercel_env_set SUPABASE_JWKS_URL "$NEW_SUPABASE_URL/auth/v1/.well-known/jwks.json"
  cat <<EOF

Vercel variables switched (VAPID_* untouched). Backup of the previous values: $VERCEL_BACKUP
Now: commit vercel.json gru1 + push to deploy (NEXT_PUBLIC_* are inlined at build time).
When the deploy is live, on NEW (SQL editor) enable the cron:
    select vault.create_secret('$APP_URL', 'app_url');
EOF
  print_rollback_steps
  printf '  (step 2 file: %s)\n' "$VERCEL_BACKUP"
}

# =====================================================================================================================
# PHASE export  (OLD must be ACTIVE)
# =====================================================================================================================
phase_export() {
  local export_dir full_dump line bucket name mime size dl file got n_total n_fail unscheduled
  check_pg_tools pg_dump psql
  need_cmds curl jq awk
  TMP="$(mktemp -d)"

  prompt_db_url OLD_DB_URL "$OLD_REF" "${OLD_POOLER_HOST:-aws-0-us-west-2.pooler.supabase.com}" "Contraseña de la base VIEJA (Kizune Tracker)"
  prompt_secret OLD_SECRET_KEY "Secret key de la base VIEJA (sb_secret_...)"
  case "$OLD_DB_URL" in *"$OLD_REF"*) : ;; *) die "OLD_DB_URL does not contain the OLD project ref ($OLD_REF)" ;; esac
  case "$OLD_DB_URL" in *"$NEW_REF"*) die "OLD_DB_URL points at NEW" ;; esac
  OLD_SUPABASE_URL="${OLD_SUPABASE_URL:-https://$OLD_REF.supabase.co}"
  case "$OLD_SUPABASE_URL" in *"$OLD_REF"*) : ;; *) die "OLD_SUPABASE_URL does not point at OLD" ;; esac

  psql_old() { psql "$OLD_DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }

  log "checking OLD (must be ACTIVE)"
  psql_old -At -c "select 1" >/dev/null 2>&1 \
    || die "cannot connect to OLD. If it is paused, restore it in the dashboard first (on the free plan pause NEW first). Use the session pooler URL if the direct host is IPv6-only."
  local hdr="$TMP/old.hdr"
  prepare_storage_headers OLD "$OLD_SUPABASE_URL" "$hdr" "$OLD_SECRET_KEY" "${OLD_SERVICE_ROLE_KEY:-}"

  confirm "EXPORT: stops OLD's cron (select cron.unschedule('kizuna-cron')) unless --no-unschedule, then dumps OLD. Do it at the START of the maintenance window." "EXPORT"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  export_dir="$BACKUP_DIR/export-$TS"
  mkdir -p "$export_dir/storage"
  chmod 700 "$export_dir"
  full_dump="$BACKUP_DIR/old-$TS.dump"

  # 1. stop OLD from calling the app (idempotent; the only write this script ever makes on OLD)
  if [ "$NO_UNSCHEDULE" = 1 ]; then
    warn "skipping cron.unschedule (--no-unschedule): run on OLD:  select cron.unschedule('kizuna-cron');"
  else
    unscheduled="$(psql_old -At -c "
      do \$\$ begin
        if to_regnamespace('cron') is not null then
          perform cron.unschedule(jobid) from cron.job where jobname = 'kizuna-cron';
        end if;
      end \$\$;
      select count(*) from cron.job where jobname = 'kizuna-cron';" 2>&1 | tail -n 1)" \
      || die "cron.unschedule failed; run it by hand on OLD:  select cron.unschedule('kizuna-cron');"
    [ "$unscheduled" = "0" ] || die "kizuna-cron is still scheduled on OLD; run by hand:  select cron.unschedule('kizuna-cron');"
    log "OLD cron 'kizuna-cron' is not scheduled (stopped, or it already was)"
  fi

  # 2. full backup
  log "full backup of OLD (pg_dump -Fc) -> $full_dump"
  pg_dump -Fc --no-owner --no-privileges -f "$full_dump" "$OLD_DB_URL"
  chmod 600 "$full_dump"

  # 3. data-only dump: ONE invocation = one consistent snapshot
  log "data-only dump of public.* + auth.users + auth.identities -> $export_dir/data.sql"
  pg_dump --data-only --no-owner --no-privileges --no-comments --no-publications --no-subscriptions \
    -t 'public.*' -t auth.users -t auth.identities -f "$export_dir/data.sql" "$OLD_DB_URL"
  chmod 600 "$export_dir/data.sql"

  # 4. expected counts, from the dump itself
  extract_copy_blocks <"$export_dir/data.sql" >"$TMP/copy.sql"
  copy_counts <"$TMP/copy.sql" >"$TMP/counts.txt"
  counts_to_json <"$TMP/counts.txt" >"$export_dir/counts.json"
  n_total="$(wc -l <"$TMP/counts.txt" | tr -d ' ')"
  [ "$n_total" -ge 3 ] || die "the dump has only $n_total COPY blocks: something is wrong"
  log "counts.json written ($n_total tables, $(awk -F'|' '{s+=$2} END{print s}' "$TMP/counts.txt") rows)"
  psql_old -At -F '|' -c "$COUNT_SQL" | LC_ALL=C sort >"$TMP/live-counts.txt"
  if ! diff -u "$TMP/live-counts.txt" "$TMP/counts.txt" >"$TMP/live.diff"; then
    cat "$TMP/live.diff" >&2
    warn "OLD changed while it was being dumped (live '-' vs dump '+'). The dump is still self-consistent; counts.json follows the dump. Make sure nobody writes to OLD."
  fi

  # 5. storage objects: list from OLD's storage.objects, download through the Storage API
  log "storage: listing objects in OLD (proofs, avatars)"
  psql_old -At -F "$(printf '\t')" -c "select bucket_id, name, coalesce(metadata->>'mimetype', 'image/jpeg'), coalesce(metadata->>'size', '') from storage.objects where bucket_id in ('proofs', 'avatars') order by bucket_id, name" >"$TMP/objects.tsv"
  n_total=0
  n_fail=0
  : >"$TMP/manifest.tsv"
  while IFS="$(printf '\t')" read -r bucket name mime size; do
    [ -n "$name" ] || continue
    n_total=$((n_total + 1))
    if ! printf '%s' "$name" | grep -Eq '^[A-Za-z0-9._/-]+$' || printf '%s' "$name" | grep -Eq '(^|/)\.\.?(/|$)'; then
      warn "unexpected object path (item $n_total in $bucket); refusing it"
      n_fail=$((n_fail + 1))
      continue
    fi
    file="$export_dir/storage/$bucket/$name"
    mkdir -p "$(dirname "$file")"
    dl="$(curl -sS -o "$file" -w '%{http_code}' --retry 3 -H "@$hdr" "$OLD_SUPABASE_URL/storage/v1/object/$bucket/$name" || printf '000')"
    if [ "$dl" != "200" ]; then
      warn "download failed (HTTP $dl): $bucket/$name"
      rm -f "$file"
      n_fail=$((n_fail + 1))
      continue
    fi
    got="$(wc -c <"$file" | tr -d ' ')"
    if [ -n "$size" ] && [ "$size" != "$got" ]; then
      warn "size mismatch for $bucket/$name (metadata $size, downloaded $got)"
      n_fail=$((n_fail + 1))
      continue
    fi
    printf '%s\t%s\t%s\t%s\n' "$bucket" "$name" "$mime" "$got" >>"$TMP/manifest.tsv"
    if [ $((n_total % 50)) = 0 ]; then log "storage: $n_total downloaded"; fi
  done <"$TMP/objects.tsv"
  jq -Rn '[inputs | select(length > 0) | split("\t") | {bucket: .[0], path: .[1], contentType: .[2], size: (.[3] | tonumber)}]' \
    <"$TMP/manifest.tsv" >"$export_dir/manifest.json"
  [ "$n_fail" = 0 ] || die "storage export incomplete: $n_fail of $n_total object(s) failed. The export is NOT marked complete; fix and re-run."
  log "storage: $n_total object(s) in manifest.json ($(du -sh "$export_dir/storage" | awk '{print $1}'))"

  date -u +%Y-%m-%dT%H:%M:%SZ >"$export_dir/export-complete"
  cat <<EOF

================ EXPORT COMPLETE ================
  export dir : $export_dir
  full backup: $full_dump
Keep both safe (they contain password hashes and private photos). Next, in the Supabase dashboard (free plan: one active project):
  1. Pause OLD ($OLD_REF): Project Settings > General > Pause project. (~5-10 min)
  2. Restore NEW ($NEW_REF): open the project > Restore project; wait until it is ACTIVE_HEALTHY. (~5-10 min)
  3. scripts/migrate-region.sh import $export_dir --dry-run
  4. scripts/migrate-region.sh import $export_dir
EOF
}

# =====================================================================================================================
# PHASE import  (NEW must be ACTIVE)
# =====================================================================================================================
phase_import() {
  local src_dir="$POSITIONAL" restore_sql dry_sql marker_dir manifest="" files_dir="" label
  local bucket name mime size file up code n fails expected_b actual_b total

  [ -n "$src_dir" ] || [ -n "$FALLBACK_BACKUP" ] || die "usage: import <export-dir>   or   import --fallback-backup <file.backup.gz>"
  [ -z "$src_dir" ] || [ -z "$FALLBACK_BACKUP" ] || die "give an export dir OR --fallback-backup, not both"
  check_pg_tools psql
  need_cmds curl jq awk gzip
  TMP="$(mktemp -d)"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  # ---- 1. source data (offline checks first)
  if [ -n "$src_dir" ]; then
    [ -f "$src_dir/export-complete" ] || die "$src_dir is not a complete export (no export-complete marker)"
    [ -f "$src_dir/data.sql" ] && [ -f "$src_dir/counts.json" ] || die "$src_dir lacks data.sql / counts.json"
    extract_copy_blocks <"$src_dir/data.sql" >"$TMP/copy.sql"
    json_to_counts "$src_dir/counts.json" >"$TMP/expected.txt"
    copy_counts <"$TMP/copy.sql" >"$TMP/recount.txt"
    diff -q "$TMP/expected.txt" "$TMP/recount.txt" >/dev/null || die "counts.json does not match the COPY blocks of data.sql: the export is corrupt or was edited"
    manifest="$src_dir/manifest.json"
    files_dir="$src_dir/storage"
    marker_dir="$src_dir"
    label="export $src_dir"
  else
    [ -f "$FALLBACK_BACKUP" ] || die "fallback backup not found: $FALLBACK_BACKUP"
    gzip -t "$FALLBACK_BACKUP" || die "$FALLBACK_BACKUP is not a valid gzip file"
    # the file is untrusted data: only the COPY blocks of auth.users, auth.identities and public.* are kept
    gzip -dc "$FALLBACK_BACKUP" | extract_copy_blocks >"$TMP/copy.sql"
    copy_counts <"$TMP/copy.sql" >"$TMP/expected.txt"
    [ "$(wc -l <"$TMP/expected.txt" | tr -d ' ')" -ge 3 ] || die "no usable COPY blocks found in $FALLBACK_BACKUP"
    marker_dir="$BACKUP_DIR"
    label="fallback backup $FALLBACK_BACKUP"
    if [ -n "$STORAGE_FROM" ]; then
      [ -f "$STORAGE_FROM/export-complete" ] && [ -f "$STORAGE_FROM/manifest.json" ] || die "--storage-from $STORAGE_FROM is not a complete export"
      manifest="$STORAGE_FROM/manifest.json"
      files_dir="$STORAGE_FROM/storage"
    else
      warn "no --storage-from given: storage objects will NOT be copied (only the database)"
    fi
  fi
  log "source: $label ($(wc -l <"$TMP/expected.txt" | tr -d ' ') tables, $(awk -F'|' '{s+=$2} END{print s}' "$TMP/expected.txt") rows)"

  if [ -n "$manifest" ]; then
    jq -e 'type == "array" and all(.[]; (.bucket == "proofs" or .bucket == "avatars") and (.path | test("^[A-Za-z0-9._/-]+$")) and (.path | test("(^|/)\\.\\.?(/|$)") | not) and (.size | type == "number"))' "$manifest" >/dev/null \
      || die "manifest.json is malformed or has unexpected buckets/paths"
    n=0
    while IFS="$(printf '\t')" read -r bucket name size; do
      file="$files_dir/$bucket/$name"
      [ -f "$file" ] || die "manifest entry has no file: $bucket/$name"
      [ "$(wc -c <"$file" | tr -d ' ')" = "$size" ] || die "file size differs from the manifest: $bucket/$name"
      n=$((n + 1))
    done < <(jq -r '.[] | [.bucket, .path, (.size | tostring)] | @tsv' "$manifest")
    log "storage: $n file(s) present and sizes match the manifest"
  fi

  # ---- 2. inputs and connectivity
  prompt_db_url NEW_DB_URL "$NEW_REF" "${NEW_POOLER_HOST:-aws-0-sa-east-1.pooler.supabase.com}" "Contraseña de la base NUEVA (Kizuna Tracker SP)"
  case "$NEW_DB_URL" in *"$NEW_REF"*) : ;; *) die "NEW_DB_URL does not contain the NEW project ref ($NEW_REF)" ;; esac
  case "$NEW_DB_URL" in *"$OLD_REF"*) die "NEW_DB_URL points at OLD: refusing to restore into production" ;; esac
  NEW_SUPABASE_URL="${NEW_SUPABASE_URL:-https://$NEW_REF.supabase.co}"
  case "$NEW_SUPABASE_URL" in *"$NEW_REF"*) : ;; *) die "NEW_SUPABASE_URL does not point at NEW" ;; esac
  if [ "$DRY_RUN" = 0 ] && [ -n "$manifest" ]; then
    prompt_secret NEW_SECRET_KEY "NEW_SECRET_KEY (sb_secret_... of NEW)"
  fi

  psql_new() { psql "$NEW_DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }

  log "checking NEW (must be ACTIVE)"
  psql_new -At -c "select 1" >/dev/null 2>&1 \
    || die "cannot connect to NEW. If it is paused: dashboard > project $NEW_REF > Restore project, wait for ACTIVE_HEALTHY (~5-10 min). (Free plan: pause OLD first.) Use the session pooler URL if the direct host is IPv6-only."
  n="$(psql_new -At -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
  total="$(grep -c '^public\.' "$TMP/expected.txt" || true)"
  [ "$n" = "$total" ] || die "NEW has $n public tables but the source has $total: apply the migrations on NEW first (or the source is from a different schema version)"

  # ---- 3. schema compatibility of every COPY column list with NEW (GoTrue versions may differ)
  log "checking COPY column lists against NEW's columns"
  local compat_bad=0 tbl cols schema_ t_ out
  copy_columns <"$TMP/copy.sql" >"$TMP/columns.txt"
  while IFS='|' read -r tbl cols; do
    schema_="${tbl%%.*}"
    t_="${tbl#*.}"
    out="$(psql_new -At -c "
      with d as (select unnest(string_to_array('$cols', ',')) as c),
      n as (select column_name, is_nullable, column_default, is_identity from information_schema.columns
            where table_schema = '$schema_' and table_name = '$t_' and is_generated = 'NEVER')
      select 'FATAL: source column not in NEW (or generated there): ' || d.c from d where d.c not in (select column_name from n)
      union all select 'FATAL: NEW column is required but absent from the source: ' || n.column_name from n
        where n.column_name not in (select c from d) and n.is_nullable = 'NO' and n.column_default is null and n.is_identity = 'NO'
      union all select 'note: NEW column not in the source (nullable or has a default): ' || n.column_name from n
        where n.column_name not in (select c from d) and (n.is_nullable = 'YES' or n.column_default is not null or n.is_identity = 'YES')")"
    if [ -n "$out" ]; then
      while IFS= read -r line; do
        case "$line" in
          FATAL*) warn "$tbl: ${line#FATAL: }"; compat_bad=1 ;;
          *) log "$tbl: ${line#note: }" ;;
        esac
      done <<EOF2
$out
EOF2
    fi
  done <"$TMP/columns.txt"
  [ "$compat_bad" = 0 ] || die "the source and NEW have different column sets (GoTrue / schema versions differ). Nothing was written."
  log "column lists are compatible with NEW"

  # ---- 4. idempotency guard
  local new_users
  new_users="$(psql_new -At -c "select count(*) from auth.users")"
  if [ "$new_users" != "0" ]; then
    if [ "$FORCE_RESET" = 1 ]; then
      confirm "NEW already has $new_users user(s). --force-reset will TRUNCATE all NEW public tables and auth.users/auth.identities (CASCADE)." "RESET-NEW"
      if [ "$DRY_RUN" = 1 ]; then
        die "a dry run cannot reset NEW (it must not modify it). Re-run without --dry-run, or reset first."
      fi
      log "resetting NEW data"
      psql_new --single-transaction -q <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.table_name);
  END LOOP;
END $$;
TRUNCATE TABLE auth.users, auth.identities CASCADE;
SQL
    else
      die "NEW already has $new_users row(s) in auth.users. Refusing to restore. Use --force-reset to wipe NEW's data first (interactive confirmation)."
    fi
  fi

  if [ "$DRY_RUN" = 0 ]; then
    confirm "REAL IMPORT into NEW ($NEW_REF) from $label. OLD should already be paused." "IMPORT"
  fi

  # ---- 5. restore in ONE transaction
  restore_sql="$TMP/restore.sql"
  {
    printf '%s\n' "\\set ON_ERROR_STOP on"
    printf '%s\n' "SET client_encoding = 'UTF8';"
    printf '%s\n' "SET LOCAL session_replication_role = replica;"
    printf '%s\n' "-- NEW's catalog exercises came from migration 0015 with random ids; the source rows (same ids as workout_sets) replace them"
    printf '%s\n' "DELETE FROM public.exercises;"
    printf '%s\n' "\\i '$TMP/copy.sql'"
    cat <<'SQL'
-- every serial / identity sequence in public goes to max(column) (login_attempts_id_seq is the only one today)
DO $$
DECLARE r record; v_max bigint;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name,
           pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('SELECT max(%I) FROM public.%I', r.column_name, r.table_name) INTO v_max;
      IF v_max IS NULL THEN
        PERFORM setval(r.seq, 1, false);
      ELSE
        PERFORM setval(r.seq, v_max, true);
      END IF;
    END IF;
  END LOOP;
END $$;
SQL
  } >"$restore_sql"

  if [ "$DRY_RUN" = 1 ]; then
    log "DRY RUN: restoring inside a transaction that is ROLLED BACK"
    dry_sql="$TMP/dry.sql"
    {
      cat "$restore_sql"
      printf '%s\n' "\\echo '--- would-be counts on NEW (before rollback) ---'"
      printf '%s\n' "\\pset format unaligned"
      printf '%s\n' "\\pset tuples_only on"
      printf '%s\n' "\\pset fieldsep '|'"
      printf '%s;\n' "$COUNT_SQL"
      printf '%s\n' "ROLLBACK;"
    } >"$dry_sql"
    psql_new --single-transaction -q -f "$dry_sql" >"$TMP/dry.out" 2>"$TMP/dry.err" \
      || { cat "$TMP/dry.err" >&2; die "dry-run restore FAILED (nothing was committed). Fix the error above before the real import."; }
    sed -n '/^--- would-be counts/,$p' "$TMP/dry.out" | sed '1d' | LC_ALL=C sort >"$TMP/new-counts.txt"
    if diff -u "$TMP/expected.txt" "$TMP/new-counts.txt" >"$TMP/dry.diff"; then
      log "dry run OK: the restore ran completely, was rolled back, and the would-be counts equal the expected counts:"
    else
      cat "$TMP/dry.diff" >&2
      die "would-be counts differ from the expected counts (expected '-' vs NEW '+')"
    fi
    printf '%s\n' "table|rows"
    cat "$TMP/new-counts.txt"
    log "dry run finished; NEW was not modified."
    return 0
  fi

  log "restoring into NEW in ONE transaction (replica mode)"
  psql_new --single-transaction -q -f "$restore_sql" || die "restore failed; the transaction was rolled back, NEW is unchanged"
  log "restore committed"

  # ---- 6. storage upload
  fails=0
  if [ -n "$manifest" ]; then
    prepare_storage_headers NEW "$NEW_SUPABASE_URL" "$TMP/new.hdr" "$NEW_SECRET_KEY" "${NEW_SERVICE_ROLE_KEY:-}"
    n=0
    total="$(jq 'length' "$manifest")"
    while IFS="$(printf '\t')" read -r bucket name mime; do
      n=$((n + 1))
      file="$files_dir/$bucket/$name"
      up="$(curl -sS -o "$TMP/up.out" -w '%{http_code}' --retry 3 -X POST -H "@$TMP/new.hdr" -H "Content-Type: $mime" -H "x-upsert: false" \
        --data-binary "@$file" "$NEW_SUPABASE_URL/storage/v1/object/$bucket/$name" || printf '000')"
      if [ "$up" = "409" ] || { [ "$up" = "400" ] && grep -q "Duplicate" "$TMP/up.out"; }; then
        : # already there (re-run): upsert=false keeps the existing object
      elif [ "$up" != "200" ]; then
        warn "upload failed (HTTP $up): $bucket/$name"
        fails=$((fails + 1))
      fi
      if [ $((n % 50)) = 0 ]; then log "storage: $n/$total uploaded"; fi
    done < <(jq -r '.[] | [.bucket, .path, .contentType] | @tsv' "$manifest")
    log "storage: $total object(s) processed"
  fi

  # ---- 7. verification against the expected counts / manifest
  log "verification"
  local failed=0
  psql_new -At -F '|' -c "$COUNT_SQL" | LC_ALL=C sort >"$TMP/new-counts.txt"
  if diff -u "$TMP/expected.txt" "$TMP/new-counts.txt" >"$TMP/counts.diff"; then
    log "row counts match for all $(wc -l <"$TMP/expected.txt" | tr -d ' ') tables (public.*, auth.users, auth.identities)"
  else
    cat "$TMP/counts.diff" >&2
    warn "ROW COUNT MISMATCH (expected '-' vs NEW '+')"
    failed=1
  fi
  if [ -n "$manifest" ]; then
    for bucket in proofs avatars; do
      expected_b="$(jq --arg b "$bucket" '[.[] | select(.bucket == $b)] | length' "$manifest")"
      actual_b="$(psql_new -At -c "select count(*) from storage.objects where bucket_id = '$bucket'")"
      if [ "$expected_b" = "$actual_b" ]; then
        log "storage $bucket: $actual_b == manifest $expected_b"
      else
        warn "storage $bucket MISMATCH: manifest $expected_b, NEW $actual_b"
        failed=1
      fi
    done
  else
    warn "storage was not verified (database-only import)"
  fi
  [ "$fails" = 0 ] || { warn "$fails storage upload(s) failed (see warnings above); re-run import with --force-reset to retry (existing objects are skipped)"; failed=1; }
  [ "$failed" = 0 ] || die "VERIFICATION FAILED. NEW is NOT ready; do not switch traffic. OLD (paused) is untouched: restore it to roll back."

  date -u +%Y-%m-%dT%H:%M:%SZ >"$marker_dir/import-verified"
  log "verification PASSED"
  cat <<EOF

================ IMPORT VERIFIED ================
Next:
  1. scripts/migrate-region.sh switch-vercel ${src_dir:-<export-dir>}      (switches the 6 Vercel env vars; no deploy)
  2. Change vercel.json to { "regions": ["gru1"] }, commit and push (this is the deploy).
  3. When the deploy is live, on NEW (SQL editor):
       select vault.create_secret('$APP_URL', 'app_url');
     (cron_secret already exists on NEW from migration 0020; the cron stays a no-op until app_url exists.)
EOF
  print_rollback_steps
}

case "$PHASE" in
  export) phase_export ;;
  import) phase_import ;;
  switch-vercel) phase_switch_vercel ;;
  rollback-vercel) phase_rollback_vercel ;;
esac
