# TODO

## Projects

- [x] Make projects reorderable with drag and drop in the same way tasks are.
  - [x] Support reordering projects at the same nesting level.
  - [x] Support nesting and unnesting projects through drag and drop.
  - [x] Preserve the order and hierarchy after refreshing.
- [x] Decide on the maximum number of project nesting levels.

## Todoist import

- [x] Add a Todoist API connection for importing data directly from Todoist.
  - [x] Import the correct current due dates for recurring tasks so users do not have to enter them manually.
  - [x] Include the Todoist connection and import flow in first-time onboarding.
- [x] Clean imported project names by automatically removing Todoist's trailing bracketed ID.
  - Example: `project_name [6g8WPqw25HQhcQgV]` should become `project_name`.

## API and MCP

- [x] Test the API thoroughly.
- [x] Test the MCP server thoroughly.
- [x] Add or expand automated integration and end-to-end coverage for the API and MCP server.

## Onboarding

- [x] Build a first-time onboarding flow for newly registered users.
  - [x] Let users import their existing Todoist data.
  - [x] Add a short tutorial explaining the main parts of the software.
  - [x] Ensure onboarding is only shown when appropriate.
- [x] Remove the current Welcome screen that appears every time the website is opened.
  - It currently contains links to Today, Upcoming, and Inbox under “Choose where you want to focus next.”

## Sidebar and navigation

- [x] Show each project's task count in the same position as its three-dot menu.
  - [x] Show the task count by default.
  - [x] Replace the count with the three-dot menu when the project row or count is hovered or focused.
- [x] Decide whether filters and labels should be allowed in Favorites.

## Notifications

- [x] Fix the notification bell and its popup.
  - [x] Prevent the popup from being cut off by the task view or surrounding layout.
  - [x] Check popup positioning and behavior across screen sizes.

## Usability and quality

- [x] Conduct more usability testing.
- [x] Record findings and turn them into prioritized follow-up tasks.

## Roadmap and release

- [x] Create and maintain a product roadmap.
- [x] Decide whether the next public release should be a beta or v1.0.
- [x] Decide on and document a versioning and release cycle.
- [x] Define the requirements that must be completed before the beta or v1.0 release.
- [x] Prepare the beta release artifacts and a maintainer-owned publishing plan.

Publishing itself is intentionally not performed by this implementation; see
`RELEASE.md` for the maintainer checklist.
