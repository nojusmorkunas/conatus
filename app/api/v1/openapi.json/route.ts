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
          parameters: ["projectId", "sectionId", "parentId", "labelId", "completed", "priority", "dueBefore", "dueAfter", "query", "cursor", "limit"].map((name) => ({ name, in: "query", schema: { type: "string" } })),
          responses: { "200": { description: "Cursor-paginated tasks" } },
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
        get: { operationId: "listSections", responses: { "200": { description: "Sections" } } },
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
