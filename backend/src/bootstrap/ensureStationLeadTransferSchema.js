import db from '../config/db.js';

export async function ensureStationLeadTransferSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS public.station_lead_transfers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ngo_id uuid NOT NULL REFERENCES public.ngos(id) ON DELETE CASCADE,
      source_station text NOT NULL,
      target_station text NOT NULL,
      filter_key text NOT NULL DEFAULT 'all',
      bsct_filter_key text NOT NULL DEFAULT 'all',
      donor_count integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'active',
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      restored_at timestamptz,
      restored_by uuid
    )`,
    `CREATE TABLE IF NOT EXISTS public.station_lead_transfer_items (
      id bigserial PRIMARY KEY,
      transfer_id uuid NOT NULL REFERENCES public.station_lead_transfers(id) ON DELETE CASCADE,
      assignment_id integer NOT NULL,
      donor_id integer NOT NULL,
      source_station text,
      target_station text,
      source_fro_worker_id uuid,
      original_status text,
      restored boolean NOT NULL DEFAULT false,
      restored_at timestamptz,
      restored_by uuid
    )`,
    `ALTER TABLE public.station_lead_transfers
       ADD COLUMN IF NOT EXISTS bsct_filter_key text NOT NULL DEFAULT 'all'`,
    `CREATE INDEX IF NOT EXISTS station_lead_transfers_ngo_created_idx
       ON public.station_lead_transfers (ngo_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS station_lead_transfer_items_transfer_idx
       ON public.station_lead_transfer_items (transfer_id)`,
    `CREATE INDEX IF NOT EXISTS station_lead_transfer_items_donor_idx
       ON public.station_lead_transfer_items (donor_id)`,
  ];
  for (const sql of statements) {
    await db._pool.query(sql);
  }
}
