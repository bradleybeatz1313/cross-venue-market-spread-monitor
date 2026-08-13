import { describe, expect, it } from 'vitest';

import { runAnalysis } from '../src/pipeline.js';

describe('fixture pipeline', () => {
    it('produces deterministic provenance-bearing candidate records and a timestamped summary', async () => {
        const result = await runAnalysis({ mode: 'fixtures', stakeUsd: 100, maxResults: 10 });
        expect(result.summary.mode).toBe('fixtures');
        expect(result.summary.sourceRequests).toBe(0);
        expect(result.records.length).toBeGreaterThan(0);
        expect(result.records[0]?.sourceObservedAt).toMatch(/^2026-/);
        expect(result.records[0]?.leftMarketUrl).toMatch(/^https:\/\//);
        expect(result.records[0]?.netReturnPct).toBe(2.6667);
    });

    it('rejects fully attested live mode before any source request', async () => {
        await expect(
            runAnalysis({
                mode: 'live',
                authorization: {
                    polymarketPublicApiApproved: true,
                    kalshiDeveloperAgreementReviewed: true,
                    commercialRedistributionApproved: true,
                    termsReviewedOn: '2026-08-13',
                },
            }),
        ).rejects.toThrow('Live source access is disabled');
    });
});
