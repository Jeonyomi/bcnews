$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-MBAI-BridgeAM-0740' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/mbai-bridge-am' `
  -RepoRoot $repoRoot
