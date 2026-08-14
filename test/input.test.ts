import { describe, expect, it } from 'vitest';

import { parseInput } from '../src/input.js';

describe('parseInput', () => {
    it('defaults to live mode and bounded analysis settings after authorization', () => {
        const input = parseInput({});
        expect(input.mode).toBe('live');
        expect(input.stakeUsd).toBe(100);
        expect(input.maxResults).toBe(100);
        expect(input.maxMarketsPerVenue).toBe(3000);
        expect(input.maxSourcePages).toBe(30);
        expect(input.maxBookPairs).toBe(100);
    });

    it('rejects live mode when an explicit authorization is incomplete', () => {
        expect(() =>
            parseInput({
                mode: 'live',
                authorization: {
                    polymarketPublicApiApproved: false,
                    kalshiDeveloperAgreementReviewed: false,
                    commercialRedistributionApproved: false,
                    termsReviewedOn: '',
                },
            }),
        ).toThrow(/authorization/i);
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
