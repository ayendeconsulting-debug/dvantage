ALTER TABLE "ats_scores" ADD COLUMN "optimized_overall_score" integer;--> statement-breakpoint
ALTER TABLE "ats_scores" ADD COLUMN "optimized_section_scores" jsonb;