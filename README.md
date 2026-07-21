# Conatus

Self-hosted, open-source task manager inspired by Todoist.

Projects, sections, labels, subtasks and priorities; quick add with a token
grammar (`#project @label p1 tomorrow at 9 for 2h {friday} every monday`);
due dates, deadlines, durations and recurring tasks (including
completion-relative `every!` rules); Today/Upcoming/Calendar views with
drag-to-reschedule; list and board layouts; a filter query language with
saved filters; comments, file attachments and reminders (in-app + email);
project sharing with editor roles; activity log, productivity stats, JSON
export/import, an iCal feed, API tokens, webhooks and scheduled backups.

## Local development

```bash
cp .env.example .env      # then point DATABASE_URL at a running Postgres
npm install
npm run dev
```

Attachments need a MinIO container. Email reminders are optional and activate
only when all SMTP variables are configured; everything else runs without mail.

Registration is invite-only. On an empty database, `/register` allows the
first username/password account to bootstrap the server and makes that account
the instance administrator. No email address or SMTP configuration is required.
After signing in, that administrator can create single-use, seven-day signup
links under **Settings → Registration**.

## Tests

```bash
npm test          # vitest unit suites (parser, recurrence, filters, ...)
npm run test:e2e  # Playwright flows against a dev server
```

## Self-hosted deployment

Each published GitHub Release automatically produces multi-platform
(`linux/amd64` and `linux/arm64`) images in GitHub Container Registry:

- `ghcr.io/nojusmorkunas/conatus:<version>`: application
- `ghcr.io/nojusmorkunas/conatus:<version>-ops`: matching migrations and bootstrap tooling
- `ghcr.io/nojusmorkunas/conatus-mcp:<version>`: optional MCP server

The packages must be public for anonymous pulls. If the repository or packages
are private, authenticate first with `docker login ghcr.io` using a token with
package read access.

Container builds are also checked on every pull request and push to `main`, so
an image-breaking change fails before a release is published.

Deploy a specific release rather than `latest` so upgrades are deliberate and
rollbacks keep the application plus migration tooling aligned. Release tags such
as `v0.2.0` become image tags such as `0.2.0`.

The application is a Docker image. After the release workflow publishes the
first version, Docker can pull it directly:

```bash
docker pull ghcr.io/nojusmorkunas/conatus:0.2.0-beta.1
```

That image runs the Conatus application. It requires PostgreSQL plus
S3-compatible object storage. If those services already exist, run the image
directly with `DATABASE_URL` and the documented application environment
variables.

For a complete installation, Docker Compose starts the application image plus
PostgreSQL, MinIO, migrations and backups. It downloads images with
`docker compose pull`; it does not build the source. No source checkout is
required:

```bash
VERSION=0.2.0-beta.1
mkdir conatus && cd conatus
curl --fail --location \
  "https://github.com/nojusmorkunas/conatus/releases/download/v${VERSION}/docker-compose.yml" \
  --output docker-compose.yml
curl --fail --location \
  "https://github.com/nojusmorkunas/conatus/releases/download/v${VERSION}/.env.example" \
  --output .env
# Set CONATUS_VERSION to $VERSION. Set POSTGRES_PASSWORD, AUTH_SECRET,
# S3_ACCESS_KEY and S3_SECRET_KEY. The optional CONATUS_ADMIN variables create
# the first administrator without an interactive registration.
# Behind a domain/reverse proxy, set AUTH_URL and PUBLIC_BASE_URL to its
# external HTTPS origin.
docker compose pull
docker compose up -d
```

This pulls versioned release artifacts and runs the app, Postgres, MinIO,
migrations, admin bootstrap and scheduled database backups. The app is exposed
on port 3000; put it behind an HTTPS reverse proxy for internet-facing use. The
database and MinIO ports bind only to localhost. See `docker-compose.yml`.

To deploy a newer release, back up first, update `CONATUS_VERSION`, then repeat
`docker compose pull && docker compose up -d`. To roll application code back,
restore the prior version and run the same commands; database migrations may
require restoring the pre-upgrade backup if they are not backward-compatible.

Maintainers can build and run the current checkout with the build override:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

When both
bootstrap variables are set, an administrator is created only if the
database is empty. Existing accounts are never updated from the environment.
After the first login, change the password under **Settings → Account**, then remove both
bootstrap variables from `.env` and remove the stopped container that held the
initial password:

```bash
docker compose rm -f bootstrap
```

## API and MCP access

Create a scoped access token in Settings. The token is shown only once,
so copy it before leaving the page. Send it as a bearer token to any protected
v1 API route:

```bash
curl -H "Authorization: Bearer tdm_..." "http://localhost:3000/api/v1/tasks?completed=false"
```

Tokens can be reviewed and revoked from Settings.

The OpenAPI 3.1 description is served at `/api/v1/openapi.json`. Mutating task
creation endpoints accept `Idempotency-Key` while list endpoints use opaque cursor
pagination.

The independently installable MCP package lives in [`mcp-server`](./mcp-server).
It provides local stdio and remote Streamable HTTP transports so MCP-compatible
AI agents can manage tasks without direct database access. Remote mode supports
OAuth discovery, dynamic client registration, browser approval, S256 PKCE,
refresh-token rotation plus a static bearer fallback. A typical deployment uses
`tasks.example.com` for this app and `mcp.example.com/mcp` for the MCP sidecar. See
[`mcp-server/README.md`](./mcp-server/README.md) for client configuration.

## Webhooks

Add HTTPS (or localhost) endpoints in Settings to receive `task.created`,
`task.completed`, `task.uncompleted`, `task.deleted`, `comment.added`,
`project.created`, `project.archived` and `project.deleted` events. Each POST body
is `{ type, taskContent, projectId, projectName, occurredAt }`. Verify the
`X-Webhook-Signature` header by computing an HMAC-SHA256 of the raw request body
with the webhook secret, which is shown only once when the endpoint is created.

## Database migrations

```bash
npm run db:generate   # generate a migration from lib/db/schema.ts
npm run db:migrate     # apply migrations
npm run db:studio      # browse the database
```

## Backups

The `backup` service in `docker-compose.yml` dumps the database on a timer
into the `backups` volume, keeping the newest `BACKUP_KEEP` dumps (default
7, every `BACKUP_INTERVAL` seconds, default 86400/daily). Override either
via env vars.

Restore a dump:

```bash
docker compose exec -T db pg_restore -U app -d app --clean --if-exists < /path/to/app-<timestamp>.dump
```

Manual dump:

```bash
docker compose exec db pg_dump -U app -Fc app > backup.dump
```

## Contributing and releases

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development checks plus the
complete beta, stable and container release process.

## License

AGPL-3.0. See `LICENSE`.
