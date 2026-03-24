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
    Name = 'BCN-BtcSnapshot-5m'
    Vbs = $btcSnapshotVbs
    Interval = (New-TimeSpan -Minutes 5)
  }
)

foreach ($task in $tasks) {
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$($task.Vbs)`""
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval $task.Interval
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
  Register-ScheduledTask -TaskName $task.Name -Action $action -Trigger $trigger -Settings $settings -Description "bcnews direct HTTP job via Task Scheduler" -Force | Out-Null
  Write-Output "registered $($task.Name) every $([int]$task.Interval.TotalMinutes)m"
}
