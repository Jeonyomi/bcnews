$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-Ingest-5m' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/ingest' `
  -RepoRoot $repoRoot