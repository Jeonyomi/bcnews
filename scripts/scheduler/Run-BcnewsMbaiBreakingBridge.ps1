$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-MBAI-BreakingBridge-2m' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/mbai-breaking-bridge' `
  -RepoRoot $repoRoot
