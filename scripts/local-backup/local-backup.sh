#!/bin/bash
# UCS CRM Local Server Backup Script
# Run via cron: 0 2 */2 * * /opt/ucs-crm/scripts/local-backup/local-backup.sh

set -euo pipefail

# Configuration - UPDATE THESE VALUES
S3_BUCKET="ucs-crm-backups"
S3_PREFIX="local-server"
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="ucs_crm"
DB_USER="ucs_app"
AWS_REGION="ap-south-1"

# Optional: Use AWS CLI profile if needed
# AWS_PROFILE="ucs-crm-local-backup"

DATE=$(date -u +%F)
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
S3_PATH="${S3_PREFIX}/$(date -u +%Y/%m/%d)"
FILENAME="ucs-crm-local-${DATE}.sql.gz"
METADATA_FILE="metadata.json"

LOG_FILE="/var/log/ucs-crm-local-backup.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date -u)] $*" | tee -a "$LOG_FILE"
}

error_exit() {
    log "ERROR: $*"
    exit 1
}

log "Starting local backup for ${DB_NAME}..."

# Check prerequisites
command -v pg_dump >/dev/null 2>&1 || error_exit "pg_dump not found. Install postgresql-client."
command -v aws >/dev/null 2>&1 || error_exit "aws CLI not found. Install awscli v2."
command -v gzip >/dev/null 2>&1 || error_exit "gzip not found."

# Verify database connectivity
log "Checking database connection..."
pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 \
    || error_exit "Cannot connect to database. Check credentials and connectivity."

# Create dump
DUMP_FILE="/tmp/${FILENAME}"
log "Creating database dump..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --format=plain --no-sync \
    | gzip -6 > "$DUMP_FILE" \
    || error_exit "pg_dump failed"

DUMP_SIZE=$(stat -c%s "$DUMP_FILE")
log "Dump created: ${DUMP_FILE} (${DUMP_SIZE} bytes)"

# Verify dump integrity
log "Verifying dump integrity..."
gunzip -t "$DUMP_FILE" || error_exit "Dump file corruption detected"

# Upload to S3
S3_KEY="${S3_PATH}/${FILENAME}"
log "Uploading to s3://${S3_BUCKET}/${S3_KEY}..."
aws s3 cp "$DUMP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" \
    --region "$AWS_REGION" \
    --storage-class STANDARD \
    --metadata "source=local-server,date=${DATE},timestamp=${TIMESTAMP},database=${DB_NAME}" \
    || error_exit "S3 upload failed"

log "Dump uploaded successfully"

# Create and upload metadata
cat > "/tmp/${METADATA_FILE}" <<EOF
{
  "source": "local-server",
  "date": "${DATE}",
  "timestamp": "${TIMESTAMP}",
  "database": "${DB_NAME}",
  "host": "${DB_HOST}",
  "port": ${DB_PORT},
  "sizeBytes": ${DUMP_SIZE},
  "s3Key": "${S3_KEY}",
  "checksum": "$(sha256sum "$DUMP_FILE" | cut -d' ' -f1)"
}
EOF

aws s3 cp "/tmp/${METADATA_FILE}" "s3://${S3_BUCKET}/${S3_PATH}/${METADATA_FILE}" \
    --region "$AWS_REGION" \
    --metadata "source=local-server,date=${DATE},timestamp=${TIMESTAMP},database=${DB_NAME}" \
    || error_exit "Metadata upload failed"

log "Metadata uploaded successfully"

# Cleanup
rm -f "$DUMP_FILE" "/tmp/${METADATA_FILE}"

log "Local backup completed successfully!"
log "  S3 Location: s3://${S3_BUCKET}/${S3_KEY}"
log "  Size: ${DUMP_SIZE} bytes"
log "  Date: ${DATE}"

exit 0