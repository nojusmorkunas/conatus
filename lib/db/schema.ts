import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull().unique(),
    email: text("email").unique(),
    name: text("name"),
    image: text("image"),
    passwordHash: text("password_hash"),
    emailVerified: timestamp("email_verified"),
    // Instance administration is intentionally separate from project roles.
    // The first account is promoted to admin during server bootstrap.
    instanceRole: text("instance_role").notNull().default("member"),
    timezone: text("timezone").notNull().default("UTC"),
    dateFormat: text("date_format").notNull().default("yyyy-MM-dd"),
    weekStart: integer("week_start").notNull().default(1),
    dailyGoal: integer("daily_goal").notNull().default(5),
    // Null only for a newly-created account. The onboarding completion route
    // records the first-run choice so the flow is never shown on every visit.
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    // Bearer credential for the iCal feed URL; null means the feed is disabled.
    icalToken: text("ical_token").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
  ],
);

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  scopes: jsonb("scopes")
    .$type<string[]>()
    .notNull()
    .default(sql`'["legacy:full"]'::jsonb`),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_user_operation_key_unique").on(
      table.userId,
      table.operation,
      table.key,
    ),
  ],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const registrationInvites = pgTable("registration_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  // Null creates a shareable one-time link; otherwise registration is locked
  // to this normalized email address.
  username: text("username"),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  usedByUserId: uuid("used_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references(
    (): AnyPgColumn => projects.id,
    { onDelete: "set null" },
  ),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color").notNull().default("gray"),
  order: text("order").notNull(),
  // Independent flat ordering in the Pinned/Favorites sidebar group.
  favoriteOrder: text("favorite_order"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  // The Inbox every user gets at registration; it can't be renamed or deleted.
  isInbox: boolean("is_inbox").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Owner is projects.userId — never mirrored here. Only "editor" exists for
// now; the column is text so more roles don't need a migration.
export const projectCollaborators = pgTable(
  "project_collaborators",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("editor"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })],
);

export const projectInvitations = pgTable(
  "project_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("editor"),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_invitations_project_id_email_unique").on(
      table.projectId,
      table.email,
    ),
  ],
);

export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: text("order").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const labels = pgTable("labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("gray"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  order: text("order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  assigneeId: uuid("assignee_id").references(() => users.id, {
    onDelete: "set null",
  }),
  sectionId: uuid("section_id").references(() => sections.id, {
    onDelete: "cascade",
  }),
  parentId: uuid("parent_id").references(
    (): AnyPgColumn => tasks.id,
    { onDelete: "cascade" },
  ),
  content: text("content").notNull(),
  description: text("description"),
  // 1 = P1 (most urgent) through 4 = P4 (default, no priority set).
  priority: integer("priority").notNull().default(4),
  // 'YYYY-MM-DD' / 'HH:mm' as text: date-only comparisons against the
  // user's "today" stay timezone-trivial. dueTime requires dueDate
  // (enforced at validation).
  dueDate: text("due_date"),
  dueTime: text("due_time"),
  // 'YYYY-MM-DD'. Independent of dueDate: due = when to work on it,
  // deadline = must-finish-by. Never derived from or synced to dueDate.
  deadlineDate: text("deadline_date"),
  // Canonical rule string from parseRecurrence ("every day", "every 2 weeks",
  // "every monday"). Requires dueDate; clearing dueDate clears this too.
  recurrence: text("recurrence"),
  // Inclusive final occurrence for a recurring task. When completing an
  // occurrence would advance past this date, the task is completed normally.
  recurrenceEndDate: text("recurrence_end_date"),
  // Estimated length in minutes, independent of dueDate/dueTime. Used by
  // the calendar layout to size blocks.
  durationMinutes: integer("duration_minutes"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  order: text("order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.labelId] })],
);

export const filters = pgTable("filters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  query: text("query").notNull(),
  order: text("order").notNull(),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "comments_exactly_one_parent",
      sql`(${table.taskId} IS NULL) <> (${table.projectId} IS NULL)`,
    ),
  ],
);

// Task-level only for now (no commentId) — comment attachments from the
// spec are a scope cut; add a nullable commentId column later if needed.
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Absolute datetime reminders only — relative ("30 min before due") and
// location reminders from the spec are deferred.
export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  remindAt: timestamp("remind_at").notNull(),
  sentAt: timestamp("sent_at"),
  seenAt: timestamp("seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Immutable audit trail: no updatedAt, and taskContent/projectName are
// snapshots so events still read sensibly after the task/project is gone.
export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  taskContent: text("task_content").notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  projectName: text("project_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
