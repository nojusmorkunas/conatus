# Product roadmap

This roadmap is reviewed before each release candidate. Priorities are based on
user impact, data safety, and operational risk—not feature count.

## Current release: 0.2.0 beta

Goal: validate the complete self-hosted workflow with a small group before a
stable 1.0.

- First-time onboarding with a concise product tutorial and optional Todoist import.
- Direct Todoist API import, including current recurring occurrences.
- Reorderable and nestable projects with a three-level hierarchy limit.
- Versioned API, scoped tokens, OpenAPI description, idempotent task creation.
- Independently deployable MCP server with stdio, HTTP, OAuth, and safe tools.
- Responsive in-app reminders and clearer sidebar project counts.
- Automated unit, contract, integration, and browser smoke coverage.

## Beta follow-up

- Run five moderated first-run sessions and record completion time and blockers.
- Test imports on small, large, deeply nested, and multilingual Todoist accounts.
- Exercise backup restore and database migrations on a clean production-like host.
- Triage beta feedback weekly; fix all data-loss, auth, and accessibility defects first.
- Add browser push notifications only if beta feedback shows the in-app/email model is insufficient.

## 1.0 requirements

- No open P0/P1 data-loss, authentication, authorization, migration, or accessibility defects.
- Successful clean install, upgrade, backup, and restore rehearsals with documented evidence.
- Core browser journeys pass on current Chromium, Firefox, WebKit, and a 390 px viewport.
- API and MCP contract/integration suites pass against the release build.
- Todoist API and backup imports pass the published import fixture matrix.
- At least two beta iterations with no schema rollback and no unresolved critical feedback.
- Operator documentation covers secrets, SMTP, object storage, jobs, health checks, backup, and restore.

## Later

- PostgreSQL full-text search when dataset profiling shows `ILIKE` is a bottleneck.
- Additional collaboration roles and workspace-level administration.
- Optional browser/push notifications.
- CalDAV or broader calendar interoperability after the 1.0 data model stabilizes.

See [RELEASE.md](./RELEASE.md) for the release cycle and maintainer publishing plan.
