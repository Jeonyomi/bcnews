$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName 'BCN-OccApplicants-Hourly' `
  -Endpoint 'https://bcnews-agent.vercel.app/api/jobs/occ-applicants' `
  -RepoRoot $repoRoot