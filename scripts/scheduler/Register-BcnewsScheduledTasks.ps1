param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'

# Replace the retired STRC publisher instead of leaving two hourly tasks active.
Unregister-ScheduledTask -TaskName 'BCN-StrcSnapshot-Hourly' -Confirm:$false -ErrorAction SilentlyContinue

$tasks = @(
  @{
    Name = 'BCN-Ingest-5m'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsIngest.ps1'
    Launcher = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsIngest-Hidden.vbs'
    Interval = (New-TimeSpan -Minutes 5)
  },
  @{
    Name = 'BCN-SendPending-2m'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsSendPending.ps1'
    Launcher = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsSendPending-Hidden.vbs'
    Interval = (New-TimeSpan -Minutes 2)
  },
  @{
    Name = 'BCN-BtcSnapshot-Hourly'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsBtcSnapshot.ps1'
    Launcher = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsBtcSnapshot-Hidden.vbs'
    Interval = (New-TimeSpan -Hours 1)
    AlignTopOfHour = $true
  },
  @{
    Name = 'BCN-AltSnapshot-Hourly'
    Script = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsAltSnapshot.ps1'
    Launcher = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsAltSnapshot-Hidden.vbs'
    Interval = (New-TimeSpan -Hours 1)
    AlignTopOfHour = $true
  }
)

foreach ($task in $tasks) {
  if (-not (Test-Path $task.Script)) {
    throw "Missing scheduler script: $($task.Script)"
  }
  if (-not (Test-Path $task.Launcher)) {
    throw "Missing hidden scheduler launcher: $($task.Launcher)"
  }

  # wscript hosts the launcher without allocating a console, avoiding the
  # brief cmd/PowerShell flash that can occur before -WindowStyle Hidden applies.
  $arguments = "//B //Nologo `"$($task.Launcher)`""
  $action = New-ScheduledTaskAction -Execute $wscript -Argument $arguments -WorkingDirectory $RepoRoot

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