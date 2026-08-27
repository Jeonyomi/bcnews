param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$taskName = 'BCN-MBAI-BreakingBridge-2m'
$launcher = Join-Path $RepoRoot 'scripts\scheduler\Run-BcnewsMbaiBreakingBridge-Hidden.vbs'
if (-not (Test-Path $launcher)) { throw "Missing hidden scheduler launcher: $launcher" }

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$action = New-ScheduledTaskAction `
  -Execute $wscript `
  -Argument "//B //Nologo `"$launcher`"" `
  -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'MB.AI event-driven cross-market signal monitor every 2 minutes' `
  -Force | Out-Null

Write-Output "registered $taskName every 2m launcher=$launcher"
