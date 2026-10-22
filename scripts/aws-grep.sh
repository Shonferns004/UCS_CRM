#!/bin/bash
# Searches every text column of every public table for a needle.
# The generated query is too long for the shell, so it goes to a file first.
# Usage: bash -s <needle>
export PGPASSWORD=ucscompany123
NEEDLE="${1:-658418557764}"
HOST="ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com"

psql -h "$HOST" -p 5432 -U ucs_admin -d postgres -t -A -c "
SELECT string_agg(
  'SELECT ''' || c.relname || ''' AS tbl, ''' || a.attname || ''' AS col, count(*) AS hits FROM ' ||
  quote_ident(n.nspname) || '.' || quote_ident(c.relname) ||
  ' WHERE ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname) || '::text ILIKE ''' ||
  quote_literal('%' || '$NEEDLE' || '%') || ''' HAVING count(*) > 0', ' UNION ALL ')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE c.relkind = 'r' AND n.nspname = 'public'
  AND a.atttypid IN (25,1043,1042,705,1000)
" | tr -d '\r' | tr '\n' ' ' > /tmp/grep_query.sql

if [ ! -s /tmp/grep_query.sql ]; then echo "ERROR:no_tables"; exit 1; fi

psql -h "$HOST" -p 5432 -U ucs_admin -d postgres -t -A -F '|' -f /tmp/grep_query.sql
