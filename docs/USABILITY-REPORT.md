# Usability review

Date: 2026-07-19

Method: heuristic review of the first-run path, sidebar navigation, import flow,
keyboard access, and responsive layouts, followed by automated browser smoke
checks at desktop and narrow viewport sizes. This is a product-quality review,
not a substitute for moderated sessions with external users.

## Findings and disposition

| Priority | Finding | Disposition |
| --- | --- | --- |
| P0 | The Welcome page appeared repeatedly and did not preserve first-run completion. | Replaced with persisted onboarding shown only to new accounts. |
| P0 | CSV backups omit the current occurrence of recurring tasks, forcing manual entry. | Added a direct API connection that imports Todoist's current due object; backup import remains explicit about missing dates. |
| P1 | Projects could be nested only through forms and their sidebar order was fixed. | Added pointer and keyboard drag/drop with horizontal nesting and server-persisted order. |
| P1 | Reminder popup could be clipped by the sidebar/task layout. | Rendered it in a viewport-level portal with collision-aware width/position and bounded scrolling. |
| P1 | Project count and action menu competed for horizontal space. | Count now owns a fixed action slot and swaps to the menu on hover/focus. Zero counts are visible. |
| P2 | Pinned projects disappeared from the main hierarchy, making reorganization surprising. | Pinned is now a shortcut; projects remain in the main tree. |
| P2 | Import entry copy described only backup files. | Updated settings and onboarding to offer direct connection or backup. |

## Follow-up research

Before 1.0, run five moderated sessions covering: new account without import,
API import, backup import with recurrence review, project nesting by mouse and
keyboard, and reminder dismissal on a 390 px screen. Record time-on-task,
misclicks, verbal confusion, import warnings, and whether assistance was needed.
Convert any repeated failure (two or more participants) into a P1 issue.
