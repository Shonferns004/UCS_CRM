#!/bin/bash
# Runs on the EC2 box against AWS RDS. Searches for a donor/record.
export PGPASSWORD=ucscompany123
PSQL="psql -h ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com -p 5432 -U ucs_admin -d postgres -P pager=off"

echo "=== suspense_donations count ==="
$PSQL -t -A -c "SELECT count(*) FROM suspense_donations"

echo "=== suspense_donations : Aftab ==="
$PSQL -c "SELECT id, donor_name, amount, transaction_date, notes, status, created_at FROM suspense_donations WHERE donor_name ILIKE '%aftab%' ORDER BY created_at DESC LIMIT 20"

echo "=== suspense_donations : 2026-08-06 ==="
$PSQL -c "SELECT id, donor_name, amount, transaction_date, notes, status, created_at FROM suspense_donations WHERE transaction_date = DATE '2026-08-06' ORDER BY created_at DESC LIMIT 20"

echo "=== suspense_donations : 658418557764 anywhere ==="
$PSQL -c "SELECT id, donor_name, amount, transaction_date, notes, status, created_at FROM suspense_donations WHERE donor_name::text LIKE '%658418557764%' OR notes::text LIKE '%658418557764%' LIMIT 20"

echo "=== new_data : Aftab Ali ==="
$PSQL -c "SELECT id, name, amount, transaction_date, mobile_number, payment_id_no, receipt_no, receipt_date, receipt_time, project_supported, ngo, status FROM new_data WHERE name ILIKE '%aftab%ali%' LIMIT 20"

echo "=== new_data : 658418557764 ==="
$PSQL -c "SELECT id, name, amount, transaction_date, mobile_number, payment_id_no, receipt_no, receipt_date, receipt_time, project_supported, ngo, status FROM new_data WHERE mobile_number LIKE '%658418557764%' OR mobile_2 LIKE '%658418557764%' OR payment_id_no LIKE '%658418557764%' LIMIT 20"
