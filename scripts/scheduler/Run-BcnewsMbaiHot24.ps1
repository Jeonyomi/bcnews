$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-MBAI-Hot24-2030' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/mbai-hot24' `
  -RepoRoot $repoRoot
