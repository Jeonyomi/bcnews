$ErrorActionPreference = 'Stop'

$taskName = 'BCN-OccApplicants-Hourly'
$vbsPath = Join-Path $env:USERPROFILE '.openclaw\workspace\bcnews\scripts\scheduler\Run-BcnewsOccApplicants-Hidden.vbs'

if (-not (Test-Path $vbsPath)) {
  throw "Missing launcher: $vbsPath"
}

$now = Get-Date
$start = Get-Date -Year $now.Year -Month $now.Month -Day $now.Day -Hour $now.Hour -Minute 0 -Second 0
$start = $start.AddHours(1)
$startTime = $start.ToString('HH:mm')
$taskRun = ('wscript.exe "{0}"' -f $vbsPath)

schtasks /Create /TN $taskName /SC HOURLY /MO 1 /ST $startTime /TR $taskRun /F | Out-Null
schtasks /Query /TN $taskName /FO LIST /V
