$tasks = 'BCN-Ingest-5m','BCN-SendPending-2m'
foreach ($task in $tasks) {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "removed $task"
}
