$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-SendPending-2m' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/send-pending' `
  -RepoRoot $repoRoot