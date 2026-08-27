param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$timeZone = (& (Join-Path $env:WINDIR 'System32\tzutil.exe') /g).Trim()
if ($timeZone -ne 'Korea Standard Time') {
  throw "BCN-MBAI-USOpen-NY0925 requires Korea Standard Time; current=$timeZone"
}

$taskName = 'BCN-MBAI-USOpen-NY0925'
$launcherPath = Join-Path $PSScriptRoot 'Run-BcnewsMbaiUsOpen-Hidden.vbs'
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$action = New-ScheduledTaskAction `
  -Execute $wscriptPath `
  -Argument "//B //Nologo `"$launcherPath`"" `
  -WorkingDirectory $RepoRoot
$triggerDst = New-ScheduledTaskTrigger `
  -Weekly -WeeksInterval 1 `
  -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
  -At '22:25'
$triggerStandard = New-ScheduledTaskTrigger `
  -Weekly -WeeksInterval 1 `
  -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
  -At '23:25'
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($triggerDst, $triggerStandard) `
  -Settings $settings `
  -Principal $principal `
  -Description 'MB.AI US OPEN weekdays at 09:25 America/New_York via DST-safe KST triggers' `
  -Force | Out-Null

Write-Output "registered $taskName weekdays at 22:25 and 23:25 KST launcher=$launcherPath"
