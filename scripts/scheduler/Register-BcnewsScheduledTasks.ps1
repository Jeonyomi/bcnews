$ErrorActionPreference = 'Stop'

$repoRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$ingestScript = Join-Path $repoRoot 'scripts\scheduler\Run-BcnewsIngest.ps1'
$sendScript = Join-Path $repoRoot 'scripts\scheduler\Run-BcnewsSendPending.ps1'

$tasks = @(
  @{
    Name = 'BCN-Ingest-5m'
    Script = $ingestScript
    Interval = (New-TimeSpan -Minutes 5)
  },
  @{
    Name = 'BCN-SendPending-2m'
    Script = $sendScript
    Interval = (New-TimeSpan -Minutes 2)
  }
)

foreach ($task in $tasks) {
  $action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$($task.Script)`""
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval $task.Interval
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
  Register-ScheduledTask -TaskName $task.Name -Action $action -Trigger $trigger -Settings $settings -Description "bcnews direct HTTP job via Task Scheduler" -Force | Out-Null
  Write-Output "registered $($task.Name) every $([int]$task.Interval.TotalMinutes)m"
}
