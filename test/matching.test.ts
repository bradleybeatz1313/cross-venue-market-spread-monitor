import { describe, expect, it } from 'vitest';

import { matchMarkets } from '../src/matching.js';
import type { Market } from '../src/types.js';

const market = (overrides: Partial<Market>): Market => ({
    venue: 'polymarket',
    id: 'p1',
    title: 'Will candidate A win the 2028 election?',
    canonicalUrl: 'https://polymarket.com/event/p1',
    closeTime: '2028-11-07T23:00:00.000Z',
    resolutionRules: 'Resolves Yes if candidate A wins the 2028 election.',
    yesBook: { asks: [{ price: 0.45, size: 1000 }], bids: [] },
    noBook: { asks: [{ price: 0.56, size: 1000 }], bids: [] },
    observedAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
});

describe('matchMarkets', () => {
    it('matches semantically aligned questions with compatible close dates', () => {
        const right = market({ venue: 'kalshi', id: 'k1', title: 'Candidate A to win the 2028 election?' });
        const [pair] = matchMarkets([market({})], [right], { minSimilarity: 0.5, maxCloseHours: 48 });
        expect(pair?.right.id).toBe('k1');
        expect(pair?.reasons).toContain('close-times-compatible');
    });

    it('rejects opposite polarity and incompatible numeric thresholds', () => {
        const opposite = market({ venue: 'kalshi', id: 'k1', title: 'Will candidate A lose the 2028 election?' });
        const threshold = market({ venue: 'kalshi', id: 'k2', title: 'Will inflation exceed 4% in 2028?' });
        const source = market({ title: 'Will inflation exceed 3% in 2028?' });
        expect(matchMarkets([market({})], [opposite], { minSimilarity: 0.2, maxCloseHours: 48 })).toEqual([]);
        expect(matchMarkets([source], [threshold], { minSimilarity: 0.2, maxCloseHours: 48 })).toEqual([]);
    });
});
