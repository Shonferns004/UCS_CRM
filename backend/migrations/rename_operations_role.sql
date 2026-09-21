-- =====================================================================
-- Rename metropad role value 'OPERATIONS' -> 'OPERATOR'
-- Run in Supabase SQL Editor (Production) -- NOT the local dev DB.
--
-- IMPORTANT: Patch the backend FIRST so it expects 'OPERATOR'
-- (metropad routes authorize('ADMIN','OPERATOR'), user.service
-- VALID_ROLES = ['ADMIN','OPERATOR','VIEWER']). Otherwise this migration
-- is a no-op and operators keep the old role value, which then fails the
-- new guards after the backend is deployed.
--
-- Only metropad_users.role is changed ('OPERATIONS' -> 'OPERATOR').
-- Nothing else is touched.
-- =====================================================================

-- 0) DISCOVERY -- any role not in our known map shows up here.
--    If this returns rows, we are looking at a data value this migration
--    does not know about; reconcile BEFORE renaming.
--    Expected set after migration: ADMIN, OPERATOR, VIEWER.
SELECT role, COUNT(*) AS rows
FROM metropad_users
GROUP BY role
ORDER BY role;

-- 1) RENAME
UPDATE metropad_users
SET role = 'OPERATOR'
WHERE role = 'OPERATIONS';

-- 2) VERIFY -- should now show only ADMIN, OPERATOR, VIEWER, and the
--    'OPERATIONS' row count above should be gone.
SELECT role, COUNT(*) AS rows
FROM metropad_users
GROUP BY role
ORDER BY role;
