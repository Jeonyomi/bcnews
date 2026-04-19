$tasks = 'BCN-Ingest-5m','BCN-SendPending-2m','BCN-BtcSnapshot-5m','BCN-BtcSnapshot-Hourly'
foreach ($task in $tasks) {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "removed $task"
}
