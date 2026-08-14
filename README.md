## What does Cross-Venue Prediction Market Spread Monitor do?

**Cross-Venue Prediction Market Spread Monitor** retrieves active binary markets from the official public Polymarket and Kalshi market-data APIs, identifies plausible equivalent events, loads executable order-book depth for matched pairs, and emits explainable **candidate spreads**. It is read-only: it has no signer, wallet, account-password, API-key, cookie, or order-placement capability.

Live mode is the default in version 0.2. Fixture mode remains available only for deterministic integration testing and makes zero venue requests.

## Why use this prediction market spread monitor?

- Retrieve current market metadata from Polymarket and Kalshi without account credentials.
- Request order books only after metadata matching, with explicit market, page, response-size, timeout, retry, and hydration caps.
- Walk executable order-book depth for a configurable total capital budget instead of comparing headline prices.
- Include configurable fee estimates and a slippage/safety buffer.
- Reject polarity, numeric-threshold, close-time, event-type, and named-subject mismatches.
- Show matching reasons, both source URLs, bounded resolution-rule evidence, timestamps, and risk flags.
- Export structured results through Apify Dataset, API, schedules, webhooks, Make, Zapier, n8n, or MCP.
- Never describe a spread as guaranteed or risk-free.

## What data can it return?

| Field                                         | Type     | Description                                                          |
| --------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `direction`                                   | string   | The two complementary contracts analyzed                             |
| `netReturnPct`                                | number   | Estimated return on modeled capital after configured fees and buffer |
| `fillableContracts`                           | number   | Contracts supported by executable depth on both books                |
| `similarity`                                  | number   | Explainable title-token match score                                  |
| `matchReasons`                                | array    | Passed compatibility checks                                          |
| `sourceObservedAt`                            | datetime | Latest observation timestamp across both markets                     |
| `riskFlags`                                   | array    | Required human-review warnings                                       |
| `leftResolutionRules`, `rightResolutionRules` | string   | Bounded rule evidence for manual equivalence review                  |

The Dataset contains derived candidate records, not bulk raw venue payloads or complete order books.

## How to analyze current Polymarket and Kalshi spreads

1. Keep **Data mode** set to `live`.
2. Set the total analysis capital, fee estimate, safety buffer, and match thresholds.
3. Keep collection caps at their defaults unless broader coverage is needed.
4. Click **Start**.
5. Review each candidate's rule text, direct links, source time, executable depth, and risk flags.
6. Export the Dataset as JSON, CSV, Excel, XML, or RSS, or consume it through the API.

The default `minNetReturnPct` is `0`, so the Actor emits only candidates whose modeled return is non-negative after the configured estimates. Set it below zero to inspect equivalent-market spreads that are not currently positive.

## Input

See the **Input** tab for all controls. Runtime validation rejects unknown fields, unsafe numeric bounds, and an explicitly incomplete authorization attestation.

- `stakeUsd` is the total USD capital budget across both legs, including configured fees and safety buffer; no trades occur.
- `feeRatePct` is a configurable estimate, not an authoritative venue fee quote.
- `slippageBufferPct` reserves an additional percentage of modeled acquisition cost as a safety margin.
- `maxMarketsPerVenue`, `maxSourcePages`, and `maxBookPairs` bound live collection.
- `mode: fixtures` returns one deterministic demonstration record and is not current market data.

The private deployment's authorization defaults reflect the operator's confirmed data permissions as of `2026-08-13`. Review permissions before copying, commercializing, or publishing a deployment.

## Output

A live record resembles:

```json
{
    "classification": "candidate-spread",
    "direction": "YES Polymarket + NO Kalshi",
    "leftMarketId": "live-polymarket-id",
    "rightMarketId": "LIVE-KALSHI-TICKER",
    "netReturnPct": 0.42,
    "sourceObservedAt": "2026-08-13T23:00:00.000Z",
    "riskFlags": [
        "human-resolution-review-required",
        "simultaneous-fill-not-guaranteed",
        "fees-are-configurable-estimates"
    ]
}
```

Values above illustrate the schema and are not a current quote. The `OUTPUT` key-value record contains the run summary, including actual source-request count, markets loaded, matched pairs, and emitted results.

## API and automation example

```bash
curl -X POST "https://api.apify.com/v2/acts/YOUR_USERNAME~cross-venue-market-spread-monitor/runs" \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"mode":"live","stakeUsd":100,"maxResults":100}'
```

Never commit or publish your Apify token. Apply `maxTotalChargeUsd`, memory, and timeout limits when an agent calls any paid Actor automatically.

## Limits, legal boundaries, and support

- This Actor provides research signals, not financial, legal, tax, or investment advice.
- A matching title does not prove identical resolution semantics; manual rule review remains mandatory.
- Displayed order-book depth does not guarantee simultaneous fills or future availability.
- Fee and buffer inputs are estimates; venue fee schedules and account-specific costs may differ.
- Trading eligibility and geographic restrictions are independent of read-only data access.
- No private user data, account passwords, cookies, wallet keys, or trading credentials are accepted.
- Upstream APIs, schemas, availability, and data rights can change. The Actor fails on malformed or unavailable source responses rather than silently substituting fixture records.
- The implementation is clean-room and does not copy hidden Community Actor source, wording, or branding.

Use the Apify **Issues** tab or the linked GitHub repository for reproducible bug reports. Include sanitized input and a run ID; never include credentials.
