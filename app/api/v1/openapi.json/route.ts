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
          responses: { "201": { description: "Device token, returned once" }, "401": { description: "Invalid credentials" }, "429": { description: "Too many attempts" } },
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
        patch: { operationId: "updateSettings", description: "Update name, time zone, date format, first day of the week, daily goal, activity graph source, start page and email reminders using the settings fields.", responses: { "200": { description: "Settings updated" }, "400": { description: "Invalid settings" } } },
      },
      "/context": { get: { operationId: "getWorkspaceContext", responses: { "200": { description: "Workspace context" } } } },
      "/projects": {
        get: { operationId: "listProjects", responses: { "200": { description: "Projects" } } },
        post: { operationId: "createProject", responses: { "201": { description: "Created project" } } },
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
      "/labels": { get: { operationId: "listLabels", responses: { "200": { description: "Labels" } } }, post: { operationId: "createLabel", responses: { "201": { description: "Created label" } } } },
      "/labels/{id}": {
        patch: { operationId: "updateLabel", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated label" } } },
        delete: { operationId: "deleteLabel", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Deleted label" } } },
      },
      "/sections": {
        get: { operationId: "listSections", parameters: [{ name: "projectId", in: "query", schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Sections" } } },
        post: { operationId: "createSection", responses: { "201": { description: "Created section" } } },
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
      "/reminders": { get: { operationId: "listReminders", responses: { "200": { description: "Reminders" } } }, post: { operationId: "createReminder", responses: { "201": { description: "Created reminder" } } } },
      "/reminders/{id}": {
        patch: { operationId: "updateReminder", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { description: "Updated reminder" } } },
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
