# API (Fastify + Prisma)

## Setup
1) Copy env
- `cp ENV.example .env`

2) Start DB
- `docker compose -f ../../infra/docker/docker-compose.yml up -d`

3) Install deps (repo root)
- `pnpm -r install`

4) Prisma
- `pnpm --filter @scod/api prisma:generate`
- `pnpm --filter @scod/api prisma:migrate`

## Run
- `pnpm --filter @scod/api dev`

## Endpoints
- `GET /v1/health`
