cd C:\Users\MJ\.openclaw\workspace\stablecoin-ops-dashboard

$title = @'
Stablecoin / Crypto News Brief (EN) — 2026-02-11
'@

$content = @'
[KR]

1) Korea FSS targets crypto market manipulation; starts Digital Asset Basic Act prep (incl. stablecoins)
- Summary: Korea’s Financial Supervisory Service (FSS) said it will run planned investigations into high-risk crypto market misconduct (e.g., manipulation tactics and misinformation) and develop AI-assisted detection. It also said it has formed a prep team for the upcoming “Digital Asset Basic Act,” including building disclosure standards and licensing review manuals for digital-asset businesses and stablecoin issuers.
- Why it matters: Korea is moving from reactive enforcement to systemized supervision—especially relevant for exchange integrity and any KRW-linked stablecoin regime.
- Link: https://www.yna.co.kr/view/AKR20260209030100002

2) FSS escalates Bithumb incident review to a formal inspection after large BTC mispayment
- Summary: After Bithumb’s large-scale Bitcoin mispayment incident, the FSS upgraded an on-site check to a formal inspection and signaled the results could lead to broader revisions of custody/ledger management standards for centralized exchanges. The report notes Bithumb reconciled internal ledgers vs wallet balances once per day (next-day), contrasting with more frequent controls claimed by competitors.
- Why it matters: A stricter “real-time” reconciliation and custody standard would raise compliance costs and could reshape how Korean exchanges (and their banking partners) run proof-of-reserves and operational controls.
- Link: https://www.yna.co.kr/view/AKR20260209167151002

[Global]

1) Deel + MoonPay partner to enable stablecoin salary payouts (UK/EU first, US later)
- Summary: Deel and MoonPay announced a partnership to support compliant salary payments in stablecoins to users’ non-custodial wallets, with rollout starting next month in the UK/EU and a second phase planned for the US. The announcement frames stablecoin payroll as faster settlement and broader accessibility for workers across borders.
- Why it matters: Payroll is a “sticky” distribution channel—if stablecoin payouts become mainstream in HR/payroll stacks, it materially increases real-world stablecoin velocity and demand.
- Link: https://www.prnewswire.com/news-releases/deel-partners-with-moonpay-to-enable-stablecoin-salary-payouts-for-global-workers-302683797.html

2) CFTC staff updates “payment stablecoin” definition to include national trust banks (margin collateral context)
- Summary: The CFTC’s Market Participants Division reissued Staff Letter 25-40 with a limited revision so that a national trust bank can qualify as a permitted issuer of a “payment stablecoin” under the no-action position. The letter concerns conditions under which futures commission merchants may accept certain non-securities digital assets (including payment stablecoins) as customer margin collateral.
- Why it matters: Expanding eligible issuer types can accelerate institutional usage of stablecoins in regulated derivatives plumbing—an important bridge between TradFi collateral and onchain assets.
- Link: https://www.cftc.gov/PressRoom/PressReleases/9180-26

3) US stablecoin policy talks focus on “yield/rewards,” affecting market-structure momentum
- Summary: Reporting around a Feb. 10 White House stakeholder meeting suggests the “stablecoin yield/rewards” question remains a major sticking point for broader US crypto market-structure efforts (e.g., whether rewards on stablecoin balances are treated as interest-like products). The article points to consumer offers (e.g., USDC rewards programs) as a concrete policy flashpoint.
- Why it matters: Any US rule or bill that restricts stablecoin rewards would directly impact growth loops for USDC/USDT distribution, exchange incentives, and onchain lending/DeFi integrations.
- Link: https://cryptoslate.com/white-house-meeting-can-unfreeze-the-clarity-act-this-week-but-crypto-rewards-liklely-to-be-the-price/

[Watchlist]

1) Korea: Exchange custody/reconciliation standards after the Bithumb inspection
- Summary: Watch whether the FSS inspection produces new guidance on reconciliation frequency, internal controls, and “real asset holding” expectations for centralized exchanges.
- Why it matters: If standards tighten, it can change KR exchange operating models and influence how KR banking rails interact with crypto platforms.
- Link: https://www.yna.co.kr/view/AKR20260209167151002

2) US: How “stablecoin rewards/yield” gets treated in policy (rebate vs interest vs securities-like)
- Summary: Monitor for concrete policy text or regulator interpretations that classify stablecoin “rewards” programs and set boundaries (or bans) on balance-based payouts.
- Why it matters: The classification determines whether stablecoins compete with bank deposits and how aggressively issuers can subsidize adoption.
- Link: https://cryptoslate.com/white-house-meeting-can-unfreeze-the-clarity-act-this-week-but-crypto-rewards-liklely-to-be-the-price/

3) EU: MiCA stablecoin (ART/EMT) implementation posture and guidance
- Summary: Track EBA/ESMA clarifications on MiCA obligations for asset-referenced tokens and e-money tokens, including any views on inducements/interest-like features.
- Why it matters: EU interpretations often become a global template; stricter readings can force product redesign for “reward” programs tied to stablecoins.
- Link: https://www.eba.europa.eu/regulation-and-policy/asset-referenced-and-e-money-tokens-mica

[One-liner]
Korea is tightening exchange oversight after a high-profile incident, while globally stablecoins keep pushing into real payroll rails even as regulators sharpen definitions and debate whether “stablecoin rewards” are bank-like interest.
'@

$json = @{ title=$title.Trim(); contentMd=$content.Trim(); source='cron' } | ConvertTo-Json -Compress

$json | pnpm --filter @scod/api ingest:news
