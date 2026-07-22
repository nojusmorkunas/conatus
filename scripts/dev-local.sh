#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .env ] || cp .env.example .env

if ! docker inspect todoist-db >/dev/null 2>&1; then
  docker run -d --name todoist-db -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app -p 5432:5432 postgres:17-alpine
else
  docker start todoist-db >/dev/null
fi

if ! docker inspect todoist-minio >/dev/null 2>&1; then
  docker run -d --name todoist-minio -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address :9001
else
  docker start todoist-minio >/dev/null
fi

if ! docker inspect todoist-mailpit >/dev/null 2>&1; then
  docker run -d --name todoist-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
else
  docker start todoist-mailpit >/dev/null
fi

echo "Waiting for database..."
until docker exec todoist-db pg_isready -U app >/dev/null 2>&1; do
  sleep 1
done

npm run db:migrate
npm run dev
