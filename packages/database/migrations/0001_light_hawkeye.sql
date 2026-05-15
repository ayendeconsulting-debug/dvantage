CREATE TYPE "public"."parse_status" AS ENUM('pending', 'uploading', 'uploaded', 'parsing', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"raw_text" text,
	"structured_data" jsonb,
	"parse_error" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_user_version_unique" ON "resume_versions" USING btree ("user_id","version_number");