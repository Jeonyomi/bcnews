$repoRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews"
& (Join-Path $repoRoot 'scripts\scheduler\Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-Ingest-5m' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/ingest' `
  -RepoRoot $repoRoot
