# Contributing to Conatus

This guide covers local development and verification. Contributions should keep
`main` releasable. Use a short-lived branch, open a pull request and merge only
after every required check passes.

## Development setup

```bash
cp .env.example .env
npm ci
npm run dev
```

Point `DATABASE_URL` at a development PostgreSQL instance. Attachments require
MinIO. Email is optional.

Registration is invite-only. On an empty database, `/register` allows the
first username/password account to bootstrap the server and makes that account
the instance administrator. No email address or SMTP configuration is required.
After signing in, that administrator can create single-use, seven-day signup
links under **Settings → Registration**.

## Required checks

Run the application checks:

```bash
npm ci
npm test
npm run lint
npm run build
npm run test:e2e
```

Run the MCP server checks:

```bash
npm --prefix mcp-server ci
npm --prefix mcp-server test
npm --prefix mcp-server run lint
npm --prefix mcp-server run build
```

Validate the container deployment:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml config
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
docker compose ps
curl --fail http://localhost:4399/api/health
docker compose down
```

## Local container development

Build and run the current checkout with the Compose build override:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

When both bootstrap variables are set, an administrator is created only if the
database is empty. Existing accounts are never updated from the environment.
After the first login, change the password under **Settings → Account**, then
remove both bootstrap variables from `.env` and remove the stopped container
that held the initial password:

```bash
docker compose rm -f bootstrap
```

## API and webhook integration

Create a scoped access token in Settings. The token is shown only once, so copy
it before leaving the page. Send it as a bearer token to any protected v1 API
route:

```bash
curl -H "Authorization: Bearer tdm_..." "http://localhost:4399/api/v1/tasks?completed=false"
```

Tokens can be reviewed and revoked from Settings. The OpenAPI 3.1 description
is served at `/api/v1/openapi.json`. Mutating task creation endpoints accept
`Idempotency-Key` while list endpoints use opaque cursor pagination.

Add HTTPS or localhost endpoints in Settings to receive `task.created`,
`task.completed`, `task.uncompleted`, `task.deleted`, `comment.added`,
`project.created`, `project.archived` and `project.deleted` events. Each POST
body is `{ type, taskContent, projectId, projectName, occurredAt }`. Verify the
`X-Webhook-Signature` header by computing an HMAC-SHA256 of the raw request
body with the webhook secret, which is shown only once when the endpoint is
created.

## Database migrations and backups

```bash
npm run db:generate   # generate a migration from lib/db/schema.ts
npm run db:migrate    # apply migrations
npm run db:studio     # browse the database
```

The `backup` service in `docker-compose.yml` dumps the database on a timer into
the `backups` volume. It keeps the newest `BACKUP_KEEP` dumps, which defaults
to 7. The default `BACKUP_INTERVAL` is 86400 seconds. Override either value
through environment variables.

Restore a dump:

```bash
docker compose exec -T db pg_restore -U app -d app --clean --if-exists < /path/to/app-<timestamp>.dump
```

Create a manual dump:

```bash
docker compose exec db pg_dump -U app -Fc app > backup.dump
```
