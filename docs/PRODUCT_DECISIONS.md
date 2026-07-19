# Product decisions

## Project nesting

Projects support a maximum of **three visible levels**, including the top-level
project. This keeps the sidebar scannable on narrow screens and matches the
existing create/edit validation. Dragging a subtree that would exceed the limit
is rejected as a whole; the server remains the source of truth.

## Favorites

Projects, filters, and labels are all allowed in Favorites (shown as **Pinned**
in the UI). Favorites are shortcuts, not a separate hierarchy: a pinned project
continues to appear in the Projects tree so it can be reordered and nested.

## Release label

The next public release should be **0.2.0 beta**, not 1.0. The product has a
broad surface and now has release gates, but direct-import and first-run behavior
still need feedback from multiple real Todoist datasets and clean deployments.
Stable 1.0 follows the measurable criteria in `ROADMAP.md`.

## Versioning and cadence

The project uses Semantic Versioning:

- Patch: backward-compatible fixes.
- Minor: backward-compatible features and migrations.
- Major: breaking API, configuration, or data-model changes.
- Prereleases: `MAJOR.MINOR.PATCH-beta.N`.

During beta, publish at most weekly unless a security or data-loss fix requires
an immediate patch. After 1.0, target a monthly minor release with patch releases
as needed. Database migrations are forward-only and must be exercised against a
copy of production data before a stable release.
