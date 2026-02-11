# API (draft)

Base: `/v1`

## Auth (toy)
- All endpoints require `Authorization: Bearer <API_KEY>`

## Health
- `GET /v1/health` -> `{ ok: true }`

## News
- `GET /v1/news?limit=&cursor=`
  - cursor is `id` of the last item from previous page
- `POST /v1/news`
  - body: `{ title, contentMd, source? }` where `source` is `manual|cron`
- `GET /v1/news/:id`

## Stablecoin metrics
- `GET /v1/metrics/hourly?chainId=&token=&from=&to=`
- `GET /v1/metrics/latest?chainId=&token=`

## Indexer status
- `GET /v1/indexer/status` (last blocks, lag, last run)
