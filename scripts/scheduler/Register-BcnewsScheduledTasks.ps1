param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$tasks = @(
  @{
    Name = 'BCN-Ingest-5m'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsIngest.ps1'
    Interval = (New-TimeSpan -Minutes 5)
  },
  @{
    Name = 'BCN-SendPending-2m'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsSendPending.ps1'
    Interval = (New-TimeSpan -Minutes 2)
  },
  @{
    Name = 'BCN-BtcSnapshot-Hourly'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsBtcSnapshot.ps1'
    Interval = (New-TimeSpan -Hours 1)
    AlignTopOfHour = $true
  },
  @{
    Name = 'BCN-StrcSnapshot-Hourly'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsStrcSnapshot.ps1'
    Interval = (New-TimeSpan -Hours 1)
    AlignTopOfHour = $true
  }
)

foreach ($task in $tasks) {
  if (-not (Test-Path $task.Script)) {
    throw "Missing scheduler script: $($task.Script)"
  }

  $arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$($task.Script)`""
  $action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $RepoRoot

  if ($task.AlignTopOfHour) {
    $nextHour = (Get-Date).AddHours(1)
    $aligned = Get-Date -Year $nextHour.Year -Month $nextHour.Month -Day $nextHour.Day -Hour $nextHour.Hour -Minute 0 -Second 0
    $trigger = New-ScheduledTaskTrigger -Once -At $aligned -RepetitionInterval $task.Interval
  } else {
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval $task.Interval
  }

  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 3)

  Register-ScheduledTask `
    -TaskName $task.Name `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "bcnews direct HTTPS job ($RepoRoot)" `
    -Force | Out-Null

  Write-Output "registered $($task.Name) every $([int]$task.Interval.TotalMinutes)m script=$($task.Script)"
}