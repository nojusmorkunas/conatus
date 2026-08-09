# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

## 0.2.0-beta.1 — unreleased

### Added

- Username/password registration with no email or SMTP requirement.
- Optional one-time administrator bootstrap through Docker environment variables.
- Persisted first-time onboarding with a short product tutorial.
- Direct Todoist API import with current recurring due dates, hierarchy, labels, and comments.
- Pointer and keyboard project drag/drop with nesting and unnesting.
- Versioned scoped API, OpenAPI contract, and independently deployable MCP server.
- API/MCP contract and integration coverage plus a maintainer release plan.
- Year-long activity graph on Stats, with a preference for which events it counts.
- Task delta sync through `updatedSince` and `includeDeleted`, with a `serverTime` watermark for the next pull.
- Device token endpoint that exchanges a password for a scoped token, so native clients do not need a browser session.
- Section listing on the versioned API, filterable by project.

### Changed

- License is offered as AGPL-3.0-or-later for the app and the MCP server.
- Project hierarchy is explicitly limited to three levels.
- Pinned projects remain visible in the Projects tree.
- Project task counts share their slot with the row action menu.
- Todoist backup names have trailing bracketed IDs removed automatically.

### Fixed

- The OpenAPI description advertised `GET /sections` with no handler behind it, so generated clients got a 405.
- Reminder popup is viewport-positioned and no longer clipped by surrounding layouts.
- The recurring-date import path no longer asks for manual dates when using the Todoist API.
