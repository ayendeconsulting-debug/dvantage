-- Vantage — PostgreSQL initialisation script
-- Runs once on first container boot via /docker-entrypoint-initdb.d/
-- Safe to re-run (all statements use IF NOT EXISTS / OR REPLACE).

-- ── Extensions ──────────────────────────────────────────────────────────────

-- pgvector — semantic similarity search (ATS scoring engine)
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm — trigram text search (keyword matching, fuzzy search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gin — composite GIN indexes (used on jsonb + filter columns)
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- pg_stat_statements — query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ── Database config ──────────────────────────────────────────────────────────

-- Confirm pgvector loaded correctly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'pgvector extension failed to load';
  END IF;
  RAISE NOTICE '✓ pgvector loaded successfully';
END $$;

-- Log init completion
DO $$
BEGIN
  RAISE NOTICE '✓ Vantage database initialised at %', now();
END $$;
