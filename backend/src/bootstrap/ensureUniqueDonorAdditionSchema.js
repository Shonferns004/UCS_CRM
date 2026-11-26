import db from '../config/db.js';

export async function ensureUniqueDonorAdditionSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS public.unique_donor_additions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_ngo_id uuid NOT NULL REFERENCES public.ngos(id) ON DELETE CASCADE,
      target_ngo_id uuid NOT NULL REFERENCES public.ngos(id) ON DELETE CASCADE,
      target_station text NOT NULL,
      filter_key text NOT NULL DEFAULT 'all',
      donor_count integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'active',
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      restored_at timestamptz,
      restored_by uuid
    )`,
    `CREATE TABLE IF NOT EXISTS public.unique_donor_addition_items (
      id bigserial PRIMARY KEY,
      addition_id uuid NOT NULL REFERENCES public.unique_donor_additions(id) ON DELETE CASCADE,
      donor_id integer NOT NULL,
      bsct_assignment_id integer NOT NULL,
      mode text NOT NULL DEFAULT 'created',
      original_station text,
      original_fro_worker_id uuid,
      restored boolean NOT NULL DEFAULT false,
      restored_at timestamptz,
      restored_by uuid
    )`,
    `CREATE INDEX IF NOT EXISTS unique_donor_additions_created_idx
       ON public.unique_donor_additions (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS unique_donor_addition_items_addition_idx
       ON public.unique_donor_addition_items (addition_id)`,
  ];
  for (const sql of statements) await db._pool.query(sql);
}
