# Scripts

## dev.ps1
Runs the local dev stack with minimal manual steps:
- installs workspace deps
- syncs `apps/web/.env.local` from `apps/api/.env` (API_KEY)
- starts API and Web in two PowerShell windows

Usage (PowerShell):
- `cd <repo>`
- `./scripts/dev.ps1`
