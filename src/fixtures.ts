import type { Market } from './types.js';

const observedAt = '2026-08-13T00:00:00.000Z';

export function fixtureMarkets(): { polymarket: Market[]; kalshi: Market[] } {
    return {
        polymarket: [
            {
                venue: 'polymarket',
                id: 'fixture-poly-election',
                title: 'Will candidate A win the 2028 election?',
                canonicalUrl: 'https://polymarket.com/event/fixture-poly-election',
                closeTime: '2028-11-07T23:00:00.000Z',
                resolutionRules: 'Fixture only: resolves Yes if candidate A wins the 2028 election.',
                observedAt,
                yesBook: { asks: [{ price: 0.42, size: 500 }], bids: [] },
                noBook: { asks: [{ price: 0.59, size: 500 }], bids: [] },
            },
        ],
        kalshi: [
            {
                venue: 'kalshi',
                id: 'fixture-kalshi-election',
                title: 'Candidate A to win the 2028 election?',
                canonicalUrl: 'https://kalshi.com/markets/fixture-kalshi-election',
                closeTime: '2028-11-08T00:00:00.000Z',
                resolutionRules: 'Fixture only: resolves Yes if candidate A wins the 2028 election.',
                observedAt,
                yesBook: { asks: [{ price: 0.47, size: 500 }], bids: [] },
                noBook: { asks: [{ price: 0.54, size: 500 }], bids: [] },
            },
        ],
    };
}
