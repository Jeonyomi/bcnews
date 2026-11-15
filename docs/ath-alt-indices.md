# KBN ATH/ENA and ATH/ZEC indices

These extend the existing KBN hourly relative-strength posts. They do not restart the intentionally stopped Quant project.

## One shared reference minute

Both pairs use the existing **2026-08-26 16:09 KST = 100** reference and ATH **6.91 KRW**. Historical inputs are minute closes, not exactly synchronized ticks.

- **ENA:** Upbit `KRW-ENA` minute close **200 KRW**. Query `https://api.upbit.com/v1/candles/minutes/1?market=KRW-ENA&to=2026-08-26T07:10:00Z&count=1`; the exclusive `to` returns UTC07:09/KST16:09. Response SHA256 `83ede821056f01562084bba06c3121fbec3cb3f0e53574f84ec264ed69e08c89`. ATH/ENA base ratio = `6.91 / 200`.
- **ZEC:** Upbit has no KRW-ZEC market (404). Binance spot `ZECBTC` at the same minute has open1787728140000, close1787728199999, close price **0.01000210 BTC per ZEC**. Query `https://api.binance.com/api/v3/klines?symbol=ZECBTC&interval=1m&startTime=1787728140000&endTime=1787728199999&limit=1`; response SHA256 `44a9ca175c2caadd4244083059cf14bdb269976ecfa8bdb41e9e7efdbb980f7b`. Use the existing BTC baseline109,825,000KRW: ATH/ZEC base ratio = `(6.91 / 109825000) / 0.01000210`. This is an explicitly labelled **BTC-cross baseline**, not an observed native ZEC/KRW quote. The ZEC post says `기준 ZEC: BTC 교차환산`.

Formula for either pair: `100 * (current ATH / current quote) / base ratio`, rounded to0.1. Current ATH/quote prices are in the same currency (Coinbase USD spot), with one shared current ATH observation and UTC-hour key reused from ATH/ETH. Refuse missing, malformed, nonpositive, nonfinite or zero-rounded values; do not manufacture historical prices.

The same107/119/131 and risk90 display landmarks are relative-percentage guide levels, not separately validated trade recommendations. The indices are not account returns or automatic conversion instructions.

## Publishing and compatibility

The existing authenticated alt-snapshots job adds ATH/ENA and ATH/ZEC after ATH/ETH + ATH/BTC and before ordinary HYPE/ENA prices. Each new pair has an isolated failure result and independent hourly dedupe: `ath_ena_index_hourly:<UTC-hour>` / `ath_zec_index_hourly:<UTC-hour>`. The original ETH and BTC formula/config/posting modules remain unchanged. New pairs reuse the same KBN target, market_snapshot lane and existing sender; no new scheduler, historical backfill or direct unmanaged Telegram send is needed.
