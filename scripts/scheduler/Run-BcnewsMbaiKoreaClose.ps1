$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-MBAI-KoreaClose-1540' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/mbai-korea-close' `
  -RepoRoot $repoRoot
