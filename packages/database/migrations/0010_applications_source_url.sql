-- ============================================================
-- Migration 0010 — applications: source_url + dedup index
-- ============================================================
-- Adds source_url to store the application form page URL, and
-- a partial unique index on (user_id, source_url, applied_date)
-- to prevent duplicate capture rows when the extension autofills
-- the same form more than once in a calendar day.
--
-- Partial (WHERE source_url IS NOT NULL) so all pre-migration
-- rows without source_url are unaffected by the constraint.
-- ============================================================

ALTER TABLE applications
  ADD COLUMN source_url TEXT;

--> statement-breakpoint

CREATE UNIQUE INDEX uq_applications_user_source_date
  ON applications (user_id, source_url, applied_date)
  WHERE source_url IS NOT NULL;
