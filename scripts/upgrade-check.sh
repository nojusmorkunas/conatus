#!/usr/bin/env bash
#
# Prove that a database written by an older release survives an upgrade: the
# migrations apply, no user data is lost, and the application comes back
# healthy. Fresh-install coverage lives in CI; this covers the path every
# self-hoster actually takes.
#
#   scripts/upgrade-check.sh --all
#   scripts/upgrade-check.sh --from 0.2.0-beta.1
#   scripts/upgrade-check.sh --from 0.2.0-beta.1 --to 0.2.0-beta.3
#
# --all runs every released version in turn and is what the release checklist
# asks for; the candidate is built once and reused from the layer cache.
#
# --to defaults to "build", which builds the candidate from the working tree.
# Pass a published version to check one release against another, or "prebuilt"
# to reuse conatus-upgrade-check:candidate images already in the daemon.
#
# The old side runs the released images and that release's own Compose file, so
# a renamed volume or a dropped service fails here rather than on a user's
# server. Seed data is written by the old operations image, which carries its
# own schema; no fixture in this repository has to be kept in step with it.
#
# Requires Docker with Compose v2. Every container, network, and volume is
# removed on exit unless --keep is given.
set -euo pipefail

from=""
to="build"
keep=0
all=0
port_base="${UPGRADE_CHECK_PORT_BASE:-44300}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) from="${2:?--from needs a version}"; shift 2 ;;
    --to) to="${2:?--to needs a version, 'build', or 'prebuilt'}"; shift 2 ;;
    --all) all=1; shift ;;
    --keep) keep=1; shift ;;
    -h|--help) sed -n '2,22p' "$0" | cut -c3-; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

if [[ $all -eq 1 ]]; then
  [[ -n $from ]] && { echo "--all and --from are mutually exclusive" >&2; exit 2; }
  mapfile -t tags < <(git tag --sort=v:refname -l 'v*')
  (( ${#tags[@]} )) || { echo "no release tags to check" >&2; exit 2; }

  # Each version runs in its own process so one failure does not hide the rest.
  summary=()
  status=0
  for tag in "${tags[@]}"; do
    echo
    echo "======== upgrade from $tag ========"
    if "$0" --from "$tag" --to "$to" $([[ $keep -eq 1 ]] && echo --keep); then
      summary+=("  OK   $tag")
    else
      summary+=("  FAIL $tag")
      status=1
    fi
  done

  echo
  echo "======== summary ========"
  printf '%s\n' "${summary[@]}"
  exit $status
fi

if [[ -z $from ]]; then
  echo "--from is required (a published version, for example 0.2.0-beta.1), or pass --all" >&2
  exit 2
fi

from_tag="v${from#v}"
from="${from#v}"
if ! git rev-parse -q --verify "refs/tags/$from_tag" >/dev/null; then
  echo "no such tag: $from_tag" >&2
  exit 2
fi

project="conatus-upgrade-$(printf '%s' "$from" | tr -c 'a-z0-9' '-')"
work=$(mktemp -d)
env_file="$work/.env"

app_port=$((port_base + 0))
pg_port=$((port_base + 1))
minio_port=$((port_base + 2))
minio_console_port=$((port_base + 3))

pg_user=upgradecheck
pg_db=upgradecheck
admin_user=upgrade-check-admin

candidate_image=conatus-upgrade-check
candidate_version=candidate

cleanup() {
  local status=$?
  if [[ $keep -eq 1 ]]; then
    echo "==> Leaving project $project and $work in place (--keep)"
  else
    docker compose -p "$project" --env-file "$env_file" \
      -f "$repo_root/docker-compose.yml" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$work"
  fi
  return $status
}
trap cleanup EXIT

git show "$from_tag:docker-compose.yml" > "$work/old-compose.yml"

cat > "$env_file" <<EOF
POSTGRES_USER=$pg_user
POSTGRES_PASSWORD=upgrade-check-not-a-real-password
POSTGRES_DB=$pg_db
POSTGRES_PORT=$pg_port
AUTH_SECRET=upgrade-check-not-a-real-secret
S3_ACCESS_KEY=upgradecheckaccess
S3_SECRET_KEY=upgrade-check-not-a-real-secret-key
S3_BUCKET=attachments
MINIO_PORT=$minio_port
MINIO_CONSOLE_PORT=$minio_console_port
CONATUS_PORT=$app_port
CONATUS_BIND_ADDRESS=127.0.0.1
CONATUS_ADMIN_USERNAME=$admin_user
CONATUS_ADMIN_PASSWORD=upgrade-check-not-a-real-password
REGISTRATION_MODE=invite-only
EOF

old_compose() {
  CONATUS_VERSION="$from" CONATUS_IMAGE="${CONATUS_IMAGE:-ghcr.io/nojusmorkunas/conatus}" \
    docker compose -p "$project" --env-file "$env_file" -f "$work/old-compose.yml" "$@"
}

new_compose() {
  local files=(-f "$repo_root/docker-compose.yml")
  local image="$candidate_image" version="$candidate_version"
  case "$to" in
    build) files+=(-f "$repo_root/docker-compose.build.yml") ;;
    prebuilt) ;;
    *)
      image="${CONATUS_IMAGE:-ghcr.io/nojusmorkunas/conatus}"
      version="${to#v}"
      ;;
  esac
  CONATUS_VERSION="$version" CONATUS_IMAGE="$image" \
    docker compose -p "$project" --env-file "$env_file" "${files[@]}" "$@"
}

# The database service is identical on both sides, so either Compose file can
# reach it; the project name is what ties the containers together.
psql_query() {
  new_compose exec -T db psql -v ON_ERROR_STOP=1 -At -U "$pg_user" -d "$pg_db" -f - < "$1"
}

# The only part of this script that names columns, and so the only part a
# migration can silently outdate. Failing loudly here is what keeps it from
# becoming a chore to remember.
fingerprint() {
  local out=$1 phase=$2
  if ! psql_query "$work/fingerprint.sql" | sort > "$out"; then
    cat >&2 <<EOF

The user-data fingerprint query failed against the $phase schema. It reads
users.username, projects.name, tasks.content, labels.name and comments.content.
If this release deliberately renames or moves one of those, update the query in
$0 and note the change in the release's migration notes.
EOF
    return 1
  fi
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 90); do
    if curl -sf -o /dev/null "http://127.0.0.1:$app_port/api/health"; then
      return 0
    fi
    sleep 2
  done
  echo "application did not become healthy on port $app_port" >&2
  new_compose logs --tail 80 app >&2 || true
  return 1
}

# Row counts come from the catalogue rather than a hard-coded list, so tables a
# migration adds show up without editing this script.
cat > "$work/counts.sql" <<'SQL'
SELECT c.relname || '=' ||
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                           false, true, '')))[1]::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
SQL

# Durable user data. A migration may move these rows between tables or add
# columns, but it must never change what the user wrote. Should a deliberate
# rename break this query, say so in the release's migration notes.
cat > "$work/fingerprint.sql" <<'SQL'
SELECT 'users:'    || coalesce(md5(string_agg(id::text || '|' || username, ',' ORDER BY id)), 'empty') FROM users
UNION ALL
SELECT 'projects:' || coalesce(md5(string_agg(id::text || '|' || name, ',' ORDER BY id)), 'empty') FROM projects
UNION ALL
SELECT 'tasks:'    || coalesce(md5(string_agg(id::text || '|' || content, ',' ORDER BY id)), 'empty') FROM tasks
UNION ALL
SELECT 'labels:'   || coalesce(md5(string_agg(id::text || '|' || name, ',' ORDER BY id)), 'empty') FROM labels
UNION ALL
SELECT 'comments:' || coalesce(md5(string_agg(id::text || '|' || content, ',' ORDER BY id)), 'empty') FROM comments;
SQL

cat > "$work/migrations.sql" <<'SQL'
SELECT count(*) FROM drizzle.__drizzle_migrations;
SQL

echo "==> Starting $from"
old_compose pull --quiet db minio migrate bootstrap app
old_compose up -d app
wait_for_health

echo "==> Seeding $from data with its own operations image"
old_compose run --rm --no-deps --entrypoint sh \
  -e "SEED_USERNAME=$admin_user" migrate \
  -c 'node_modules/.bin/tsx scripts/seed-demo.ts'

psql_query "$work/counts.sql" | sort > "$work/counts.before"
fingerprint "$work/fingerprint.before" "$from"
migrations_before=$(psql_query "$work/migrations.sql")
echo "==> $from applied $migrations_before migrations"

case "$to" in
  build)
    echo "==> Building candidate images from the working tree"
    new_compose build --quiet app migrate bootstrap
    target_label="the working tree"
    ;;
  prebuilt)
    for image in "$candidate_image:$candidate_version" "$candidate_image:$candidate_version-ops"; do
      docker image inspect "$image" >/dev/null 2>&1 || {
        echo "--to prebuilt needs $image in the local daemon" >&2
        exit 2
      }
    done
    target_label="the prebuilt candidate"
    ;;
  *)
    echo "==> Pulling ${to#v}"
    new_compose pull --quiet migrate bootstrap app
    target_label="${to#v}"
    ;;
esac

echo "==> Upgrading to $target_label"
old_compose stop app >/dev/null
old_compose rm -f app >/dev/null
new_compose up -d app
wait_for_health

psql_query "$work/counts.sql" | sort > "$work/counts.after"
fingerprint "$work/fingerprint.after" "$target_label"
migrations_after=$(psql_query "$work/migrations.sql")
echo "==> $target_label applied $migrations_after migrations"

echo "==> Re-running the migration job to confirm it is idempotent"
new_compose run --rm migrate

failures=0
fail() { echo "FAIL: $*" >&2; failures=$((failures + 1)); }

if (( migrations_after < migrations_before )); then
  fail "the migration journal shrank ($migrations_before -> $migrations_after)"
fi

if ! diff -u "$work/fingerprint.before" "$work/fingerprint.after" > "$work/fingerprint.diff"; then
  fail "user data changed across the upgrade"
  cat "$work/fingerprint.diff" >&2
fi

# Tables whose rows expire or are pruned on their own; a smaller count there is
# not evidence of data loss.
volatile="idempotency_keys password_reset_tokens email_verification_tokens registration_invites"

while IFS='=' read -r table before; do
  after=$(sed -n "s/^${table}=//p" "$work/counts.after")
  if [[ -z $after ]]; then
    fail "table $table disappeared during the upgrade"
    continue
  fi
  if (( after < before )); then
    case " $volatile " in
      *" $table "*) echo "note: volatile table $table shrank ($before -> $after)" ;;
      *) fail "table $table lost rows ($before -> $after)" ;;
    esac
  fi
done < "$work/counts.before"

added=$(comm -13 <(cut -d= -f1 "$work/counts.before") <(cut -d= -f1 "$work/counts.after") | tr '\n' ' ')
[[ -n ${added// /} ]] && echo "note: tables added by the upgrade: $added"

if (( failures > 0 )); then
  echo
  echo "Upgrade $from -> $target_label FAILED with $failures problem(s)."
  exit 1
fi

echo
echo "Upgrade $from -> $target_label OK: migrations applied, data intact, application healthy."
