# Deployment to Google Cloud Run
$PROJECT_ID = "fpows-500123"
$SERVICE_NAME = "bryan-fpows"
$REGION = "australia-southeast1"

# Load credentials from local .env (never commit credentials here)
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found. Cannot deploy without credentials."
    exit 1
}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#=][^=]*)=(.+)$') {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
    }
}

$SMTP_USER           = $env:SMTP_USER
$SMTP_PASS           = $env:SMTP_PASS
$MANAGER_EMAIL       = $env:MANAGER_EMAIL
$SIMPRO_BASE_URL     = $env:SIMPRO_BASE_URL
$SIMPRO_ACCESS_TOKEN = $env:SIMPRO_ACCESS_TOKEN
$SIMPRO_COMPANY_ID   = $env:SIMPRO_COMPANY_ID
$ADMIN_API_KEY       = $env:ADMIN_API_KEY
$GOOGLE_CLIENT_ID    = $env:GOOGLE_CLIENT_ID
$GOOGLE_CLIENT_SECRET = $env:GOOGLE_CLIENT_SECRET
$SESSION_SECRET      = $env:SESSION_SECRET

if (-not $SIMPRO_COMPANY_ID) { $SIMPRO_COMPANY_ID = "1" }

if (-not $SIMPRO_BASE_URL -or -not $SIMPRO_ACCESS_TOKEN -or -not $SMTP_PASS -or -not $ADMIN_API_KEY) {
    Write-Error "Missing required env vars in .env: SIMPRO_BASE_URL, SIMPRO_ACCESS_TOKEN, SMTP_PASS, ADMIN_API_KEY"
    exit 1
}

if (-not $GOOGLE_CLIENT_ID -or -not $GOOGLE_CLIENT_SECRET -or -not $SESSION_SECRET) {
    Write-Error "Missing OAuth env vars in .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET"
    exit 1
}

$envVars = "SMTP_USER=$SMTP_USER,SMTP_PASS=$SMTP_PASS,MANAGER_EMAIL=$MANAGER_EMAIL,SIMPRO_BASE_URL=$SIMPRO_BASE_URL,SIMPRO_ACCESS_TOKEN=$SIMPRO_ACCESS_TOKEN,SIMPRO_COMPANY_ID=$SIMPRO_COMPANY_ID,ADMIN_API_KEY=$ADMIN_API_KEY,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,SESSION_SECRET=$SESSION_SECRET"

gcloud run deploy $SERVICE_NAME `
  --source . `
  --region $REGION `
  --project $PROJECT_ID `
  --allow-unauthenticated `
  --timeout=540 `
  --set-env-vars=$envVars

# Fetch the deployed service URL dynamically
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --region $REGION --project $PROJECT_ID --format "value(status.url)"
if (-not $SERVICE_URL) {
    Write-Error "Could not determine service URL after deploy."
    exit 1
}

# Enable Cloud Scheduler API (safe to run repeatedly)
gcloud services enable cloudscheduler.googleapis.com --project $PROJECT_ID

# Create or update the 6am daily report scheduler
$JOB_NAME = "fpows-daily-report-6am"
$TRIGGER_URI = "$SERVICE_URL/api/trigger-manager-report?key=$ADMIN_API_KEY"

gcloud scheduler jobs delete $JOB_NAME --location $REGION --project $PROJECT_ID --quiet 2>$null

gcloud scheduler jobs create http $JOB_NAME `
  --schedule="0 6 * * *" `
  --time-zone="Asia/Manila" `
  --uri=$TRIGGER_URI `
  --http-method=GET `
  --attempt-deadline=540s `
  --location=$REGION `
  --project=$PROJECT_ID `
  --description="Daily FPOWS report at 6am Manila"

Write-Host ""
Write-Host "Deployed. Scheduler: 6:00 AM Asia/Manila -> $TRIGGER_URI"
Write-Host "Report recipient: $MANAGER_EMAIL"
