param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
$requiredTimeZone = 'Korea Standard Time'
$currentTimeZone = (Get-TimeZone).Id
if ($currentTimeZone -ne $requiredTimeZone) {
  throw "HOT 24 scheduler requires $requiredTimeZone but host uses $currentTimeZone"
}
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$taskName = 'BCN-MBAI-Hot24-2030'
$launcherPath = Join-Path $PSScriptRoot 'Run-BcnewsMbaiHot24-Hidden.vbs'
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'

$action = New-ScheduledTaskAction `
  -Execute $wscriptPath `
  -Argument "//B //Nologo `"$launcherPath`"" `
  -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At '20:30'
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
  -Description 'MB.AI HOT 24 daily 20:30 KST' `
  -Force | Out-Null

Write-Output "registered $taskName daily at 20:30 launcher=$launcherPath"
