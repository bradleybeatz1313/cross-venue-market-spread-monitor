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

    it('rejects similar wording that refers to different named entities', () => {
        const somaliland = market({
            title: 'Will Trump recognize Somaliland before 2027?',
            resolutionRules: 'Formal United States recognition of Somaliland before 2027.',
        });
        const china = market({
            venue: 'kalshi',
            id: 'k-china',
            title: 'Will Trump recognize the Republic of China? — Before 2027',
            resolutionRules: 'Formal United States recognition of the Republic of China before 2027.',
        });
        expect(matchMarkets([somaliland], [china], { minSimilarity: 0.55, maxCloseHours: 48 })).toEqual([]);
    });

    it('rejects nomination versus caucus even when the candidate and year match', () => {
        const nomination = market({ title: 'Will Marco Rubio win the 2028 Republican presidential nomination?' });
        const caucus = market({
            venue: 'kalshi',
            id: 'k-caucus',
            title: 'Will Marco Rubio win the 2028 Iowa Republican caucus?',
        });
        expect(matchMarkets([nomination], [caucus], { minSimilarity: 0.55, maxCloseHours: 48 })).toEqual([]);
    });

    it('rejects identical titles with conflicting settlement criteria', () => {
        const popularVote = market({ resolutionRules: 'Resolves Yes if candidate A wins the national popular vote.' });
        const electoralCollege = market({
            venue: 'kalshi',
            id: 'k-electoral',
            resolutionRules: 'Resolves Yes if candidate A wins a majority of Electoral College votes.',
        });
        expect(matchMarkets([popularVote], [electoralCollege], { minSimilarity: 0.5, maxCloseHours: 48 })).toEqual([]);
    });

    it('rejects conflicting criteria even when both rules mention both criteria', () => {
        const popularVote = market({
            resolutionRules:
                'Resolves Yes only if candidate A wins the national popular vote; Electoral College victory alone is excluded.',
        });
        const electoralCollege = market({
            venue: 'kalshi',
            id: 'k-electoral-negation',
            resolutionRules:
                'Resolves Yes if candidate A wins a majority of Electoral College votes, regardless of the national popular vote.',
        });
        expect(matchMarkets([popularVote], [electoralCollege], { minSimilarity: 0.5, maxCloseHours: 48 })).toEqual([]);
    });

    it('rejects synonymous and exclusionary conflicting settlement criteria', () => {
        const popularVote = market({
            resolutionRules:
                'Resolves Yes only from the nationwide vote; electors are not sufficient and do not qualify.',
        });
        const electoralCollege = market({
            venue: 'kalshi',
            id: 'k-electors-synonym',
            resolutionRules:
                'Resolves Yes from electors, irrespective of the nationwide vote, which is immaterial even if won.',
        });
        expect(matchMarkets([popularVote], [electoralCollege], { minSimilarity: 0.5, maxCloseHours: 48 })).toEqual([]);
    });

    it('rejects conflicting authority and preliminary-versus-final settlement sources', () => {
        const preliminary = market({
            resolutionRules: 'Resolves from Agency A preliminary estimate published on election night.',
        });
        const finalReport = market({
            venue: 'kalshi',
            id: 'k-final-report',
            resolutionRules: 'Resolves from Agency B final official report after certification.',
        });
        expect(matchMarkets([preliminary], [finalReport], { minSimilarity: 0.5, maxCloseHours: 48 })).toEqual([]);
    });

    it.each([
        [
            'above versus below threshold',
            'Resolves Yes if the value is above 5.',
            'Resolves Yes if the value is below 5.',
        ],
        [
            'before versus after deadline',
            'Resolves Yes if the event occurs before 2028.',
            'Resolves Yes if the event occurs after 2028.',
        ],
        [
            'different geography',
            'Resolves Yes based on the result in the United States.',
            'Resolves Yes based on the result in California.',
        ],
        [
            'different excluded sources',
            'Resolves from Reuters and explicitly ignores the government report.',
            'Resolves from the government report and explicitly ignores Reuters.',
        ],
        [
            'excluded authorities',
            'Resolves from Agency A and ignores Agency B.',
            'Resolves from Agency B and ignores Agency A.',
        ],
        [
            'excluded finality terms',
            'Resolves from the preliminary estimate and ignores the final figure.',
            'Resolves from the final figure and ignores the preliminary estimate.',
        ],
        [
            'strict versus inclusive above',
            'Resolves Yes if the value is above 5.',
            'Resolves Yes if the value is 5 or above.',
        ],
        [
            'strict versus inclusive below',
            'Resolves Yes if the value is below 5.',
            'Resolves Yes if the value is 5 or below.',
        ],
        [
            'strict versus inclusive before',
            'Resolves Yes if it occurs before 2028.',
            'Resolves Yes if it occurs in 2028 or before.',
        ],
        [
            'strict versus inclusive after',
            'Resolves Yes if it occurs after 2028.',
            'Resolves Yes if it occurs in 2028 or after.',
        ],
        [
            'strict versus inclusive prefix before',
            'Resolves Yes if it occurs before 2028.',
            'Resolves Yes if it occurs on or before 2028.',
        ],
        [
            'strict versus inclusive prefix after',
            'Resolves Yes if it occurs after 2028.',
            'Resolves Yes if it occurs on or after 2028.',
        ],
        ['equality versus above', 'Resolves Yes if the value is equal to 5.', 'Resolves Yes if the value is above 5.'],
        [
            'no more than versus above',
            'Resolves Yes if the value is no more than 5.',
            'Resolves Yes if the value is above 5.',
        ],
        [
            'partially shared compound constraints',
            'Resolves Yes if the value is above 5 and more than 10.',
            'Resolves Yes if the value is above 5 and less than 10.',
        ],
        [
            'equality versus negated equality',
            'Resolves Yes if the value is equal to 5.',
            'Resolves Yes if the value is not equal to 5.',
        ],
        ['opposite symbolic comparators', 'Resolves Yes if the value is >= 5.', 'Resolves Yes if the value is <= 5.'],
    ])('rejects %s settlement conflicts', (_name, leftRules, rightRules) => {
        const left = market({ resolutionRules: leftRules });
        const right = market({ venue: 'kalshi', id: `k-${_name}`, resolutionRules: rightRules });
        expect(matchMarkets([left], [right], { minSimilarity: 0.5, maxCloseHours: 48 })).toEqual([]);
    });

    it('accepts normalized equivalent inclusive comparator forms', () => {
        const cases = [
            ['Resolves Yes if the value is greater than or equal to 5.', 'Resolves Yes if the value is at least 5.'],
            ['Resolves Yes if the value is less than or equal to 5.', 'Resolves Yes if the value is at most 5.'],
            ['Resolves Yes if the value is no less than 5.', 'Resolves Yes if the value is 5 or above.'],
            ['Resolves Yes if the value is no more than 5.', 'Resolves Yes if the value is 5 or below.'],
            ['Resolves Yes if the value is > 5 and < 10.', 'Resolves Yes if the value is < 10 and > 5.'],
            [
                'Resolves Yes if the value is greater than 5 and fewer than 10.',
                'Resolves Yes if the value is less than 10 and more than 5.',
            ],
        ];
        for (const [leftRules, rightRules] of cases) {
            const left = market({ resolutionRules: leftRules });
            const right = market({ venue: 'kalshi', id: `k-${leftRules}`, resolutionRules: rightRules });
            expect(matchMarkets([left], [right], { minSimilarity: 0.5, maxCloseHours: 48 })).toHaveLength(1);
        }
    });

    it('accepts verified equivalent nomination rules with an unrelated before-election-day clause', () => {
        const left = market({
            title: 'Will Rahm Emanuel win the 2028 Democratic presidential nomination?',
            resolutionRules:
                'This market resolves Yes if Rahm Emanuel wins and accepts the 2028 Democratic Party nomination for U.S. president. A replacement before election day does not change resolution.',
        });
        const right = market({
            venue: 'kalshi',
            id: 'KXPRESNOMD-28-REMA',
            title: 'Will Rahm Emanuel be the Democratic Presidential nominee in 2028?',
            resolutionRules:
                'If Rahm Emanuel wins and accepts the nomination for the Presidency for the Democratic party in 2028, then the market resolves to Yes.',
        });
        expect(matchMarkets([left], [right], { minSimilarity: 0.55, maxCloseHours: 48 })).toHaveLength(1);
    });
});
