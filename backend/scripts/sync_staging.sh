#!/bin/bash
# Sync today's data from production to staging
# Disables FK checks during import to avoid cross-table ordering issues
set -e

RDS_HOST=ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com
USER=ucs_admin
export PGPASSWORD=Sevak1432P
PROD_DB=postgres
STAGING_DB=ucs_crm_staging
TD=/tmp/staging_sync

mkdir -p "$TD"

pp() { psql -h "$RDS_HOST" -U "$USER" -d "$PROD_DB" -t -A "$@"; }
ps() { psql -h "$RDS_HOST" -U "$USER" -d "$STAGING_DB" -t -A "$@"; }

echo "=== Syncing today: production -> staging ==="

# Disable FK checks on staging for the import session
ps -c "SET session_replication_role = 'replica';" 2>&1 || true

# 1. donor_profiles
echo "--- 1. donor_profiles ---"
CNT=$(pp -c "SELECT count(*) FROM donor_profiles WHERE DATE(updated_at) >= CURRENT_DATE;")
echo "  Prod: $CNT"
if [ "$CNT" != "0" ] && [ -n "$CNT" ]; then
  pp -c "\copy (SELECT id,mobile_number,name,bank_donor_name,agent_donor_name,mobile_2,address_1,address_2,city,pin_code,pan_number,email,birth_date,data_category,team,agent_name,mop,donors_bank_name,project_supported,account_of,category,amount,total_amount,donation_count,first_donation_date,last_donation_date,raw_data,first_import_batch_id,first_imported_at,updated_at,station,ngo,state,aadhaar_number,anniversary,preferred_language,donor_type,created_at,donation_frequency FROM donor_profiles WHERE DATE(updated_at) >= CURRENT_DATE) TO '$TD/dp.csv' WITH CSV"
  cat > "$TD/sync.sql" << 'SQL'
SET session_replication_role = 'replica';
BEGIN;
CREATE TEMP TABLE tmp (LIKE donor_profiles) ON COMMIT DROP;
\COPY tmp FROM '/tmp/staging_sync/dp.csv' WITH CSV
INSERT INTO donor_profiles SELECT * FROM tmp ON CONFLICT DO NOTHING;
COMMIT;
SQL
  ps -f "$TD/sync.sql" 2>&1 | grep -iE "ERROR" || true
  STG=$(ps -c "SELECT count(*) FROM donor_profiles WHERE DATE(updated_at) >= CURRENT_DATE;")
  echo "  Staging: $STG"
fi

# 2. fro_assignments (depends on donor_profiles)
echo "--- 2. fro_assignments ---"
CNT=$(pp -c "SELECT count(*) FROM fro_assignments WHERE DATE(assigned_at) >= CURRENT_DATE;")
echo "  Prod: $CNT"
if [ "$CNT" != "0" ] && [ -n "$CNT" ]; then
  pp -c "\copy (SELECT * FROM fro_assignments WHERE DATE(assigned_at) >= CURRENT_DATE) TO '$TD/fa.csv' WITH CSV"
  cat > "$TD/sync.sql" << 'SQL'
SET session_replication_role = 'replica';
BEGIN;
CREATE TEMP TABLE tmp (LIKE fro_assignments) ON COMMIT DROP;
\COPY tmp FROM '/tmp/staging_sync/fa.csv' WITH CSV
INSERT INTO fro_assignments SELECT * FROM tmp ON CONFLICT DO NOTHING;
COMMIT;
SQL
  ps -f "$TD/sync.sql" 2>&1 | grep -iE "ERROR" || true
  STG=$(ps -c "SELECT count(*) FROM fro_assignments WHERE DATE(assigned_at) >= CURRENT_DATE;")
  echo "  Staging: $STG"
fi

# 3. fro_donor_logs (depends on fro_assignments)
echo "--- 3. fro_donor_logs ---"
CNT=$(pp -c "SELECT count(*) FROM fro_donor_logs WHERE DATE(created_at) = CURRENT_DATE;")
echo "  Prod: $CNT"
if [ "$CNT" != "0" ] && [ -n "$CNT" ]; then
  pp -c "\copy (SELECT id,assignment_id,action,notes,outcome,amount_collected,created_by,created_at,disposition_category,disposition_detail,scheduled_at,payment_screenshot_url,accounts_status,pan_number,verified_at,verified_by,donor_id,fro_worker_id,remark,upi_transaction_id,transaction_datetime,payment_from,payment_mode,rejection_reason FROM fro_donor_logs WHERE DATE(created_at) = CURRENT_DATE) TO '$TD/fdl.csv' WITH CSV"
  cat > "$TD/sync.sql" << 'SQL'
SET session_replication_role = 'replica';
BEGIN;
CREATE TEMP TABLE tmp (LIKE fro_donor_logs) ON COMMIT DROP;
\COPY tmp FROM '/tmp/staging_sync/fdl.csv' WITH CSV
INSERT INTO fro_donor_logs SELECT * FROM tmp ON CONFLICT DO NOTHING;
COMMIT;
SQL
  ps -f "$TD/sync.sql" 2>&1 | grep -iE "ERROR" || true
  STG=$(ps -c "SELECT count(*) FROM fro_donor_logs WHERE DATE(created_at) = CURRENT_DATE;")
  echo "  Staging: $STG"
fi

# 4. receipts (depends on fro_donor_logs)
echo "--- 4. receipts ---"
CNT=$(pp -c "SELECT count(*) FROM receipts WHERE DATE(created_at) = CURRENT_DATE;")
echo "  Prod: $CNT"
if [ "$CNT" != "0" ] && [ -n "$CNT" ]; then
  pp -c "\copy (SELECT id,log_id,receipt_no,project_id,donor_name,amount,pan_number,address,mode,purpose,receipt_date,generated_by,created_at,donor_mobile,sent,sent_at,email,payment_id,bank_name,donor_id,agent_name,receipt_time,bank_payer_name FROM receipts WHERE DATE(created_at) = CURRENT_DATE) TO '$TD/rcpt.csv' WITH CSV"
  cat > "$TD/sync.sql" << 'SQL'
SET session_replication_role = 'replica';
BEGIN;
CREATE TEMP TABLE tmp (LIKE receipts) ON COMMIT DROP;
\COPY tmp FROM '/tmp/staging_sync/rcpt.csv' WITH CSV
INSERT INTO receipts SELECT * FROM tmp ON CONFLICT DO NOTHING;
COMMIT;
SQL
  ps -f "$TD/sync.sql" 2>&1 | grep -iE "ERROR" || true
  STG=$(ps -c "SELECT count(*) FROM receipts WHERE DATE(created_at) = CURRENT_DATE;")
  echo "  Staging: $STG"
fi

# 5. bank_audit_entries (depends on receipts + donor_profiles)
echo "--- 5. bank_audit_entries ---"
CNT=$(pp -c "SELECT count(*) FROM bank_audit_entries WHERE DATE(created_at) = CURRENT_DATE OR DATE(updated_at) >= CURRENT_DATE;")
echo "  Prod: $CNT"
if [ "$CNT" != "0" ] && [ -n "$CNT" ]; then
  pp -c "\copy (SELECT * FROM bank_audit_entries WHERE DATE(created_at) = CURRENT_DATE OR DATE(updated_at) >= CURRENT_DATE) TO '$TD/bae.csv' WITH CSV"
  cat > "$TD/sync.sql" << 'SQL'
SET session_replication_role = 'replica';
BEGIN;
CREATE TEMP TABLE tmp (LIKE bank_audit_entries) ON COMMIT DROP;
\COPY tmp FROM '/tmp/staging_sync/bae.csv' WITH CSV
INSERT INTO bank_audit_entries SELECT * FROM tmp ON CONFLICT DO NOTHING;
COMMIT;
SQL
  ps -f "$TD/sync.sql" 2>&1 | grep -iE "ERROR" || true
  STG=$(ps -c "SELECT count(*) FROM bank_audit_entries WHERE DATE(created_at) = CURRENT_DATE OR DATE(updated_at) >= CURRENT_DATE;")
  echo "  Staging: $STG"
fi

# Re-enable FK checks
ps -c "SET session_replication_role = 'origin';" 2>&1 || true

echo ""
echo "=== Sync complete ==="
rm -rf "$TD"
