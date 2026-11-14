# KBN ATH/BTC relative-strength index

ATH/BTC is an additional hourly KBN benchmark; it is unrelated to the intentionally stopped Quant trading project. The existing ATH/ETH baseline and posts are unchanged.

## Shared baseline minute

- Reference minute: **2026-08-26 16:09 KST** (`2026-08-26T07:09:00Z`), identical to the existing ATH/ETH index.
- ATH: **6.91 KRW** (reuse the existing agreed ATH constant).
- BTC: **109,825,000 KRW**.
- ETH: **3,426,000 KRW**, checked only to corroborate the existing reference.
- Convention: Upbit **one-minute candle close**, not an exact synchronized second/tick. The ATH and ETH candle closes match the original saved ticker-derived reference values.

Official source: `https://api.upbit.com/v1/candles/minutes/1?market=KRW-BTC&to=2026-08-26T07%3A10%3A00Z&count=1` (exclusive `to`). The returned candle is `2026-08-26T16:09:00` KST with `trade_price=109825000` and last-trade `timestamp=1787728199314`.

Equivalent queries for `KRW-ATH` and `KRW-ETH` returned that same candle minute with closes `6.91` and `3426000`. Never substitute the prior 16:08 candle, today's BTC quote, or a daily close.

```text
ATH/BTC index = ((ATH price / BTC price) / (6.91 / 109825000)) * 100
```

Use the same currency for the two current legs. As with ATH/ETH, current quotes come from Coinbase USD spot. Reuse this run's existing ATH observation and UTC-hour window for ATH/BTC, fetch BTC once, and round the index to one decimal. Nonpositive, nonfinite, overflowed or zero-rounded results must not be published.

The displayed 107 / 119 / 131 and risk 90 are the same percentage-relative guide levels used in ATH/ETH, **not independently validated BTC trading recommendations**. An index above 100 means ATH has outperformed BTC since the reference minute; it is not a portfolio return or a trade execution instruction.

## Publishing

The existing authenticated `/api/jobs/alt-snapshots` hourly task adds ATH/BTC after ATH/ETH and before HYPE/ENA. Use `ath_btc_index_hourly:<UTC-hour>` for independent deduplication, MarkdownV2-safe prices/text, and the existing KBN queue/sender. A BTC-source/queue error is returned explicitly in that pair's result without suppressing the existing ETH/HYPE/ENA feeds. No new Windows task, Quant worker, historical backfill or alternate channel is required.
