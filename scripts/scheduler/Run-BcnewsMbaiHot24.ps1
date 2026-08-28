param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('KOREA','US','CRYPTO')]
  [string]$Slot
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
& (Join-Path $PSScriptRoot 'Invoke-BcnewsJob.ps1') `
  -JobName "BCN-MBAI-Hot24-$Slot" `
  -Endpoint "https://bcnews-agent.vercel.app/api/jobs/mbai-hot24?slot=$Slot&dry_run=false" `
  -RepoRoot $repoRoot
