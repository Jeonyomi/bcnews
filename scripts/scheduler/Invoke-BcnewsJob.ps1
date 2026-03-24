param(
  [Parameter(Mandatory = $true)] [string]$JobName,
  [Parameter(Mandatory = $true)] [string]$Endpoint,
  [string]$RepoRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews",
  [string]$LogRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews\logs\scheduler",
  [int]$TimeoutSec = 120
)

$ErrorActionPreference = 'Stop'

function Get-EnvValue([string]$Path, [string[]]$Keys) {
  if (-not (Test-Path $Path)) { return $null }
  $lines = Get-Content $Path
  foreach ($key in $Keys) {
    $line = $lines | Where-Object { $_ -match "^${key}=" } | Select-Object -First 1
    if ($line) {
      return ($line -replace "^${key}=", '').Trim().Trim('"')
    }
  }
  return $null
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$logFile = Join-Path $LogRoot ("{0}.log" -f $JobName)
$launcherLog = Join-Path $LogRoot ("{0}.launcher.log" -f $JobName)
$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
Add-Content -Path $launcherLog -Value "[$stamp] START job=$JobName endpoint=$Endpoint cwd=$RepoRoot"

$secret = Get-EnvValue (Join-Path $RepoRoot '.env') @('BCNEWS_CRON_SECRET', 'X_CRON_SECRET', 'CRON_SECRET')
if (-not $secret) {
  $secret = Get-EnvValue (Join-Path $RepoRoot '.env.local') @('BCNEWS_CRON_SECRET', 'X_CRON_SECRET', 'CRON_SECRET')
}
if (-not $secret) {
  Add-Content -Path $launcherLog -Value "[$stamp] ERROR job=$JobName exit=1 stdout=$logFile message=Missing cron secret in .env or .env.local"
  throw "Missing cron secret in .env or .env.local"
}

$headers = @{
  'x-cron-secret' = $secret
  'content-type' = 'application/json'
}
$body = '{}'

try {
  $response = Invoke-WebRequest -Uri $Endpoint -Method Post -Headers $headers -Body $body -TimeoutSec $TimeoutSec -UseBasicParsing
  $line = "[$stamp] job=$JobName status=$($response.StatusCode) ok=true endpoint=$Endpoint"
  Add-Content -Path $logFile -Value $line
  Write-Output $line
  if ($response.Content) {
    $contentLine = "[$stamp] body=" + (($response.Content -replace "`r?`n", ' ') | ForEach-Object { $_.Substring(0, [Math]::Min($_.Length, 1000)) })
    Add-Content -Path $logFile -Value $contentLine
  }
  Add-Content -Path $launcherLog -Value "[$stamp] FINISH job=$JobName exit=0 stdout=$logFile"
  exit 0
}
catch {
  $status = ''
  try { if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode } } catch {}
  $line = "[$stamp] job=$JobName status=$status ok=false endpoint=$Endpoint error=$($_.Exception.Message)"
  Add-Content -Path $logFile -Value $line
  Add-Content -Path $launcherLog -Value "[$stamp] ERROR job=$JobName exit=1 stdout=$logFile message=$($_.Exception.Message)"
  Write-Error $line
  exit 1
}
