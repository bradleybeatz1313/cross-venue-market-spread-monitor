## What does Cross-Venue Prediction Market Spread Monitor do?

**Cross-Venue Prediction Market Spread Monitor** independently compares equivalent binary markets on [Polymarket](https://polymarket.com/) and [Kalshi](https://kalshi.com/) and returns explainable **candidate spreads**. It is read-only: it has no signer, wallet, account-password, or order-placement capability.

Version 0.1 runs fixture market records only and makes zero venue requests. Those market records and resulting candidate records are deterministic; run metadata such as `generatedAt` records the actual execution time. Live mode fails closed while commercial redistribution rights are unresolved. This is deliberate: public API access does not automatically authorize a paid data product.

## Why use this prediction market spread monitor?

- Walk order-book depth for a configurable analysis size instead of comparing headline prices.
- Include configurable fee estimates and a slippage/safety buffer.
- Reject obvious polarity, numeric-threshold, and close-time mismatches.
- Show matching reasons, both source URLs, full resolution-rule evidence, timestamps, and risk flags.
- Export structured results through Apify Dataset, API, schedules, webhooks, Make, Zapier, n8n, or MCP.
- Never describe a spread as guaranteed or risk-free.

## What data can it return?

| Field                                         | Type     | Description                                                    |
| --------------------------------------------- | -------- | -------------------------------------------------------------- |
| `direction`                                   | string   | The two complementary contracts analyzed                       |
| `netReturnPct`                                | number   | Estimated return after configured fees and safety buffer       |
| `fillableContracts`                           | number   | Requested contracts only when both books have sufficient depth |
| `similarity`                                  | number   | Explainable title-token match score                            |
| `matchReasons`                                | array    | Passed semantic safety checks                                  |
| `sourceObservedAt`                            | datetime | Latest observation timestamp across both markets               |
| `riskFlags`                                   | array    | Required human-review warnings                                 |
| `leftResolutionRules`, `rightResolutionRules` | string   | Rule evidence for manual equivalence review                    |

## How to analyze Polymarket and Kalshi candidate spreads

1. Keep **Data mode** set to `fixtures`.
2. Set the analysis size, fee estimate, safety buffer, and match thresholds.
3. Click **Start**.
4. Review each candidate's two rule texts, direct links, source time, depth, and risk flags.
5. Export the Dataset as JSON, CSV, Excel, XML, or RSS, or consume it through the API.

Live source access is not available in v0.1. The authorization object is a guardrail, not proof of permission.

## How much does it cost?

The initial fixture-only release is intended for transparent product evaluation. Apify platform usage may still apply according to your account plan. A paid event model will only be proposed after commercial data rights and real cloud costs are verified. No claim about a future price is made here.

## Input

See the **Input** tab for all controls. Runtime validation is stricter than the form: unknown fields, unsafe numeric bounds, and incomplete live authorizations are rejected.

- `stakeUsd` is the total USD capital budget across both legs, including the configured fee estimate and safety buffer; no trades occur.
- `feeRatePct` is a configurable estimate, not an authoritative venue fee quote.
- `slippageBufferPct` reserves an additional percentage of modeled acquisition cost as a safety margin.
- `mode: live` remains blocked even if attestations are supplied in v0.1.

## Output

You can download the Dataset in formats such as JSON, HTML, CSV, or Excel. A fixture record resembles:

```json
{
    "classification": "candidate-spread",
    "direction": "YES Polymarket + NO Kalshi",
    "leftMarketId": "fixture-poly-election",
    "rightMarketId": "fixture-kalshi-election",
    "netReturnPct": 2.6273,
    "sourceObservedAt": "2026-08-13T00:00:00.000Z",
    "riskFlags": [
        "human-resolution-review-required",
        "simultaneous-fill-not-guaranteed",
        "fees-are-configurable-estimates"
    ]
}
```

The `OUTPUT` key-value record contains the machine-readable run summary and confirms whether source requests occurred.

## API and automation examples

Run through the Apify API after deployment:

```bash
curl -X POST "https://api.apify.com/v2/acts/YOUR_USERNAME~cross-venue-market-spread-monitor/runs" \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"fixtures","stakeUsd":100,"maxResults":10}'
```

Never commit or publish your Apify token. Apply `maxTotalChargeUsd`, memory, and timeout limits when an agent calls any paid Actor automatically.

## Limits, legal boundaries, and support

- This Actor provides research signals, not financial, legal, tax, or investment advice.
- A matching title does not prove identical resolution semantics.
- Displayed order-book depth does not guarantee simultaneous fills.
- Trading eligibility and geographic restrictions are independent of data access.
- No private user data, account passwords, cookies, or trading credentials are accepted.
- The implementation is clean-room and does not copy the hidden source, wording, or branding of another Community Actor.
- Polymarket/ICE licensing consultation and Kalshi Developer Agreement review are release blockers for commercial live output.

Use the Apify **Issues** tab or the linked GitHub repository for reproducible bug reports. Include sanitized input and a run ID; never include credentials.
