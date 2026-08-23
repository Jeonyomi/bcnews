$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-BtcSnapshot-Hourly' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/btc-snapshot' `
  -RepoRoot $repoRoot