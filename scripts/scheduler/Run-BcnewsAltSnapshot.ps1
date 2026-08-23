$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-AltSnapshot-Hourly' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/alt-snapshots' `
  -RepoRoot $repoRoot
