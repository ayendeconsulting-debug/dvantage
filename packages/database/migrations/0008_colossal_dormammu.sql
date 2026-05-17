CREATE TABLE "extension_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extension_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "extension_tokens" ADD CONSTRAINT "extension_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extension_tokens_user_idx" ON "extension_tokens" ("user_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "extension_tokens_hash_idx" ON "extension_tokens" ("token_hash") WHERE "revoked_at" IS NULL;