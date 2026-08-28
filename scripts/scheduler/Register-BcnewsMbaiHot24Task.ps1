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

$launcherPath = Join-Path $PSScriptRoot 'Run-BcnewsMbaiHot24-Hidden.vbs'
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

function Register-Hot24Task {
  param(
    [string]$TaskName,
    [ValidateSet('KOREA','US','CRYPTO')][string]$Slot,
    [object[]]$Triggers,
    [string]$Description
  )
  $action = New-ScheduledTaskAction `
    -Execute $wscriptPath `
    -Argument "//B //Nologo `"$launcherPath`" $Slot" `
    -WorkingDirectory $RepoRoot
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $Triggers `
    -Settings $settings `
    -Principal $principal `
    -Description $Description `
    -Force | Out-Null
  Write-Output "registered $TaskName slot=$Slot launcher=$launcherPath"
}

Unregister-ScheduledTask -TaskName 'BCN-MBAI-Hot24-2030' -Confirm:$false -ErrorAction SilentlyContinue

$koreaTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At '16:05'
Register-Hot24Task `
  -TaskName 'BCN-MBAI-Hot24-Korea-1605' `
  -Slot 'KOREA' `
  -Triggers @($koreaTrigger) `
  -Description 'MB.AI HOT 24 Korea NEWS and ASSET after market close'

$cryptoTrigger = New-ScheduledTaskTrigger -Daily -At '20:30'
Register-Hot24Task `
  -TaskName 'BCN-MBAI-Hot24-Crypto-2030' `
  -Slot 'CRYPTO' `
  -Triggers @($cryptoTrigger) `
  -Description 'MB.AI HOT 24 Crypto NEWS and ASSET daily'

$usDstTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday,Wednesday,Thursday,Friday,Saturday -At '06:20'
$usStandardTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday,Wednesday,Thursday,Friday,Saturday -At '07:20'
Register-Hot24Task `
  -TaskName 'BCN-MBAI-Hot24-USClose-NY1720' `
  -Slot 'US' `
  -Triggers @($usDstTrigger, $usStandardTrigger) `
  -Description 'MB.AI HOT 24 US NEWS and ASSET at 17:20 America/New_York with DST guard'
