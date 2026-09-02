#!/usr/bin/env bash
# Throws away the local database and rebuilds it from the demo seed. Kept
# separate from dev-local.sh so starting the dev server the usual way can
# never eat local data by accident.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "${1:-}" != "--yes" ]; then
  read -r -p "This deletes the todoist-db container and everything in it. Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

[ -f .env ] || cp .env.example .env

docker rm -f todoist-db >/dev/null 2>&1 || true
docker run -d --name todoist-db \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app \
  -p 5432:5432 postgres:17-alpine >/dev/null

echo "Waiting for database..."
until docker exec todoist-db pg_isready -U app >/dev/null 2>&1; do
  sleep 1
done

npm run db:migrate
npm run db:seed

echo
echo "Done. Start the app with: npm run dev:local"
