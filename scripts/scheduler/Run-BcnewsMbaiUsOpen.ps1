$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-MBAI-USOpen-NY0925' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/mbai-us-open' `
  -RepoRoot $repoRoot
