# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

## 0.2.0-beta.1 — unreleased

### Added

- Persisted first-time onboarding with a short product tutorial.
- Direct Todoist API import with current recurring due dates, hierarchy, labels, and comments.
- Pointer and keyboard project drag/drop with nesting and unnesting.
- Versioned scoped API, OpenAPI contract, and independently deployable MCP server.
- API/MCP contract and integration coverage plus a maintainer release plan.

### Changed

- Project hierarchy is explicitly limited to three levels.
- Pinned projects remain visible in the Projects tree.
- Project task counts share their slot with the row action menu.
- Todoist backup names have trailing bracketed IDs removed automatically.

### Fixed

- Reminder popup is viewport-positioned and no longer clipped by surrounding layouts.
- The recurring-date import path no longer asks for manual dates when using the Todoist API.
