$ErrorActionPreference='Stop'
$k=(Get-Content 'C:\Users\MJ\.openclaw\workspace\stablecoin-ops-dashboard\apps\api\.env' | Select-String '^API_KEY=').Line.Split('=')[1]
$res = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3001/v1/news?limit=3' -Headers @{ Authorization = ('Bearer ' + $k) }
$res | ConvertTo-Json -Depth 6
