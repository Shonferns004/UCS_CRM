-- 076: Add Library and PG NGOs
INSERT INTO ngos (name, code, is_active, created_at)
SELECT 'LIBRARY', 'LIBRARY', true, now()
WHERE NOT EXISTS (SELECT 1 FROM ngos WHERE code = 'LIBRARY');

INSERT INTO ngos (name, code, is_active, created_at)
SELECT 'PG', 'PG', true, now()
WHERE NOT EXISTS (SELECT 1 FROM ngos WHERE code = 'PG');
