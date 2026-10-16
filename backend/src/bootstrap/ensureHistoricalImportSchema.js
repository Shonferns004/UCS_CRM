import db from '../config/db.js';

// Historical multi-sheet workbook import (Accounts → Operations → Import
// History). Preview-only until Confirm: the parser never writes; confirming
// upserts staged rows into monthly performance history keyed (worker, month).
//
// batches        — one row per uploaded file, sha256-unique (idempotent re-upload)
// monthly_perf   — the confirmed per-worker-per-month facts (history + forecast base)
// column_mappings— remembered header→field maps, keyed by a header signature so
//                  a re-upload of the same sheet layout skips the mapping step
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS historical_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL UNIQUE,
  sheet_count INT NOT NULL DEFAULT 0,
  total_rows INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes JSONB,
  parsed JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historical_monthly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES historical_import_batches(id) ON DELETE SET NULL,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  collection NUMERIC,
  target NUMERIC,
  salary NUMERIC,
  source_sheet TEXT,
  source_row INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_id, month)
);

ALTER TABLE historical_monthly_performance ADD COLUMN IF NOT EXISTS salary NUMERIC;

CREATE INDEX IF NOT EXISTS idx_hist_perf_worker_month
  ON historical_monthly_performance(worker_id, month);

CREATE TABLE IF NOT EXISTS historical_column_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  header_signature TEXT NOT NULL UNIQUE,
  mapping JSONB NOT NULL,
  sample_sheet TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

export async function ensureHistoricalImportSchema() {
  try {
    await db._pool.query(CREATE_TABLE_SQL);
    console.log('historical import tables ready');
  } catch (e) {
    console.warn('[historical import schema] skip:', e?.message || String(e));
  }
}
