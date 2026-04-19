$ErrorActionPreference = 'Stop'

$repoRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews"
$ingestVbs = Join-Path $repoRoot 'scripts\scheduler\Run-BcnewsIngest-Hidden.vbs'
$sendVbs = Join-Path $repoRoot 'scripts\scheduler\Run-BcnewsSendPending-Hidden.vbs'
$btcSnapshotVbs = Join-Path $repoRoot 'scripts\scheduler\Run-BcnewsBtcSnapshot-Hidden.vbs'

$tasks = @(
  @{
    Name = 'BCN-Ingest-5m'
    Vbs = $ingestVbs
    Interval = (New-TimeSpan -Minutes 5)
  },
  @{
    Name = 'BCN-SendPending-2m'
    Vbs = $sendVbs
    Interval = (New-TimeSpan -Minutes 2)
  },
  @{
    Name = 'BCN-BtcSnapshot-Hourly'
    Vbs = $btcSnapshotVbs
    Interval = (New-TimeSpan -Hours 1)
    AlignTopOfHour = $true
  }
)

foreach ($task in $tasks) {
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$($task.Vbs)`""
  if ($task.AlignTopOfHour) {
    $nextHour = (Get-Date).AddHours(1)
    $aligned = Get-Date -Year $nextHour.Year -Month $nextHour.Month -Day $nextHour.Day -Hour $nextHour.Hour -Minute 0 -Second 0
    $trigger = New-ScheduledTaskTrigger -Once -At $aligned -RepetitionInterval $task.Interval
  } else {
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval $task.Interval
  }
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
  Register-ScheduledTask -TaskName $task.Name -Action $action -Trigger $trigger -Settings $settings -Description "bcnews direct HTTP job via Task Scheduler" -Force | Out-Null
  Write-Output "registered $($task.Name) every $([int]$task.Interval.TotalMinutes)m"
}
