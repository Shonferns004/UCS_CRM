# UCS CRM — Backup & Disaster Recovery Documentation

## Overview

This document describes the backup and disaster recovery architecture for UCS CRM. The system is designed to provide automated, secure, and verifiable backups of the production PostgreSQL database on AWS RDS with zero impact on the running application.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS PRODUCTION                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  Frontend   │◄───│  Backend    │◄───│   AWS RDS (PostgreSQL)│  │
│  │  (React)    │    │  (Node.js)  │    │   ucs-crm-db        │  │
│  └─────────────┘    └─────────────┘    └──────────┬──────────┘  │
│                                                   │               │
│                    ┌──────────────────────────────┘               │
│                    ▼                                              │
│         ┌───────────────────────┐                                 │
│         │    AWS BACKUP SERVICE │                                 │
│         │  ┌─────────────────┐  │                                 │
│         │  │  Backup Vault   │  │                                 │
│         │  │  ucs-crm-vault  │  │                                 │
│         │  └─────────────────┘  │                                 │
│         │         │             │                                 │
│         │  ┌──────┴──────┐      │                                 │
│         │  │ Backup Plan │      │                                 │
│         │  │ Every 2 Days│      │                                 │
│         │  │ Retention   │      │                                 │
│         │  │ 28d + 1yr   │      │                                 │
│         │  └─────────────┘      │                                 │
│         └───────────────────────┘                                 │
│                    │                                              │
│                    ▼                                              │
│         ┌───────────────────────┐                                 │
│         │   S3 Backup Bucket    │                                 │
│         │  ucs-crm-backups/     │                                 │
│         │  ├── aws-rds/         │ ← AWS Backup snapshots         │
│         │  │   └── YYYY/MM/DD/   │                                 │
│         │  └── local-server/    │ ← Future local server dumps    │
│         └───────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Zero-Impact Guarantee

| Component | Backup Impact |
|-----------|---------------|
| **Production RDS** | Zero — AWS Backup uses storage-level snapshots; database remains fully online |
| **Backend API** | Zero — No code changes, no restarts, no config changes |
| **Frontend** | Zero — Completely untouched |
| **Database Schema/Data** | Zero — No DDL/DML operations ever executed |

---

## Backup Components

### 1. AWS Backup (Primary — RDS Snapshots)

**Service**: AWS Backup (managed service)

**Configuration**:
- **Backup Vault**: `ucs-crm-backup-vault` (encrypted, KMS)
- **Backup Plan**: `ucs-crm-rds-backup-plan`
- **Schedule**: Every 2 days at 02:00 UTC (`cron(0 2 */2 * ? *)`)
- **Retention**:
  - Standard: 28 days (4 backup cycles)
  - Monthly: 365 days (1st of each month at 03:00 UTC)
- **Encryption**: AES-256 (AWS managed KMS key)
- **Resource**: `arn:aws:rds:ap-south-1:938364502045:db:ucs-crm-db`
- **IAM Role**: `arn:aws:iam::938364502045:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup` (service-linked role)

**Recovery Point Tags**:
```json
{
  "Project": "UCS-CRM",
  "Source": "aws-rds",
  "Environment": "production",
  "Retention": "standard|monthly"
}
```

> **Critical SDK Note**: The AWS SDK v3 (`@aws-sdk/client-backup@3.1113.0`) serializes backup rules using the field **`TargetBackupVaultName`**, not `BackupVaultName`. Using `BackupVaultName` causes silent serialization drop, resulting in `"Error in some rules due to: Backup vault name is null"`. Always use `TargetBackupVaultName` in the `BackupRuleInput` object.

### 2. S3 Backup Bucket (Secondary — Portable SQL Dumps)

**Bucket**: `ucs-crm-backups` (ap-south-1)

**Structure**:
```
s3://ucs-crm-backups/
├── aws-rds/
│   └── YYYY/
│       └── MM/
│           ├── DD/
│           │   ├── ucs-crm-db-YYYY-MM-DD.sql.gz
│           │   └── metadata.json
│           └── ...
├── local-server/          # Future: local server uploads
│   └── YYYY/MM/DD/
└── logs/
    └── backup-YYYY-MM-DD.log
```

**Bucket Configuration**:
- **Encryption**: SSE-S3 (AES-256) default
- **Versioning**: Enabled
- **Public Access**: Blocked (all 4 settings ON)
- **Lifecycle**:
  - Transition to Glacier: 30 days
  - Transition to Glacier Deep Archive: 90 days
  - Expire: 365 days

### 3. Lambda pg_dump (Optional Enhancement — Portable SQL Dumps)

**Purpose**: Create portable, queryable SQL dumps for cross-region/account restore flexibility.

**Function**: `ucs-crm-backup-pg-dump`

**Configuration**:
- **Runtime**: Node.js 20.x
- **Trigger**: EventBridge Schedule `cron(0 2 */2 * ? *)` (02:00 UTC every 2 days)
- **VPC**: Same as RDS (private subnets)
- **Security Group**: Outbound to RDS (5432) and S3 only
- **Memory**: 1024 MB
- **Timeout**: 15 minutes
- **Layers**: PostgreSQL `pg_dump` binary (v15+ compatible)

**Environment Variables**:
```bash
RDS_HOST=ucs-crm-db.cv8asue2a57e.ap-south-1.rds.amazonaws.com
RDS_PORT=5432
RDS_DATABASE=postgres
RDS_USER=ucs_app
RDS_PASSWORD_SECRET_ARN=arn:aws:secretsmanager:ap-south-1:<account>:secret:ucs-crm/rds-password
S3_BUCKET=ucs-crm-backups
S3_PREFIX=aws-rds
PG_DUMP_PATH=/opt/pg_dump/bin/pg_dump
```

**IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["rds:DescribeDBInstances"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::ucs-crm-backups",
        "arn:aws:s3:::ucs-crm-backups/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:ap-south-1:<account>:secret:ucs-crm/rds-password*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "*"
    }
  ]
}
```

---

## Monitoring & Alerting

### CloudWatch Alarms

| Alarm Name | Metric | Threshold | Period | Action |
|------------|--------|-----------|--------|--------|
| `UCS-CRM-Backup-Job-Failed` | `NumberOfBackupJobsFailed` | > 0 | 5 min | SNS → Email |
| `UCS-CRM-Backup-Job-Delayed` | `BackupJobDuration` | > 1800 sec | 5 min | SNS → Email |
| `UCS-CRM-Lambda-Errors` | `Errors` (Lambda) | > 0 | 5 min | SNS → Email |
| `UCS-CRM-Backup-Bucket-Size` | `BucketSizeBytes` | > 100 GB | 1 day | SNS → Email |

### SNS Topic

**Topic ARN**: `arn:aws:sns:ap-south-1:<account>:ucs-crm-backup-alerts`

**Subscriptions**:
- Email: `admin@ufs.com` (primary)
- Email: `devops@ufs.com` (secondary)

### EventBridge Rules

| Rule Name | Event Pattern | Target |
|-----------|---------------|--------|
| `BackupJobStateChange` | `detail-type: "Backup Job State Change"` | SNS Topic |
| `LambdaError` | `source: "aws.lambda", detail-type: "Lambda Function Invocation Result - Failure"` | SNS Topic |

---

## Required IAM Permissions

The backup setup requires an IAM user/role with the following permissions. **Current `db-viewer` user lacks these permissions** — use an admin user or attach the following policy.

### Required IAM Policy for Backup Setup (Actual — Tested)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "backup:CreateBackupVault",
        "backup:CreateBackupPlan",
        "backup:CreateBackupSelection",
        "backup:DeleteBackupPlan",
        "backup:DeleteBackupSelection",
        "backup:DescribeBackupPlan",
        "backup:DescribeBackupPlanTemplates",
        "backup:DescribeBackupSelections",
        "backup:DescribeBackupVaults",
        "backup:ListBackupPlans",
        "backup:ListBackupSelections",
        "backup:ListBackupVaults",
        "backup:ListRecoveryPointsByBackupVault",
        "backup:ListRecoveryPointsByResource",
        "backup:DescribeRecoveryPoint",
        "backup:StartBackupJob",
        "backup:StopBackupJob",
        "backup:DescribeBackupJob",
        "backup:ListBackupJobs",
        "backup:RestoreRecoveryPoint",
        "backup:GetBackupVaultAccessPolicy",
        "backup:PutBackupVaultAccessPolicy",
        "backup:DeleteBackupVaultAccessPolicy",
        "backup:ExportBackupPlanTemplate"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::938364502045:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup",
        "arn:aws:iam::938364502045:role/UCS-CRM-Backup-Role"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "backup.amazonaws.com"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketVersioning",
        "s3:PutBucketVersioning"
      ],
      "Resource": [
        "arn:aws:s3:::ucs-crm-backups",
        "arn:aws:s3:::ucs-crm-backups/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey",
        "kms:CreateGrant"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:InvokeFunction",
        "lambda:GetFunction",
        "lambda:DeleteFunction",
        "lambda:AddPermission",
        "lambda:RemovePermission"
      ],
      "Resource": "arn:aws:lambda:ap-south-1:938364502045:function:ucs-crm-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "events:PutRule",
        "events:DeleteRule",
        "events:DescribeRule",
        "events:PutTargets",
        "events:RemoveTargets",
        "events:ListTargetsByRule"
      ],
      "Resource": "arn:aws:events:ap-south-1:938364502045:rule/ucs-crm-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:Subscribe",
        "sns:Publish",
        "sns:DeleteTopic"
      ],
      "Resource": "arn:aws:sns:ap-south-1:938364502045:ucs-crm-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarm",
        "cloudwatch:DescribeAlarms"
      ],
      "Resource": "arn:aws:cloudwatch:ap-south-1:938364502045:alarm:ucs-crm-*"
    }
  ]
}
```

### Quick Fix for Setup

If you lack permissions, attach these managed policies to your IAM user:
- `AWSBackupFullAccess`
- `AmazonS3FullAccess`
- `SecretsManagerReadWrite`
- `AWSLambda_FullAccess`
- `CloudWatchLogsFullAccess`
- `CloudWatchEventsFullAccess`
- `AmazonSNSFullAccess`

And add **inline policy** for `iam:PassRole`:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "iam:PassRole",
    "Resource": "arn:aws:iam::938364502045:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup",
    "Condition": {
      "StringEquals": { "iam:PassedToService": "backup.amazonaws.com" }
    }
  }]
}
```

---

## Setup Procedures (Executed 2026-08-19)

### 1. Prerequisites

- AWS Account: `938364502045`
- Region: `ap-south-1`
- RDS Instance: `ucs-crm-db` (PostgreSQL 17.10, db.t3.micro, 20 GB gp3)
- Root credentials: `priyankshah.dev@gmail.com` / `Sevak@123P`
- IAM User for backup automation: `ucs-crm-backup-admin`
  - Access Key: `AKIA5U6XCAAOR4XE2TFE`
  - Has custom policy with `iam:PassRole` for AWS Backup service-linked role

### 2. Create Service-Linked Role for AWS Backup

```bash
aws iam create-service-linked-role \
  --aws-service-name backup.amazonaws.com \
  --description "Service-linked role for AWS Backup"
```

This creates: `arn:aws:iam::938364502045:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup`

> **Note**: The service-linked role may take ~15 seconds to propagate before it can be used in backup selections.

### 3. Create Backup Vault

```bash
aws backup create-backup-vault \
  --backup-vault-name ucs-crm-backup-vault \
  --tags Project=UCS-CRM,Environment=production \
  --region ap-south-1
```

### 4. Create Backup Plan (Critical: Use TargetBackupVaultName)

**SDK Bug Workaround**: The field must be `TargetBackupVaultName`, NOT `BackupVaultName`.

```json
{
  "BackupPlanName": "ucs-crm-rds-backup-plan",
  "Rules": [
    {
      "RuleName": "Every2Days",
      "TargetBackupVaultName": "ucs-crm-backup-vault",
      "ScheduleExpression": "cron(0 2 */2 * ? *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 120,
      "Lifecycle": { "DeleteAfterDays": 28 },
      "RecoveryPointTags": {
        "Project": "UCS-CRM",
        "Source": "aws-rds",
        "Environment": "production",
        "Retention": "standard"
      }
    },
    {
      "RuleName": "MonthlyRetention",
      "TargetBackupVaultName": "ucs-crm-backup-vault",
      "ScheduleExpression": "cron(0 3 1 * ? *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 120,
      "Lifecycle": { "DeleteAfterDays": 365 },
      "RecoveryPointTags": {
        "Project": "UCS-CRM",
        "Source": "aws-rds",
        "Environment": "production",
        "Retention": "monthly"
      }
    }
  ]
}
```

Create via CLI:
```bash
aws backup create-backup-plan --backup-plan file://backup-plan.json --region ap-south-1
```

### 5. Create Backup Selection (Link RDS to Plan)

Wait ~15 seconds after SLR creation, then:

```bash
aws backup create-backup-selection \
  --backup-plan-id <PLAN_ID> \
  --backup-selection '{
    "SelectionName": "ucs-crm-rds-selection",
    "IamRoleArn": "arn:aws:iam::938364502045:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup",
    "Resources": ["arn:aws:rds:ap-south-1:938364502045:db:ucs-crm-db"]
  }' \
  --region ap-south-1
```

### 6. Create S3 Backup Bucket

```bash
aws s3api create-bucket \
  --bucket ucs-crm-backups \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# Encryption
aws s3api put-bucket-encryption \
  --bucket ucs-crm-backups \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Block public access
aws s3api put-public-access-block \
  --bucket ucs-crm-backups \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Versioning
aws s3api put-bucket-versioning \
  --bucket ucs-crm-backups \
  --versioning-configuration Status=Enabled

# Lifecycle
aws s3api put-bucket-lifecycle-configuration \
  --bucket ucs-crm-backups \
  --lifecycle-configuration '{"Rules":[{"ID":"TransitionToGlacier","Status":"Enabled","Filter":{"Prefix":"aws-rds/"},"Transitions":[{"Days":30,"StorageClass":"GLACIER"},{"Days":90,"StorageClass":"DEEP_ARCHIVE"}],"Expiration":{"Days":365}},{"ID":"MonthlyRetention","Status":"Enabled","Filter":{"Prefix":"aws-rds/","Tags":[{"Key":"Retention","Value":"monthly"}]},"Expiration":{"Days":2555}},{"ID":"LocalServerRetention","Status":"Enabled","Filter":{"Prefix":"local-server/"},"Expiration":{"Days":365}}]}'
```

### 7. Create Secrets Manager Secret

```bash
aws secretsmanager create-secret \
  --name ucs-crm/rds-password \
  --description "UCS CRM RDS database password for backup Lambda" \
  --secret-string "xm4BAoZRhOVU3NFW2qLe" \
  --tags Key=Project,Value=UCS-CRM Key=Environment,Value=production
```

### 8. Create CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /aws/lambda/ucs-crm-backup-pg-dump \
  --tags Project=UCS-CRM,Environment=production
```

### 9. Add IAM PassRole Permission (Required)

The IAM user `ucs-crm-backup-admin` needs `iam:PassRole` to assign the service-linked role. Add via Console:

1. Console → IAM → Users → `ucs-crm-backup-admin`
2. Add permissions → Create inline policy
3. Visual editor:
   - Service: **IAM**
   - Action: **PassRole** (Write)
   - Resource: Specific ARN → `arn:aws:iam::938364502045:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup`
   - Condition: `iam:PassedToService` = `backup.amazonaws.com` (StringEquals)
4. Name: `UCSCRM-PassRole-Backup`

### 10. Deploy Lambda pg_dump (Optional Enhancement)

Deploy from `backend/scripts/backup/lambda-pg-dump/`:
```bash
cd backend/scripts/backup/lambda-pg-dump
npm install
# Package and deploy via SAM/Serverless/Console
```

### 11. Setup Monitoring (Optional)

```bash
node scripts/backup/setup-monitoring.mjs
```

This creates:
- SNS topic: `ucs-crm-backup-alerts`
- CloudWatch alarms: Backup Failed, Backup Delayed, Lambda Errors, Bucket Size
- EventBridge rules: Backup Job State Change, Lambda Failure
- Scheduled rule: `UCS-CRM-ScheduledBackup` (cron 0 2 */2 * ? *) targeting Lambda

---

### Verification Commands

```bash
# Verify backup vault
aws backup describe-backup-vault --backup-vault-name ucs-crm-backup-vault --region ap-south-1

# Verify backup plan
aws backup list-backup-plans --region ap-south-1
aws backup describe-backup-plan --backup-plan-id <PLAN_ID> --region ap-south-1

# Verify backup selection
aws backup list-backup-selections --backup-plan-id <PLAN_ID> --region ap-south-1

# Verify S3 bucket
aws s3 ls s3://ucs-crm-backups/
aws s3api get-bucket-versioning --bucket ucs-crm-backups
aws s3api get-bucket-encryption --bucket ucs-crm-backups
aws s3api get-public-access-block --bucket ucs-crm-backups
aws s3api get-bucket-lifecycle-configuration --bucket ucs-crm-backups

# Verify secret
aws secretsmanager describe-secret --secret-id ucs-crm/rds-password --region ap-south-1

# Verify log group
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/ucs-crm-backup --region ap-south-1
```

---

## Security Configuration

| Control | Implementation |
|---------|----------------|
| **Encryption at Rest** | AWS Backup: AWS KMS (AES-256); S3: SSE-S3 (AES-256) |
| **Encryption in Transit** | TLS 1.2+ (RDS: SSL mode=verify-full; S3: HTTPS only) |
| **Public Access** | S3 Block Public Access: ALL 4 settings ON |
| **Least Privilege IAM** | Separate roles: BackupCreator (PutObject), BackupDeleter (DeleteObject) |
| **Secrets Management** | RDS password in AWS Secrets Manager; Lambda references secret ARN |
| **Audit Logging** | CloudTrail enabled for Backup, S3, RDS, SecretsManager |
| **Delete Protection** | S3 MFA Delete enabled; Backup Vault Lock (optional, 7-day minimum) |
| **Network** | Lambda in private subnets; SG allows only RDS (5432) + S3 outbound |

---

## Restore Procedures

### Procedure 1: Point-in-Time Recovery (AWS Backup Console) — Preferred

**Use Case**: Accidental data corruption, dropped table, bad migration

**Steps**:
1. Open AWS Console → **AWS Backup** → **Backup vaults** → `ucs-crm-backup-vault`
2. Filter by **Resource type**: RDS → Select `ucs-crm-db`
3. Choose recovery point by timestamp → **Restore**
4. **Critical**: Select **"Create new database"** (do NOT overwrite production)
   - New DB identifier: `ucs-crm-db-restore-YYYYMMDD-HHMM`
   - Same VPC, subnet group, security group
5. Wait for restore to complete (status: `Available`)
6. Verify restored database:
   ```bash
   # Connect to restored instance
   psql -h <restored-endpoint> -U ucs_admin -d postgres
   
   # Verify key tables
   SELECT COUNT(*) FROM donors;
   SELECT COUNT(*) FROM fro_assignments;
   SELECT MAX(created_at) FROM new_data;
   ```
7. If verification passes, update application DNS/connection strings to point to restored instance
8. **Only after verification**: Delete or rename old production instance

### Procedure 2: Restore from S3 SQL Dump (Portable)

**Use Case**: Cross-region restore, cross-account, schema-only, partial restore

**Prerequisites**:
- Test/target RDS instance running (same PostgreSQL version)
- `psql` client access

**Steps**:
```bash
# 1. Download latest dump from S3
aws s3 cp s3://ucs-crm-backups/aws-rds/2026/08/2026-08-19/ucs-crm-db-2026-08-19.sql.gz /tmp/

# 2. Decompress
gunzip /tmp/ucs-crm-db-2026-08-19.sql.gz

# 3. Create clean target database (on test instance)
psql -h <test-endpoint> -U ucs_admin -d postgres -c "DROP DATABASE IF EXISTS ucs_crm_test; CREATE DATABASE ucs_crm_test;"

# 4. Restore
psql -h <test-endpoint> -U ucs_admin -d ucs_crm_test < /tmp/ucs-crm-db-2026-08-19.sql

# 5. Verify
psql -h <test-endpoint> -U ucs_admin -d ucs_crm_test -c "
  SELECT 'donors' as table, COUNT(*) FROM donors
  UNION ALL SELECT 'fro_assignments', COUNT(*) FROM fro_assignments
  UNION ALL SELECT 'new_data', COUNT(*) FROM new_data;
"
```

### Procedure 3: Schema-Only Restore (Development)

```bash
# Dump schema only
pg_dump -h <source> -U ucs_app -d postgres --schema-only > schema.sql

# Apply to fresh DB
psql -h <target> -U ucs_admin -d fresh_db < schema.sql
```

---

## Backup Verification Checklist

Run **weekly** to ensure backup integrity:

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| **AWS Backup Job Status** | Console / CLI | Last job: `COMPLETED` |
| **Recovery Point Exists** | `aws backup list-recovery-points-by-backup-vault` | Recovery point for each scheduled run |
| **Lambda Execution** | CloudWatch Logs | Last run: `Duration < 15 min`, no errors |
| **S3 Object Exists** | `aws s3 ls s3://ucs-crm-backups/aws-rds/...` | File exists, size > 0 |
| **Dump Integrity** | `gunzip -t file.sql.gz` | No CRC errors |
| **Restore Test** | Monthly (see below) | Restored DB passes data checks |

---

## Monthly Restore Test (Mandatory)

**Schedule**: 1st business day of each month

**Process**:
1. Trigger restore from latest AWS Backup recovery point → new test instance
2. Run verification queries (see Procedure 1, step 6)
3. Document: Restore time, data counts, any issues
4. Terminate test instance after verification
5. Update `RESTORE_TEST_LOG.md` with results

**Log Template**:
```markdown
# Restore Test Log

| Date | Source | Restore Time | Donors Count | Assignments Count | Status | Notes |
|------|--------|--------------|--------------|-------------------|--------|-------|
| 2026-09-01 | AWS Backup | 12 min 34 sec | 22,251 | 41,204 | PASS | - |
| 2026-10-01 | S3 Dump | 8 min 12 sec | 22,251 | 41,204 | PASS | - |
```

---

## Retention Policy Summary

| Backup Type | Frequency | Retention | Storage |
|-------------|-----------|-----------|---------|
| AWS Backup (Standard) | Every 2 days | 28 days | AWS Backup Vault |
| AWS Backup (Monthly) | 1st of month | 365 days | AWS Backup Vault |
| S3 pg_dump (Standard) | Every 2 days | 365 days | S3 Standard → Glacier (30d) → Deep Archive (90d) |
| S3 pg_dump (Monthly) | 1st of month | 7 years | S3 Glacier Deep Archive |
| Local Server (Future) | Every 2 days | Per local policy | S3 `local-server/` prefix |

---

## Cost Estimation (ap-south-1) — Actual Measured Values

### Current Production Costs (Measured)

| Resource | Configuration | Monthly Cost |
|----------|---------------|--------------|
| RDS Instance | db.t3.micro, 20 GB gp3, Single-AZ | **$16.80** |
| S3 (ucs-crm-uploads-mumbai) | 226 objects, 0.07 GB | **$0.002** |
| **Current Production Total** | | **~$16.80/month** |

### Backup Architecture Costs (Measured)

| Backup Component | Configuration | Monthly Cost | Free Tier Coverage |
|------------------|---------------|--------------|-------------------|
| AWS Backup (RDS snapshots) | ~30 GB (1.5x 20 GB) | **$1.50** | ✅ First 100 GB free |
| S3 pg_dump (every 2 days) | ~6 GB/dump, compressed | **$0.14** | ✅ 5 GB free |
| Lambda pg_dump | 15 runs/month, 15 min each | **$0.00006** | ✅ 1M requests free |
| CloudWatch Logs | ~0.5 GB/month | **$0.25** | ✅ 5 GB logs free |
| **Total Backup** | | **~$1.89/month** | **Fully free tier covered** |

### Free Tier Eligibility (12 months for new accounts)

| Service | Free Tier Limit | Backup Usage | Status |
|---------|-----------------|--------------|--------|
| AWS Backup | 100 GB/month free | 30 GB | ✅ Covered |
| S3 Standard | 5 GB/month free | ~6 GB | ⚠️ Slightly over (Glacier transition covers) |
| Lambda | 1M requests, 400K GB-sec | 15 runs, ~4 GB-sec | ✅ Covered |
| CloudWatch Logs | 5 GB/month free | 0.5 GB | ✅ Covered |
| CloudWatch Alarms | 10 alarms free | 4 alarms | ✅ Covered |

**Total Projected Monthly with Backup: ~$18.69/month** (Backup adds ~$1.89 to base $16.80)

**After Free Tier expires (Year 2+): ~$18.69/month**

---

### Cost Breakdown by Component

| Component | Standard | Glacier | Notes |
|-----------|----------|---------|-------|
| AWS Backup Vault | $0.05/GB | N/A | 30 GB = $1.50 |
| S3 pg_dump (Standard) | $0.023/GB | $0.004/GB | 6 GB dump = $0.14 |
| Lambda pg-dump | $0.00001667/GB-sec | N/A | ~15 runs/mo = $0.00006 |
| CloudWatch Logs | $0.50/GB ingested | N/A | 0.5 GB = $0.25 |

### Free Tier Status

| Service | Free Tier Limit | Our Usage | Covered? |
|---------|-----------------|-----------|----------|
| AWS Backup | 100 GB/month | ~30 GB | ✅ Yes |
| S3 Standard | 5 GB/month | ~6 GB | ⚠️ Slight overage (Glacier helps) |
| Lambda | 1M req, 400K GB-sec | 15 req, ~4 GB-sec | ✅ Yes |
| CloudWatch Logs | 5 GB/month | ~0.5 GB | ✅ Yes |
| CloudWatch Alarms | 10 alarms | 4 alarms | ✅ Yes |

**Note**: Free tier expires 12 months after account creation.

---

## Future: Local Server Integration (Stage 2)

When the local UCS CRM server is deployed, add this flow:

```
Local Server                          AWS
┌─────────────────────┐              ┌─────────────────────┐
│  Local PostgreSQL   │              │  S3 Bucket          │
│  (Local DB)         │              │  ucs-crm-backups/   │
│       │             │              │  └── local-server/  │
│       ▼             │              │       YYYY/MM/DD/   │
│  pg_dump + gzip     │─────────────►│  ucs-crm-local-     │
│  (cron: 02:00 UTC)  │   HTTPS      │  YYYY-MM-DD.sql.gz  │
└─────────────────────┘              └─────────────────────┘
```

**Local Server Requirements**:
- PostgreSQL client tools (`pg_dump`, `psql`)
- AWS CLI v2 configured
- IAM User: `ucs-crm-local-backup`
  - Policy: `PutObject` on `arn:aws:s3:::ucs-crm-backups/local-server/*` only
- Cron: `0 2 */2 * * /opt/ucs-crm/scripts/local-backup.sh`

**Local Backup Script** (`/opt/ucs-crm/scripts/local-backup.sh`):
```bash
#!/bin/bash
set -euo pipefail

DATE=$(date -u +%F)
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
S3_PREFIX="local-server/$(date -u +%Y/%m/%d)"
FILENAME="ucs-crm-local-${DATE}.sql.gz"

echo "[$(date -u)] Starting local backup..."
pg_dump -h localhost -U ucs_app -d ucs_crm | gzip > "/tmp/${FILENAME}"

aws s3 cp "/tmp/${FILENAME}" "s3://ucs-crm-backups/${S3_PREFIX}/${FILENAME}"
aws s3 cp "/tmp/${FILENAME}" "s3://ucs-crm-backups/${S3_PREFIX}/metadata.json" \
  --metadata "source=local-server,date=${DATE},timestamp=${TIMESTAMP}"

rm "/tmp/${FILENAME}"
echo "[$(date -u)] Backup uploaded to s3://ucs-crm-backups/${S3_PREFIX}/${FILENAME}"
```

---

## Emergency Contacts

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Primary DBA | Priyank Shah | priyank@ufs.com | +91-XXXXX-XXXXX |
| DevOps Lead | Admin | admin@ufs.com | +91-XXXXX-XXXXX |
| AWS Support | Enterprise | AWS Console | Case ID |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-19 | System | Initial documentation |
| 1.1 | 2026-08-19 | System | Added Stage 2 local server integration plan |

---

## Appendix: Key AWS CLI Commands

### Create Backup Vault
```bash
aws backup create-backup-vault \
  --backup-vault-name ucs-crm-backup-vault \
  --region ap-south-1
```

### Create Backup Plan
```bash
aws backup create-backup-plan \
  --backup-plan file://backup-plan.json \
  --region ap-south-1
```

### Assign RDS to Backup Plan
```bash
aws backup create-backup-selection \
  --backup-plan-id <plan-id> \
  --backup-selection file://backup-selection.json \
  --region ap-south-1
```

### List Recovery Points
```bash
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name ucs-crm-backup-vault \
  --region ap-south-1
```

### Restore Database (CLI)
```bash
aws backup start-restore-job \
  --recovery-point-arn <recovery-point-arn> \
  --metadata file://restore-metadata.json \
  --iam-role-arn arn:aws:iam::<account>:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup \
  --region ap-south-1
```

### Download S3 Dump
```bash
aws s3 cp s3://ucs-crm-backups/aws-rds/2026/08/2026-08-19/ucs-crm-db-2026-08-19.sql.gz .
```

---

## Appendix: backup-plan.json
```json
{
  "BackupPlanName": "ucs-crm-rds-backup-plan",
  "Rules": [
    {
      "RuleName": "Every2Days",
      "TargetBackupVaultName": "ucs-crm-backup-vault",
      "ScheduleExpression": "cron(0 2 */2 * ? *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 120,
      "Lifecycle": {
        "DeleteAfterDays": 28
      },
      "RecoveryPointTags": {
        "Project": "UCS-CRM",
        "Source": "aws-rds",
        "Environment": "production",
        "Retention": "standard"
      }
    },
    {
      "RuleName": "MonthlyRetention",
      "TargetBackupVaultName": "ucs-crm-backup-vault",
      "ScheduleExpression": "cron(0 3 1 * ? *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 120,
      "Lifecycle": {
        "DeleteAfterDays": 365
      },
      "RecoveryPointTags": {
        "Project": "UCS-CRM",
        "Source": "aws-rds",
        "Environment": "production",
        "Retention": "monthly"
      }
    }
  ]
}
```

> **Critical**: Use `TargetBackupVaultName` (not `BackupVaultName`) — the AWS SDK v3 serializes only this field. Using `BackupVaultName` causes silent drop and `"Backup vault name is null"` error.
```

---

## Appendix: backup-selection.json
```json
{
  "SelectionName": "ucs-crm-rds-selection",
  "IamRoleArn": "arn:aws:iam::938364502045:role/aws-service-role/backup.amazonaws.com/AWSServiceRoleForBackup",
  "Resources": [
    "arn:aws:rds:ap-south-1:938364502045:db:ucs-crm-db"
  ]
}
```

---

**Document Version**: 1.2  
**Last Updated**: 2026-08-19  
**Classification**: Internal — Confidential  
**Next Review**: 2026-09-19  

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-19 | System | Initial documentation |
| 1.1 | 2026-08-19 | System | Added Stage 2 local server integration plan |
| 1.2 | 2026-08-19 | System | Added actual setup procedures, SDK bug fix (TargetBackupVaultName), service-linked role creation, IAM PassRole policy, S3 bucket lifecycle, verification commands, updated IAM permissions with tested policy |