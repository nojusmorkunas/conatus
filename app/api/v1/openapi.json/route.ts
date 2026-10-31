const serverUrl = process.env.PUBLIC_BASE_URL
  ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/v1`
  : "/api/v1";

const security = [{ bearerAuth: [] }];

export async function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Conatus API",
      version: "1.0.0",
      description: "Versioned API for task-manager clients and AI agents.",
    },
    servers: [{ url: serverUrl }],
    security,
    paths: {
      "/auth/device-token": {
        post: {
          operationId: "createDeviceToken",
          security: [],
          description: "Exchange credentials or a one-time browser sign-in code for a device token. For browser sign-in (including OpenID Connect), generate a random PKCE code verifier (43–128 characters) and its unpadded base64url SHA-256 challenge, then open /device-login?device=…&challenge=…. After consent, receive com.useconatus.app:/auth?code=… or com.useconatus.app:/auth?error=access_denied, then exchange the code with codeVerifier here. Codes expire after 5 minutes and each exchange attempt consumes the code. Only the credentials path is login rate limited.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "object", required: ["username", "password", "deviceName"], properties: { username: { type: "string", minLength: 1 }, password: { type: "string", minLength: 1 }, deviceName: { type: "string", minLength: 1, maxLength: 100 } } },
                    { type: "object", required: ["code", "codeVerifier"], properties: { code: { type: "string", minLength: 1, maxLength: 100 }, codeVerifier: { type: "string", pattern: "^[A-Za-z0-9._~-]{43,128}$" } } },
                  ],
                },
              },
            },
          },
          responses: { "201": { description: "Device token, returned once" }, "400": { description: "Invalid request body" }, "401": { description: "Invalid credentials or invalid or expired code" }, "429": { description: "Too many credential attempts" } },
        },
        delete: {
          operationId: "revokeDeviceToken",
          description: "Revoke the token that authenticates this request, for signing out of an app. It stops working at once, as if revoked in settings.",
          responses: { "204": { description: "Token revoked" }, "401": { description: "No valid token" } },
        },
      },
      "/push/subscription": {
        put: {
          operationId: "setPushSubscription",
          description: "Register the push address for the device token that authenticates this request, replacing any earlier one. When something this user can see changes elsewhere, the server POSTs {\"t\":\"sync\"} to the address, at most once every few seconds, and the device syncs. It skips the device that made the change, and forgets the address when it answers 404 or 410 or when the token is revoked. Addresses must use HTTPS and must not point to loopback, private or link-local networks unless the server allows them.",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", maxLength: 2048 } } } } } },
          responses: { "204": { description: "Push address saved" }, "400": { description: "Invalid or refused address" }, "401": { description: "No valid device token" } },
        },
        delete: {
          operationId: "deletePushSubscription",
          description: "Stop push for the device token that authenticates this request.",
          responses: { "204": { description: "Push address removed" }, "401": { description: "No valid device token" } },
        },
      },
      "/filters": {
        get: { operationId: "listFilters", responses: { "200": { description: "Saved filters" } } },
        post: { operationId: "createFilter", responses: { "201": { description: "Created saved filter" } } },
      },
      "/filters/{id}": {
        patch: { operationId: "updateFilter", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated saved filter" } } },
        delete: { operationId: "deleteFilter", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted saved filter" } } },
      },
      "/attachments": {
        get: { operationId: "listAttachments", parameters: [{ name: "taskId", in: "query", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Task attachments" }, "400": { description: "taskId is required" }, "404": { description: "Task not found" } } },
        post: {
          operationId: "uploadAttachment",
          description: "Attach a non-empty file of up to 10 MB (10,485,760 bytes) to a task.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: { type: "object", required: ["taskId", "file"], properties: { taskId: { type: "string", format: "uuid" }, file: { type: "string", format: "binary", description: "Non-empty file, maximum 10 MB (10,485,760 bytes)." } } },
              },
            },
          },
          responses: { "201": { description: "Created attachment" }, "400": { description: "Missing taskId or file, or empty file" }, "404": { description: "Task not found" }, "413": { description: "File exceeds 10 MB limit" } },
        },
      },
      "/attachments/{id}": {
        get: { operationId: "downloadAttachment", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Attachment file with its content type, length and download filename", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, "404": { description: "Attachment not found" } } },
        delete: { operationId: "deleteAttachment", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Permanently deleted attachment" }, "404": { description: "Attachment not found" }, "500": { description: "Storage deletion failed" } } },
      },
      "/projects/{id}/collaborators": {
        get: { operationId: "listCollaborators", description: "Any project member can list the owner (userId and username) and collaborators (userId, username, role and createdAt).", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Object containing owner and collaborators" }, "404": { description: "Project not found" } } },
        post: { operationId: "addCollaborator", description: "Invite an existing user by username. Only the project owner may invite.", parameters: [{ $ref: "#/components/parameters/id" }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["username"], properties: { username: { type: "string" } } } } } }, responses: { "201": { description: "Added collaborator" }, "400": { description: "Username required" }, "403": { description: "Owner access required" }, "404": { description: "Project or user not found" }, "409": { description: "Already an owner or collaborator" } } },
        delete: { operationId: "removeCollaborator", description: "Owners can remove collaborators; other members may only leave by removing themselves.", parameters: [{ $ref: "#/components/parameters/id" }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userId"], properties: { userId: { type: "string", format: "uuid" } } } } } }, responses: { "200": { description: "Removed collaborator and cleared their task assignments" }, "400": { description: "Invalid userId" }, "403": { description: "Cannot remove another collaborator" }, "404": { description: "Project or collaborator not found" } } },
      },
      "/projects/{id}/completed-tasks": {
        get: {
          operationId: "listCompletedProjectTasks",
          parameters: [
            { $ref: "#/components/parameters/id" },
            { name: "sectionId", in: "query", description: "Section to list. When omitted or empty, lists tasks outside any section.", schema: { type: "string", format: "uuid" } },
            { name: "cursor", in: "query", description: "Opaque nextCursor from the previous page.", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Completed top-level tasks, newest first, in pages of 20: items and nextCursor (null on the last page)" }, "400": { description: "Invalid sectionId or cursor" }, "404": { description: "Project not found" } },
        },
      },
      "/trash/tasks/{id}/restore": {
        post: { operationId: "restoreTask", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Restored task and deleted descendants" }, "400": { description: "Restore the parent task first" }, "404": { description: "Deleted task not found in an accessible active project" } } },
      },
      "/trash/projects/{id}/restore": {
        post: { operationId: "restoreProject", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Restored owned project and descendants" }, "400": { description: "Restore the parent project first" }, "404": { description: "Deleted owned project not found" } } },
      },
      "/settings": {
        patch: { operationId: "updateSettings", description: "Update name, time zone, date format, first day of the week, daily goal, activity graph source, start page and email reminders. Send only the fields to change.", responses: { "200": { description: "Settings updated" }, "400": { description: "Invalid settings" } } },
      },
      "/context": { get: { operationId: "getWorkspaceContext", description: "The signed-in user, today in their time zone, the Inbox and the token's scopes. user.emailRemindersAvailable is false when the server can't email reminders, because SMTP isn't set up or the user has no email address.", responses: { "200": { description: "Workspace context" } } } },
      "/projects": {
        get: { operationId: "listProjects", responses: { "200": { description: "Projects" } } },
        post: { operationId: "createProject", parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 200 } }], responses: { "201": { description: "Created project" } } },
      },
      "/projects/{id}": {
        get: { operationId: "getProject", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Project" } } },
        patch: { operationId: "updateProject", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated project" } } },
        delete: { operationId: "deleteProject", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted project" } } },
      },
      "/tasks": {
        get: {
          operationId: "listTasks",
          parameters: ["projectId", "sectionId", "parentId", "labelId", "completed", "priority", "dueBefore", "dueAfter", "query", "cursor", "limit", "updatedSince", "includeDeleted"].map((name) => ({ name, in: "query", schema: { type: "string" } })),
          responses: { "200": { description: "Cursor-paginated tasks with a serverTime sync watermark" } },
        },
        post: {
          operationId: "createTask",
          parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 200 } }],
          responses: { "201": { description: "Created task" } },
        },
      },
      "/tasks/quick-add": { post: { operationId: "quickAddTask", responses: { "201": { description: "Parsed and created task" } } } },
      "/tasks/{id}": {
        get: { operationId: "getTask", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Task with labels, comments and reminders" } } },
        patch: { operationId: "updateTask", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated task" } } },
        delete: { operationId: "deleteTask", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted task" } } },
      },
      "/labels": { get: { operationId: "listLabels", responses: { "200": { description: "Labels" } } }, post: { operationId: "createLabel", parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 200 } }], responses: { "201": { description: "Created label" } } } },
      "/labels/{id}": {
        patch: { operationId: "updateLabel", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated label" } } },
        delete: { operationId: "deleteLabel", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted label" } } },
      },
      "/sections": {
        get: { operationId: "listSections", parameters: [{ name: "projectId", in: "query", schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Sections" } } },
        post: { operationId: "createSection", parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 200 } }], responses: { "201": { description: "Created section" } } },
      },
      "/sections/{id}": {
        patch: { operationId: "updateSection", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated section" } } },
        delete: { operationId: "deleteSection", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted section" } } },
      },
      "/comments": { get: { operationId: "listComments", responses: { "200": { description: "Comments" } } }, post: { operationId: "addComment", responses: { "201": { description: "Created comment" } } } },
      "/comments/{id}": {
        patch: { operationId: "updateComment", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated comment" } } },
        delete: { operationId: "deleteComment", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted comment" } } },
      },
      "/reminders": {
        get: {
          operationId: "listReminders",
          description: "The caller's reminders for one task, or across tasks: with due=1 the unseen ones whose time has come, with pending=1 every unseen one, including those still to come.",
          parameters: [
            { name: "taskId", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "due", in: "query", schema: { type: "string", enum: ["1"] } },
            { name: "pending", in: "query", schema: { type: "string", enum: ["1"] } },
          ],
          responses: { "200": { description: "Reminders" }, "400": { description: "taskId, due or pending is required" } },
        },
        post: { operationId: "createReminder", responses: { "201": { description: "Created reminder" } } },
      },
      "/reminders/{id}": {
        patch: {
          operationId: "updateReminder",
          description: "Send {\"seen\":true} to mark a reminder seen, or {\"remindAt\":\"<ISO time>\"} to move it, for example to snooze it. A moved reminder is unseen again and its email goes out at the new time.",
          parameters: [{ $ref: "#/components/parameters/id" }],
          requestBody: { required: true, content: { "application/json": { schema: { oneOf: [{ type: "object", required: ["seen"], properties: { seen: { const: true } } }, { type: "object", required: ["remindAt"], properties: { remindAt: { type: "string", format: "date-time" } } }] } } } },
          responses: { "200": { description: "Updated reminder" }, "400": { description: "Invalid body" }, "404": { description: "Reminder not found" } },
        },
        delete: { operationId: "deleteReminder", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted reminder" } } },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "tdm token" },
      },
      parameters: {
        id: { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      },
    },
  });
}
