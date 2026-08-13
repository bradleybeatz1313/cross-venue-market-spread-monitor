import { describe, expect, it } from 'vitest';

import { analyzePair } from '../src/analysis.js';
import type { MatchedPair } from '../src/types.js';

const pair: MatchedPair = {
    left: {
        venue: 'polymarket',
        id: 'p',
        title: 'Will X happen?',
        canonicalUrl: 'https://polymarket.com/event/p',
        closeTime: '2027-01-01T00:00:00.000Z',
        resolutionRules: 'Yes if X happens.',
        observedAt: '2026-08-13T00:00:00.000Z',
        yesBook: { asks: [{ price: 0.42, size: 200 }], bids: [] },
        noBook: { asks: [{ price: 0.6, size: 200 }], bids: [] },
    },
    right: {
        venue: 'kalshi',
        id: 'k',
        title: 'Will X happen?',
        canonicalUrl: 'https://kalshi.com/markets/k',
        closeTime: '2027-01-01T00:00:00.000Z',
        resolutionRules: 'Yes if X happens.',
        observedAt: '2026-08-13T00:00:01.000Z',
        yesBook: { asks: [{ price: 0.47, size: 200 }], bids: [] },
        noBook: {
            asks: [
                { price: 0.53, size: 50 },
                { price: 0.55, size: 200 },
            ],
            bids: [],
        },
    },
    similarity: 0.9,
    reasons: ['title-token-similarity'],
};

describe('analyzePair', () => {
    it('treats stakeUsd as a total capital budget and walks both books', () => {
        const result = analyzePair(pair, { stakeUsd: 100, feeRatePct: 1, slippageBufferPct: 0.5 });
        expect(result).not.toBeNull();
        expect(result?.classification).toBe('candidate-spread');
        expect(result?.fillableContracts).toBeCloseTo(102.6002, 4);
        expect(result?.grossCostUsd).toBeCloseTo(98.5222, 4);
        expect(result?.estimatedFeesUsd).toBeCloseTo(0.9852, 4);
        expect(result?.safetyBufferUsd).toBeCloseTo(0.4926, 4);
        expect(result?.grossCostUsd ?? 0).toBeLessThanOrEqual(100);
        expect(
            (result?.grossCostUsd ?? 0) + (result?.estimatedFeesUsd ?? 0) + (result?.safetyBufferUsd ?? 0),
        ).toBeCloseTo(100, 3);
        const totalModeledCapital =
            (result?.grossCostUsd ?? 0) + (result?.estimatedFeesUsd ?? 0) + (result?.safetyBufferUsd ?? 0);
        expect(result?.netReturnPct).toBeCloseTo(((result?.netProfitUsd ?? 0) / totalModeledCapital) * 100, 4);
        expect(result?.netReturnPct).toBe(2.6002);
        expect(result?.riskFlags).toContain('human-resolution-review-required');
        expect(result?.direction).toBe('YES Polymarket + NO Kalshi');
    });

    it('returns null when available depth cannot cover both legs', () => {
        const thin = structuredClone(pair);
        thin.right.noBook.asks = [{ price: 0.53, size: 0.1 }];
        thin.right.yesBook.asks = [{ price: 0.47, size: 0.1 }];
        expect(analyzePair(thin, { stakeUsd: 100, feeRatePct: 1, slippageBufferPct: 0.5 })).toBeNull();
    });
});
