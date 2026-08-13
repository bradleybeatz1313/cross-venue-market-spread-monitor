import { describe, expect, it } from 'vitest';

import { parseInput } from '../src/input.js';

describe('parseInput', () => {
    it('defaults to fixture mode and bounded analysis settings', () => {
        const input = parseInput({});
        expect(input.mode).toBe('fixtures');
        expect(input.stakeUsd).toBe(100);
        expect(input.maxResults).toBe(100);
    });

    it('rejects live mode unless every source authorization is attested', () => {
        expect(() => parseInput({ mode: 'live' })).toThrow(/authorization/i);
    });

    it('accepts live mode only with explicit current source approvals', () => {
        const input = parseInput({
            mode: 'live',
            authorization: {
                polymarketPublicApiApproved: true,
                kalshiDeveloperAgreementReviewed: true,
                commercialRedistributionApproved: true,
                termsReviewedOn: '2026-08-13',
            },
        });
        expect(input.mode).toBe('live');
    });

    it('rejects unknown fields and unsafe bounds', () => {
        expect(() => parseInput({ unexpected: true })).toThrow();
        expect(() => parseInput({ maxResults: 1001 })).toThrow();
        expect(() => parseInput({ stakeUsd: 0 })).toThrow();
    });
});
