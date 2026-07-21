import { z } from "zod";

// Relative import: vitest has no "@/" alias configured.
import { parseRecurrence } from "./recurrence";
import { parseFilter } from "./filter";

export const dateFormats = [
  "yyyy-MM-dd",
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "dd.MM.yyyy",
] as const;

export const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(
      /^[a-z0-9][a-z0-9._-]*$/,
      "Use letters, numbers, dots, underscores or hyphens",
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  timezone: z.string().min(1).default("UTC"),
});

export const registrationRequestSchema = registerSchema.extend({
  inviteToken: z.string().min(1).optional(),
});

export const registrationInviteCreateSchema = z.object({
  username: z.union([registerSchema.shape.username, z.literal("")]).optional(),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const passwordResetFields = {
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
};

const passwordsMatch = (value: z.infer<z.ZodObject<typeof passwordResetFields>>) =>
  value.password === value.confirmPassword;

export const passwordResetFormSchema = z
  .object(passwordResetFields)
  .refine(passwordsMatch, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    ...passwordResetFields,
  })
  .refine(passwordsMatch, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const accountDeleteSchema = z.object({
  username: z.string().trim().min(1),
});

export const settingsSchema = z.object({
  name: z.string().trim().max(100).optional(),
  timezone: z.string().min(1),
  dateFormat: z.enum(dateFormats),
  weekStart: z.number().int().min(0).max(6),
  dailyGoal: z.number().int().min(1).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;

export const apiTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string().min(1).max(80)).max(32).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

const webhookUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" || url.hostname === "localhost";
}, "Webhook URL must use HTTPS or localhost");

export const webhookCreateSchema = z.object({
  url: webhookUrlSchema,
});

export const webhookUpdateSchema = z.object({
  isActive: z.boolean(),
});

export const projectColors = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
] as const;

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  icon: z.string().trim().min(1).max(16).nullable().optional(),
  color: z.enum(projectColors).default("gray"),
  parentId: z.uuid().nullable().optional(),
});

export const projectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    icon: z.string().trim().min(1).max(16).nullable().optional(),
    color: z.enum(projectColors).optional(),
    isFavorite: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    parentId: z.uuid().nullable().optional(),
    // Drag/drop placement among siblings (null means first).
    afterId: z.uuid().nullable().optional(),
    // Flat placement in Favorites; intentionally independent of parentId.
    favoriteAfterId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes given");

export const sectionCreateSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  // Explicit placement for inline section insertion (null = first section).
  afterId: z.uuid().nullable().optional(),
});

export const sectionUpdateSchema = z.union([
  // Drag-drop placement: position a section after the given sibling
  // (null = first). Keep this ahead of the legacy direction shape.
  z.object({ afterId: z.uuid().nullable() }),
  z.object({ projectId: z.uuid() }),
  z.object({ duplicate: z.literal(true) }),
  z.object({ isArchived: z.boolean() }),
  z.object({ name: z.string().trim().min(1).max(120) }),
  z.object({ direction: z.enum(["up", "down"]) }),
]);

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type SectionCreateInput = z.infer<typeof sectionCreateSchema>;
export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;

const dueDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const dueTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
// One day max is long enough for a real task block but short enough to catch typos.
const durationMinutesSchema = z.number().int().min(1).max(1440);

// Normalizes to the canonical rule string at the boundary.
const recurrenceSchema = z.string().transform((value, ctx) => {
  const rule = parseRecurrence(value);
  if (!rule) {
    ctx.addIssue({ code: "custom", message: "Unrecognized recurrence" });
    return z.NEVER;
  }
  return rule;
});

export const taskCreateSchema = z
  .object({
    projectId: z.uuid(),
    assigneeId: z.uuid().nullable().optional(),
    sectionId: z.uuid().nullable().optional(),
    parentId: z.uuid().nullable().optional(),
    // Explicit placement for inline task insertion (null = first sibling).
    afterId: z.uuid().nullable().optional(),
    content: z.string().trim().min(1).max(500),
    description: z.string().trim().max(2000).optional(),
    priority: z.number().int().min(1).max(4).default(4),
    dueDate: dueDateSchema.nullable().optional(),
    dueTime: dueTimeSchema.nullable().optional(),
    recurrence: recurrenceSchema.nullable().optional(),
    recurrenceEndDate: dueDateSchema.nullable().optional(),
    // Independent of dueDate: must-finish-by vs. when-to-work-on-it.
    deadlineDate: dueDateSchema.nullable().optional(),
    durationMinutes: durationMinutesSchema.nullable().optional(),
  })
  .refine((value) => !value.dueTime || value.dueDate, "dueTime requires dueDate")
  .refine((value) => !value.recurrence || value.dueDate, "recurrence requires dueDate")
  .refine(
    (value) => !value.recurrenceEndDate || value.recurrence,
    "recurrenceEndDate requires recurrence",
  )
  .refine(
    (value) => !value.recurrenceEndDate || !value.dueDate || value.recurrenceEndDate >= value.dueDate,
    "recurrenceEndDate cannot be before dueDate",
  );

export const taskUpdateSchema = z.union([
  // Drag-drop placement: move a task after a sibling, optionally reparenting it.
  // Must precede the general shape because
  // zod objects strip unknown keys, so it would swallow `afterId`.
  z.object({
    sectionId: z.uuid().nullable(),
    parentId: z.uuid().nullable().optional(),
    afterId: z.uuid().nullable(),
  }),
  z
    .object({
      content: z.string().trim().min(1).max(500).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      projectId: z.uuid().optional(),
      assigneeId: z.uuid().nullable().optional(),
      sectionId: z.uuid().nullable().optional(),
      dueDate: dueDateSchema.nullable().optional(),
      dueTime: dueTimeSchema.nullable().optional(),
      recurrence: recurrenceSchema.nullable().optional(),
      recurrenceEndDate: dueDateSchema.nullable().optional(),
      deadlineDate: dueDateSchema.nullable().optional(),
      durationMinutes: durationMinutesSchema.nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, "No changes given"),
  z.object({ completed: z.boolean() }),
  z.object({ direction: z.enum(["up", "down"]) }),
  z.object({ labelIds: z.array(z.uuid()) }),
]);

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const labelCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.enum(projectColors).default("gray"),
});

export const labelUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    color: z.enum(projectColors).optional(),
    isFavorite: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes given");

export type LabelCreateInput = z.infer<typeof labelCreateSchema>;
export type LabelUpdateInput = z.infer<typeof labelUpdateSchema>;

function checkFilterQuery(query: string, ctx: z.RefinementCtx) {
  const result = parseFilter(query);
  if ("error" in result) {
    ctx.addIssue({ code: "custom", message: result.error, path: ["query"] });
  }
}

export const filterCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  query: z.string().trim().min(1).max(500).superRefine(checkFilterQuery),
});

export const filterUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    query: z.string().trim().min(1).max(500).superRefine(checkFilterQuery).optional(),
    isFavorite: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes given");

export type FilterCreateInput = z.infer<typeof filterCreateSchema>;
export type FilterUpdateInput = z.infer<typeof filterUpdateSchema>;

export const commentCreateSchema = z
  .object({
    taskId: z.uuid().optional(),
    projectId: z.uuid().optional(),
    content: z.string().trim().min(1).max(2000),
  })
  .refine(
    ({ taskId, projectId }) => Boolean(taskId) !== Boolean(projectId),
    { message: "Exactly one of taskId or projectId is required", path: ["taskId"] },
  );

export const commentUpdateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type CommentUpdateInput = z.infer<typeof commentUpdateSchema>;

export const reminderCreateSchema = z.object({
  taskId: z.uuid(),
  remindAt: z.iso.datetime(),
});

export const reminderUpdateSchema = z.object({
  seen: z.literal(true),
});

export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;
export type ReminderUpdateInput = z.infer<typeof reminderUpdateSchema>;

const exportProjectSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  color: z.enum(projectColors),
  order: z.string(),
  isFavorite: z.boolean(),
  isArchived: z.boolean(),
  isInbox: z.boolean(),
});

const exportSectionSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  order: z.string(),
});

const exportTaskSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sectionId: z.uuid().nullable(),
  parentId: z.uuid().nullable(),
  content: z.string().trim().min(1).max(500),
  description: z.string().nullable(),
  priority: z.number().int().min(1).max(4),
  dueDate: dueDateSchema.nullable(),
  dueTime: dueTimeSchema.nullable(),
  recurrence: z.string().nullable(),
  recurrenceEndDate: dueDateSchema.nullable().optional().default(null),
  isCompleted: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  order: z.string(),
});

const exportLabelSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  color: z.enum(projectColors),
  isFavorite: z.boolean(),
  order: z.string(),
});

const exportTaskLabelSchema = z.object({
  taskId: z.uuid(),
  labelId: z.uuid(),
});

export const importSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string(),
    projects: z.array(exportProjectSchema),
    sections: z.array(exportSectionSchema),
    tasks: z.array(exportTaskSchema),
    labels: z.array(exportLabelSchema),
    taskLabels: z.array(exportTaskLabelSchema),
  })
  .superRefine((value, ctx) => {
    const projectIds = new Set(value.projects.map((project) => project.id));
    const sectionIds = new Set(value.sections.map((section) => section.id));
    const taskIds = new Set(value.tasks.map((task) => task.id));
    const labelIds = new Set(value.labels.map((label) => label.id));

    value.sections.forEach((section, index) => {
      if (!projectIds.has(section.projectId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown projectId",
          path: ["sections", index, "projectId"],
        });
      }
    });

    value.tasks.forEach((task, index) => {
      if (!projectIds.has(task.projectId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown projectId",
          path: ["tasks", index, "projectId"],
        });
      }
      if (task.sectionId && !sectionIds.has(task.sectionId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown sectionId",
          path: ["tasks", index, "sectionId"],
        });
      }
      if (task.parentId && !taskIds.has(task.parentId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown parentId",
          path: ["tasks", index, "parentId"],
        });
      }
    });

    value.taskLabels.forEach((taskLabel, index) => {
      if (!taskIds.has(taskLabel.taskId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown taskId",
          path: ["taskLabels", index, "taskId"],
        });
      }
      if (!labelIds.has(taskLabel.labelId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown labelId",
          path: ["taskLabels", index, "labelId"],
        });
      }
    });
  });

export type ImportInput = z.infer<typeof importSchema>;

const templateSectionSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  order: z.string(),
});

const templateTaskSchema = z.object({
  id: z.uuid(),
  sectionId: z.uuid().nullable(),
  parentId: z.uuid().nullable(),
  content: z.string().trim().min(1).max(500),
  description: z.string().nullable(),
  priority: z.number().int().min(1).max(4),
  recurrence: z.string().nullable(),
  durationMinutes: durationMinutesSchema.nullable(),
  order: z.string(),
});

export const templateSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("project-template"),
    name: z.string().trim().min(1).max(120),
    color: z.enum(projectColors),
    sections: z.array(templateSectionSchema),
    tasks: z.array(templateTaskSchema),
  })
  .superRefine((value, ctx) => {
    const sectionIds = new Set(value.sections.map((section) => section.id));
    const taskIds = new Set(value.tasks.map((task) => task.id));

    value.tasks.forEach((task, index) => {
      if (task.sectionId && !sectionIds.has(task.sectionId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown sectionId",
          path: ["tasks", index, "sectionId"],
        });
      }
      if (task.parentId && !taskIds.has(task.parentId)) {
        ctx.addIssue({
          code: "custom",
          message: "Unknown parentId",
          path: ["tasks", index, "parentId"],
        });
      }
    });
  });

export type TemplateInput = z.infer<typeof templateSchema>;
