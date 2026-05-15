CREATE TYPE "public"."optimization_status" AS ENUM('none', 'pending', 'optimizing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scoring_status" AS ENUM('pending', 'scoring', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "ats_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"resume_version_id" text NOT NULL,
	"job_description_id" text NOT NULL,
	"scoring_status" "scoring_status" DEFAULT 'pending' NOT NULL,
	"overall_score" integer,
	"section_scores" jsonb,
	"keyword_gaps" jsonb,
	"matched_keywords" jsonb,
	"recommendations" jsonb,
	"score_error" text,
	"optimization_status" "optimization_status" DEFAULT 'none' NOT NULL,
	"optimized_structured_data" jsonb,
	"optimization_change_log" jsonb,
	"optimization_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ats_scores" ADD CONSTRAINT "ats_scores_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_scores" ADD CONSTRAINT "ats_scores_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ats_scores_job_description_idx" ON "ats_scores" USING btree ("job_description_id");--> statement-breakpoint
CREATE INDEX "ats_scores_resume_version_idx" ON "ats_scores" USING btree ("resume_version_id");