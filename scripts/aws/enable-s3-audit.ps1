# UCS CRM - S3 audit visibility for ucs-crm-uploads-mumbai
#
# WHY THIS EXISTS
#   ucs-crm-uploads-mumbai holds donor receipt PDFs, worker/beneficiary
#   Aadhaar and UDID images, and WhatsApp media, and it carried a
#   public-read bucket policy (Principal "*" on s3:GetObject) with all four
#   S3 Public Access Block flags disabled. That exposure is a separate ticket.
#   This script only adds VISIBILITY, so we can answer the question that
#   matters first: has anything outside this account actually been read?
#
# PREREQUISITES
#   - Credentials with: cloudtrail:*, access-analyzer:*, s3:GetBucketLogging
#   - Server access logging is already enabled by the equivalent commands in
#     this script's Step 0 (idempotent; safe to re-run).
#
# COST
#   - Data events: USD 0.01 per 10,000 events. Low double-digit USD/month at
#     current traffic. Logging itself is roughly USD 0.01-0.05/GB of objects
#     logged (~1.5 GB bucket) - under USD 5/month.
#
# USAGE
#   .\scripts\aws\enable-s3-audit.ps1
#   .\scripts\aws\enable-s3-audit.ps1 -Region ap-south-1 -SkipLogging

[CmdletBinding()]
param(
    [string]$Region      = 'ap-south-1',
    [string]$SourceBucket = 'ucs-crm-uploads-mumbai',
    [string]$LogBucket    = 'ucs-crm-audit-logs-938364502045',
    [string]$TrailName    = 'ucs-crm-s3-audit',
    [switch]$SkipLogging
)

$ErrorActionPreference = 'Stop'
$AccountId = '938364502045'

function Say($msg) { Write-Output "==> $msg" }

# --- Step 0: confirm server access logging is on -----------------------------
if (-not $SkipLogging) {
    Say "verifying server access logging on $SourceBucket"
    $lb = aws s3api get-bucket-logging --bucket $SourceBucket 2>&1 | Out-String
    if ($lb -match [regex]::Escape($LogBucket)) {
        Write-Output "    OK: delivery -> s3://$LogBucket/"
    } else {
        throw "server access logging is NOT enabled on $SourceBucket. Run the S3 steps first."
    }
}

# --- Step 1: CloudTrail data events for object-level reads -------------------
# Management events only record the S3 API call, not who read which object.
# Data events close that gap for the bucket that matters.
Say "ensuring CloudTrail trail $TrailName exists"
$existing = aws cloudtrail describe-trails --query "trailList[?Name=='$TrailName'].Name" --output text 2>&1 | Out-String
if ($existing.Trim() -ne $TrailName) {
    aws cloudtrail create-trail `
        --name $TrailName `
        --s3-bucket-name "$LogBucket/$TrailName" `
        --include-global-service-events `
        --is-multi-region-trail `
        --enable-log-file-validation | Out-Null
    Write-Output "    created trail $TrailName"
} else {
    Write-Output "    trail already exists"
}

Say "attaching object-level data events for s3://$SourceBucket"
# write-events is included so we also see anonymous attempts to PUT/DELETE.
$selector = @"
[
  {
    "ReadWriteType": "All",
    "IncludeResources": [ { "Type": "AWS::S3::Object", "ARN": "arn:aws:s3:::$SourceBucket/*" } ]
  }
]
"@
$selectorFile = Join-Path $env:TEMP 'ucs-s3-dataevents.json'
Set-Content -LiteralPath $selectorFile -Value $selector -Encoding utf8

aws cloudtrail put-event-selectors `
    --trail-name $TrailName `
    --event-selectors "file://$($selectorFile -replace '\\','/')" | Out-Null
Write-Output "    data events enabled (All read/write on arn:aws:s3:::$SourceBucket/*)"

Say "starting trail (logs begin flowing immediately)"
aws cloudtrail start-logging --trail-name $TrailName | Out-Null

# --- Step 2: S3 Access Analyzer ------------------------------------------------
# Independent confirmation of which buckets/prefixes are reachable by the world.
# It is the check that does not rely on our own assumptions.
Say "ensuring account-wide Access Analyzer report exists"
$an = aws accessanalyzer list-analyzers --query "analyzers[?name=='ucs-crm-analyzer'].name" --output text 2>&1 | Out-String
if ($an.Trim() -ne 'ucs-crm-analyzer') {
    aws accessanalyzer create-analyzer --analyzer-name ucs-crm-analyzer --type ACCOUNT | Out-Null
    Write-Output "    created analyzer ucs-crm-analyzer"
} else {
    Write-Output "    analyzer already exists"
}

# --- Step 3: report what is publicly reachable ---------------------------------
Say "access findings for $SourceBucket (anything here is internet-readable)"
$findings = aws accessanalyzer get-findings --analyzer-name ucs-crm-analyzer --filter "resource" --query "findings[?resource=='arn:aws:s3:::$SourceBucket'].{Status:status,Resource:resource,Principal:principal,Actions:action}" --output json 2>&1 | Out-String
Write-Output $findings

Say "done"
Write-Output ""
Write-Output "Next: wait 15-30 minutes, then read the delivered server access logs."
Write-Output "  aws s3 ls s3://$LogBucket/$SourceBucket/ --recursive --summarize"
Write-Output "  aws cloudtrail lookup-events --lookup-attributes AttributeKey=ResourceName,AttributeValue=$SourceBucket --max-results 50"
Write-Output ""
Write-Output "Audit boundary: server access logging only sees traffic from the moment it was"
Write-Output "enabled. It cannot reconstruct reads that happened before that. If the incident"
Write-Output "window matters, say so explicitly rather than assuming an empty log means no access."
