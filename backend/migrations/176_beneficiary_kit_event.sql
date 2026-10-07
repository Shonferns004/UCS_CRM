-- 176: Which event a beneficiary last collected their kit at.
-- Stored on the beneficiaries row (same pattern as kit_given / kit_given_at)
-- so the admin list can show, filter and search it without joining audit logs
-- on every page. Backfilled from the newest KIT_GIVEN audit entry.
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS kit_event_id INT;
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS kit_event_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'beneficiaries'
      AND c.conname = 'beneficiaries_kit_event_id_fkey'
  ) THEN
    ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_kit_event_id_fkey
      FOREIGN KEY (kit_event_id) REFERENCES operator_events(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE beneficiaries b
   SET kit_event_id = x.event_id,
       kit_event_name = x.event_name
  FROM (
    SELECT DISTINCT ON (beneficiary_id)
           beneficiary_id,
           CASE WHEN details->>'event_id' ~ '^[0-9]+$'
                THEN (details->>'event_id')::INT END AS event_id,
           details->>'event_name' AS event_name
      FROM (
        -- Older audit rows left beneficiary_id NULL and only filled entity_id.
        SELECT COALESCE(beneficiary_id, entity_id) AS beneficiary_id,
               details, performed_at
          FROM beneficiary_audit_logs
         WHERE action = 'KIT_GIVEN'
           AND entity_type = 'beneficiary'
      ) l
     WHERE beneficiary_id IS NOT NULL
     ORDER BY beneficiary_id, performed_at DESC
  ) x
 WHERE b.id = x.beneficiary_id
   AND b.kit_event_id IS NULL
   AND b.kit_event_name IS NULL
   AND (x.event_id IS NOT NULL OR x.event_name IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_kit_event ON beneficiaries (kit_event_id);
