#!/bin/bash
# Runs on the EC2 box against the AWS RDS production database.
# Prints one line per public table:  table|exact_row_count
export PGPASSWORD=ucscompany123
PSQL="psql -h ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com -p 5432 -U ucs_admin -d postgres -t -A -F |"

# Build one UNION ALL query that counts every public table exactly.
Q=$($PSQL -c "SELECT string_agg(format('SELECT %L AS t, count(*) AS n FROM %I.%I', c.relname, n.nspname, c.relname), ' UNION ALL ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname = 'public'" | tr -d '\r' | tr '\n' ' ')

if [ -z "$Q" ]; then
  echo "ERROR:no_tables"
  exit 1
fi

$PSQL -c "$Q"
