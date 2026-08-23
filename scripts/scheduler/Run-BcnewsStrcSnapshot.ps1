$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-StrcSnapshot-Hourly' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/strc-snapshot' `
  -RepoRoot $repoRoot