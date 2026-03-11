$repoRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews"
& (Join-Path $repoRoot 'scripts\scheduler\Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-SendPending-2m' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/send-pending' `
  -RepoRoot $repoRoot
