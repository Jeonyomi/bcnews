param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$taskName = 'BCN-MBAI-KoreaClose-1540'
$launcherPath = Join-Path $PSScriptRoot 'Run-BcnewsMbaiKoreaClose-Hidden.vbs'
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'

$action = New-ScheduledTaskAction `
  -Execute $wscriptPath `
  -Argument "//B //Nologo `"$launcherPath`"" `
  -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger `
  -Weekly `
  -WeeksInterval 1 `
  -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
  -At '15:40'
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
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'MB.AI KOREA CLOSE weekdays 15:40 KST' `
  -Force | Out-Null

Write-Output "registered $taskName weekdays at 15:40 launcher=$launcherPath"
