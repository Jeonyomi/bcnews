param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$taskName = 'BCN-MBAI-BridgeAM-0740'
$launcher = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsMbaiBridgeAm-Hidden.vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
if (-not (Test-Path $launcher)) { throw "Missing hidden launcher: $launcher" }

$action = New-ScheduledTaskAction `
  -Execute $wscript `
  -Argument "//B //Nologo `"$launcher`"" `
  -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger `
  -Weekly `
  -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
  -At '07:40'
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
  -Description 'MB.AI BRIDGE AM weekdays 07:40 KST' `
  -Force | Out-Null

Write-Output "registered $taskName weekdays at 07:40 launcher=$launcher"
