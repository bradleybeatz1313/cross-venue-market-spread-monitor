import { describe, expect, it } from 'vitest';

import { fixtureMarkets } from '../src/fixtures.js';
import { matchMarkets } from '../src/matching.js';
import { runAnalysis } from '../src/pipeline.js';

describe('fixture pipeline', () => {
    it('produces deterministic provenance-bearing candidate records and a timestamped summary', async () => {
        const result = await runAnalysis({ mode: 'fixtures', stakeUsd: 100, maxResults: 10 });
        expect(result.summary.mode).toBe('fixtures');
        expect(result.summary.sourceRequests).toBe(0);
        expect(result.records.length).toBeGreaterThan(0);
        expect(result.records[0]?.sourceObservedAt).toMatch(/^2026-/);
        expect(result.records[0]?.leftMarketUrl).toMatch(/^https:\/\//);
        expect(result.records[0]?.netReturnPct).toBe(2.6273);
    });

    it('reports the actual request count from an injected live source', async () => {
        const result = await runAnalysis(
            {
                mode: 'live',
                minNetReturnPct: -100,
                authorization: {
                    polymarketPublicApiApproved: true,
                    kalshiDeveloperAgreementReviewed: true,
                    commercialRedistributionApproved: true,
                    termsReviewedOn: '2026-08-13',
                },
            },
            async () => ({
                ...fixtureMarkets(),
                pairs: matchMarkets(fixtureMarkets().polymarket, fixtureMarkets().kalshi, {
                    minSimilarity: 0.55,
                    maxCloseHours: 72,
                }),
                sourceRequests: 7,
            }),
        );
        expect(result.summary.mode).toBe('live');
        expect(result.summary.sourceRequests).toBe(7);
        expect(result.records).toHaveLength(1);
    });

    it('analyzes only the exact pair set selected by a live source', async () => {
        const fixtures = fixtureMarkets();
        const pair = matchMarkets(fixtures.polymarket, fixtures.kalshi, { minSimilarity: 0.55, maxCloseHours: 72 })[0]!;
        const decoy = { ...pair.right, id: 'decoy', title: pair.left.title };
        const result = await runAnalysis({ mode: 'live', minNetReturnPct: -100 }, async () => ({
            polymarket: [pair.left],
            kalshi: [pair.right, decoy],
            pairs: [pair],
            sourceRequests: 3,
        }));
        expect(result.summary.matchedPairs).toBe(1);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]?.rightMarketId).toBe(pair.right.id);
    });
});
