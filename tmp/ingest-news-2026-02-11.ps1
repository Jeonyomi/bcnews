Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location 'C:\Users\MJ\.openclaw\workspace\stablecoin-ops-dashboard'

$content = Get-Content -Raw '.\tmp\news-brief-2026-02-11.md'

$payloadObj = [ordered]@{
  title     = 'Stablecoin / Crypto News Brief (EN) - 2026-02-11'
  contentMd = $content
  source    = 'cron'
}

$payloadObj | ConvertTo-Json -Depth 10 | pnpm --filter @scod/api ingest:news
