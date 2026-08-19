-- Fix duplicate NGO names: update references to point to correct (new) records, then delete old duplicates
-- Migration 072 inserted new records with proper codes but old records with same names existed
-- This script remaps all FK references from old IDs to new IDs by matching NGO name

BEGIN;

-- 1. Create a mapping table for old_id -> new_id by matching on name
CREATE TEMP TABLE ngo_id_map AS
SELECT 
  o.id AS old_id,
  n.id AS new_id,
  o.name
FROM ngos o
JOIN ngos n ON n.name = o.name
WHERE o.code NOT IN ('BSCT', 'MANN', 'AFLF', 'OTHER')
  AND n.code IN ('BSCT', 'MANN', 'AFLF', 'OTHER');

-- Show the mapping
SELECT * FROM ngo_id_map;

-- 2. Update all foreign key references
-- workers
UPDATE workers w SET ngo_id = m.new_id FROM ngo_id_map m WHERE w.ngo_id = m.old_id;
-- fro_assignments
UPDATE fro_assignments f SET ngo_id = m.new_id FROM ngo_id_map m WHERE f.ngo_id = m.old_id;
-- worker_ngo_allocations
UPDATE worker_ngo_allocations w SET ngo_id = m.new_id FROM ngo_id_map m WHERE w.ngo_id = m.old_id;
-- worker_people_allocations
UPDATE worker_people_allocations w SET ngo_id = m.new_id FROM ngo_id_map m WHERE w.ngo_id = m.old_id;
-- salary_allocations
UPDATE salary_allocations s SET ngo_id = m.new_id FROM ngo_id_map m WHERE s.ngo_id = m.old_id;
-- salary_payments
UPDATE salary_payments s SET ngo_id = m.new_id FROM ngo_id_map m WHERE s.ngo_id = m.old_id;
-- users
UPDATE users u SET ngo_id = m.new_id FROM ngo_id_map m WHERE u.ngo_id = m.old_id;
-- user_ngo_access
UPDATE user_ngo_access u SET ngo_id = m.new_id FROM ngo_id_map m WHERE u.ngo_id = m.old_id;
-- ngo_allocation_settings
UPDATE ngo_allocation_settings n SET ngo_id = m.new_id FROM ngo_id_map m WHERE n.ngo_id = m.old_id;
-- fro_station_assignments
UPDATE fro_station_assignments f SET ngo_id = m.new_id FROM ngo_id_map m WHERE f.ngo_id = m.old_id;
-- fro_monthly_targets
UPDATE fro_monthly_targets f SET ngo_id = m.new_id FROM ngo_id_map m WHERE f.ngo_id = m.old_id;
-- fro_data_requests
UPDATE fro_data_requests f SET ngo_id = m.new_id FROM ngo_id_map m WHERE f.ngo_id = m.old_id;
-- achievements
UPDATE achievements a SET ngo_id = m.new_id FROM ngo_id_map m WHERE a.ngo_id = m.old_id;
-- causes
UPDATE causes c SET ngo_id = m.new_id FROM ngo_id_map m WHERE c.ngo_id = m.old_id;
-- events
UPDATE events e SET ngo_id = m.new_id FROM ngo_id_map m WHERE e.ngo_id = m.old_id;
-- generated_letters
UPDATE generated_letters g SET ngo_id = m.new_id FROM ngo_id_map m WHERE g.ngo_id = m.old_id;
-- holidays
UPDATE holidays h SET ngo_id = m.new_id FROM ngo_id_map m WHERE h.ngo_id = m.old_id;
-- hrs
UPDATE hrs h SET ngo_id = m.new_id FROM ngo_id_map m WHERE h.ngo_id = m.old_id;
-- letter_templates
UPDATE letter_templates l SET ngo_id = m.new_id FROM ngo_id_map m WHERE l.ngo_id = m.old_id;
-- notices
UPDATE notices n SET ngo_id = m.new_id FROM ngo_id_map m WHERE n.ngo_id = m.old_id;
-- scheduled_notifications
UPDATE scheduled_notifications s SET ngo_id = m.new_id FROM ngo_id_map m WHERE s.ngo_id = m.old_id;
-- whatsapp_templates
UPDATE whatsapp_templates w SET ngo_id = m.new_id FROM ngo_id_map m WHERE w.ngo_id = m.old_id;

-- 3. Verify no references remain to old IDs
SELECT 'workers' as table_name, COUNT(*) as remaining FROM workers WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'fro_assignments', COUNT(*) FROM fro_assignments WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'worker_ngo_allocations', COUNT(*) FROM worker_ngo_allocations WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'worker_people_allocations', COUNT(*) FROM worker_people_allocations WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'salary_allocations', COUNT(*) FROM salary_allocations WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'salary_payments', COUNT(*) FROM salary_payments WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'users', COUNT(*) FROM users WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'user_ngo_access', COUNT(*) FROM user_ngo_access WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'ngo_allocation_settings', COUNT(*) FROM ngo_allocation_settings WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'fro_station_assignments', COUNT(*) FROM fro_station_assignments WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'fro_monthly_targets', COUNT(*) FROM fro_monthly_targets WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'fro_data_requests', COUNT(*) FROM fro_data_requests WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'achievements', COUNT(*) FROM achievements WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'causes', COUNT(*) FROM causes WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'events', COUNT(*) FROM events WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'generated_letters', COUNT(*) FROM generated_letters WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'holidays', COUNT(*) FROM holidays WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'hrs', COUNT(*) FROM hrs WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'letter_templates', COUNT(*) FROM letter_templates WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'notices', COUNT(*) FROM notices WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'scheduled_notifications', COUNT(*) FROM scheduled_notifications WHERE ngo_id IN (SELECT old_id FROM ngo_id_map)
UNION ALL SELECT 'whatsapp_templates', COUNT(*) FROM whatsapp_templates WHERE ngo_id IN (SELECT old_id FROM ngo_id_map);

-- 4. Delete old duplicate NGO records
DELETE FROM ngos WHERE id IN (SELECT old_id FROM ngo_id_map);

-- 5. Add unique constraint on name to prevent future duplicates
ALTER TABLE ngos ADD CONSTRAINT ngos_name_unique UNIQUE (name);

COMMIT;