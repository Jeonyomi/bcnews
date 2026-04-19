$repoRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews"
& (Join-Path $repoRoot 'scripts\scheduler\Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-BtcSnapshot-Hourly' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/btc-snapshot' `
  -RepoRoot $repoRoot
