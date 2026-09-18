ALTER TABLE "users" ADD COLUMN "start_page" text DEFAULT 'today' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_label_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;