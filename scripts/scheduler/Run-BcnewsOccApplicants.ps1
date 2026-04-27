$repoRoot = "$env:USERPROFILE\.openclaw\workspace\bcnews"
& (Join-Path $repoRoot 'scripts\scheduler\Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-OccApplicants-Hourly' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/occ-applicants' `
  -RepoRoot $repoRoot
