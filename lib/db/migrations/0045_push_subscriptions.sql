CREATE TABLE "push_subscriptions" (
	"token_id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;