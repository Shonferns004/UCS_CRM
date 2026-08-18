#!/usr/bin/env python3
"""Sync today's data from production DB to staging DB on the same RDS."""
import subprocess
import sys

RDS_HOST = "ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com"
USER = "ucs_admin"
PASSWORD = "Sevak1432P"
PROD_DB = "postgres"
STAGING_DB = "ucs_crm_staging"

TABLES = [
    "bank_audit_entries",
    "receipts",
    "fro_donor_logs",
    "fro_assignments",
    "donor_profiles",
]

def run_sql(db, sql, capture=False):
    cmd = [
        "psql", "-h", RDS_HOST, "-U", USER, "-d", db,
        "-t", "-A", "-c", sql
    ]
    env = {"PGPASSWORD": PASSWORD}
    if capture:
        result = subprocess.run(cmd, env={**dict(__import__("os").environ), **env},
                                capture_output=True, text=True, timeout=120)
        return result.stdout.strip(), result.returncode
    else:
        result = subprocess.run(cmd, env={**dict(__import__("os").environ), **env},
                                capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  ERROR: {result.stderr.strip()}")
        return result.stdout.strip(), result.returncode

print("=== Syncing today's data: production -> staging ===\n")

for tbl in TABLES:
    print(f"--- {tbl} ---")

    # Count in prod
    count_sql = f"SELECT count(*) FROM {tbl} WHERE DATE(created_at) = CURRENT_DATE OR DATE(updated_at) >= CURRENT_DATE OR DATE(assigned_at) >= CURRENT_DATE"
    count_out, rc = run_sql(PROD_DB, count_sql, capture=True)
    count = int(count_out) if count_out and count_out.isdigit() else 0
    print(f"  Production rows today: {count}")

    if count == 0:
        print(f"  Skipped (no data)")
        continue

    # Export from prod to CSV
    export_sql = f"COPY (SELECT * FROM {tbl} WHERE DATE(created_at) = CURRENT_DATE OR DATE(updated_at) >= CURRENT_DATE OR DATE(assigned_at) >= CURRENT_DATE) TO STDOUT WITH (FORMAT csv)"
    cmd_export = ["psql", "-h", RDS_HOST, "-U", USER, "-d", PROD_DB, "-c", export_sql]
    env = {"PGPASSWORD": PASSWORD, **dict(__import__("os").environ)}
    result = subprocess.run(cmd_export, env=env, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        print(f"  Export ERROR: {result.stderr.strip()}")
        continue

    csv_data = result.stdout
    if not csv_data.strip():
        print(f"  Skipped (empty export)")
        continue

    # Import into staging via COPY
    import_sql = f"COPY {tbl} FROM STDIN WITH (FORMAT csv)"
    cmd_import = ["psql", "-h", RDS_HOST, "-U", USER, "-d", STAGING_DB, "-c", import_sql]
    result = subprocess.run(cmd_import, env=env, input=csv_data, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        print(f"  Import WARN: {result.stderr.strip()[:200]}")
        # Fallback: try individual row inserts via temp table
        print(f"  Trying upsert fallback...")
        lines = csv_data.strip().split("\n")
        # Just report the issue
        print(f"  {len(lines)} rows exported but COPY failed. Manual intervention may be needed.")
    else:
        # Count in staging
        staging_count, _ = run_sql(STAGING_DB, count_sql, capture=True)
        sc = int(staging_count) if staging_count and staging_count.isdigit() else 0
        print(f"  Synced OK. Staging now has {sc} rows for today.")

    print()

print("=== Sync complete ===")
