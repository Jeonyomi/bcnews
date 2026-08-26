$tasks = 'BCN-Ingest-5m','BCN-SendPending-2m','BCN-BtcSnapshot-5m','BCN-BtcSnapshot-Hourly','BCN-StrcSnapshot-Hourly','BCN-AltSnapshot-Hourly','BCN-OccApplicants-Hourly','BCN-MBAI-BridgeAM-0740','BCN-MBAI-KoreaClose-1540'
foreach ($task in $tasks) {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "removed $task"
}
