param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$taskName = 'BCN-OccApplicants-Hourly'
$scriptPath = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsOccApplicants.ps1'
if (-not (Test-Path $scriptPath)) {
  throw "Missing scheduler script: $scriptPath"
}

$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $RepoRoot

$nextHour = (Get-Date).AddHours(1)
$aligned = Get-Date -Year $nextHour.Year -Month $nextHour.Month -Day $nextHour.Day -Hour $nextHour.Hour -Minute 0 -Second 0
$trigger = New-ScheduledTaskTrigger -Once -At $aligned -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 3)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "bcnews OCC applicants HTTPS job ($RepoRoot)" `
  -Force | Out-Null

Write-Output "registered $taskName every 60m script=$scriptPath"