import { describe, expect, it, vi } from 'vitest';

import { fetchLiveMarkets, normalizeKalshiMarket, normalizePolymarketMarket } from '../src/live.js';
import type { ActorInput } from '../src/types.js';

const input: ActorInput = {
    mode: 'live',
    stakeUsd: 100,
    maxResults: 10,
    minSimilarity: 0.55,
    maxCloseHours: 72,
    minNetReturnPct: -100,
    feeRatePct: 1,
    slippageBufferPct: 0.5,
    maxMarketsPerVenue: 100,
    maxSourcePages: 2,
    maxBookPairs: 10,
    authorization: {
        polymarketPublicApiApproved: true,
        kalshiDeveloperAgreementReviewed: true,
        commercialRedistributionApproved: true,
        termsReviewedOn: '2026-08-13',
    },
};

const polyMarket = {
    id: 'poly-1',
    question: 'Will Trump recognize Somaliland before 2027?',
    slug: 'trump-recognize-somaliland',
    endDate: '2026-12-31T00:00:00Z',
    active: true,
    closed: false,
    enableOrderBook: true,
    outcomes: '["Yes", "No"]',
    clobTokenIds: '["yes-token", "no-token"]',
    description: 'Resolves Yes if the United States formally recognizes Somaliland before 2027.',
    events: [{ slug: 'trump-recognize-somaliland-before-2027' }],
};

const kalshiMarket = {
    ticker: 'KXRECOGSOMALI-29-27',
    event_ticker: 'KXRECOGSOMALI-29',
    title: 'Will Trump recognize Somaliland?',
    yes_sub_title: 'Before 2027',
    close_time: '2027-01-01T15:00:00Z',
    status: 'active',
    market_type: 'binary',
    rules_primary: 'Resolves Yes if the United States formally recognizes Somaliland before 2027.',
    rules_secondary: 'Recognition must be formal.',
};

const polyYesBook = {
    bids: [{ price: '0.07', size: '50' }],
    asks: [{ price: '0.08', size: '50' }],
};
const polyNoBook = {
    bids: [{ price: '0.91', size: '50' }],
    asks: [{ price: '0.92', size: '50' }],
};
const kalshiBook = {
    orderbook_fp: {
        yes_dollars: [
            ['0.0700', '40.00'],
            ['0.0730', '10.00'],
        ],
        no_dollars: [
            ['0.8800', '25.00'],
            ['0.9000', '25.00'],
        ],
    },
};

function response(value: unknown): Response {
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('live source normalization', () => {
    it('normalizes Polymarket binary metadata and preserves token IDs internally', () => {
        const market = normalizePolymarketMarket(polyMarket, '2026-08-13T00:00:00.000Z');
        expect(market).toMatchObject({
            venue: 'polymarket',
            id: 'poly-1',
            title: polyMarket.question,
            closeTime: '2026-12-31T00:00:00.000Z',
            canonicalUrl: 'https://polymarket.com/event/trump-recognize-somaliland-before-2027',
            yesTokenId: 'yes-token',
            noTokenId: 'no-token',
        });
    });

    it('normalizes Kalshi metadata without requiring account credentials', () => {
        const market = normalizeKalshiMarket(kalshiMarket, '2026-08-13T00:00:00.000Z');
        expect(market).toMatchObject({
            venue: 'kalshi',
            id: kalshiMarket.ticker,
            title: 'Will Trump recognize Somaliland? — Before 2027',
        });
        expect(JSON.stringify(market)).not.toMatch(/password|api[_-]?key|cookie/i);
    });
});

describe('fetchLiveMarkets', () => {
    it('paginates metadata, fetches books only for matched markets, and returns request evidence', async () => {
        const requested: string[] = [];
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            requested.push(url);
            if (url.includes('gamma-api.polymarket.com/markets/keyset')) {
                return response({ markets: [polyMarket] });
            }
            if (url.includes('external-api.kalshi.com/trade-api/v2/events?')) {
                return response({ events: [{ markets: [kalshiMarket] }], cursor: '' });
            }
            if (url.includes('clob.polymarket.com/book') && url.includes('yes-token')) return response(polyYesBook);
            if (url.includes('clob.polymarket.com/book') && url.includes('no-token')) return response(polyNoBook);
            if (url.includes('/KXRECOGSOMALI-29-27/orderbook')) return response(kalshiBook);
            return new Response('not found', { status: 404 });
        });

        const result = await fetchLiveMarkets(input, {
            fetchImpl: fetchImpl as typeof fetch,
            now: () => new Date('2026-08-13T00:00:00.000Z'),
        });

        expect(result.polymarket).toHaveLength(1);
        expect(result.kalshi).toHaveLength(1);
        expect(result.sourceRequests).toBe(5);
        expect(result.polymarket[0]?.yesBook.asks).toEqual([{ price: 0.08, size: 50 }]);
        expect(result.kalshi[0]?.yesBook.asks[0]?.price).toBeCloseTo(0.1, 8);
        expect(result.kalshi[0]?.yesBook.asks[0]?.size).toBe(25);
        expect(result.kalshi[0]?.yesBook.asks[1]).toEqual({ price: 0.12, size: 25 });
        expect(result.kalshi[0]?.noBook.asks).toEqual([
            { price: 0.927, size: 10 },
            { price: 0.93, size: 40 },
        ]);
        expect(requested.every((url) => !/[?&](token|key|password|email)=/i.test(url))).toBe(true);
    });

    it('rejects unknown upstream shapes instead of reporting an empty clean run', async () => {
        const fetchImpl = vi.fn(async () => response({ unexpected: [] }));
        await expect(fetchLiveMarkets(input, { fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
            'Unrecognized Polymarket market-list response',
        );
    });

    it('does not retry permanent HTTP failures', async () => {
        const fetchImpl = vi.fn(async () => new Response('missing', { status: 404 }));
        await expect(
            fetchLiveMarkets(input, { fetchImpl: fetchImpl as typeof fetch, sleep: async () => undefined }),
        ).rejects.toThrow('HTTP 404');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('settles both metadata sources before rejecting and makes no post-return requests', async () => {
        let kalshiAttempts = 0;
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api')) return new Response('missing', { status: 404 });
            kalshiAttempts += 1;
            return new Response('unavailable', { status: 503 });
        });
        await expect(
            fetchLiveMarkets(input, { fetchImpl: fetchImpl as typeof fetch, sleep: async () => undefined }),
        ).rejects.toThrow();
        const requestsAtReturn = fetchImpl.mock.calls.length;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        expect(kalshiAttempts).toBe(3);
        expect(fetchImpl).toHaveBeenCalledTimes(requestsAtReturn);
    });

    it('retries transient failures and honors Retry-After', async () => {
        const sleeps: number[] = [];
        let polyAttempts = 0;
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api')) {
                polyAttempts += 1;
                if (polyAttempts === 1)
                    return new Response('limited', { status: 429, headers: { 'retry-after': '2' } });
                return response({ markets: [polyMarket] });
            }
            if (url.includes('/events?')) return response({ events: [{ markets: [kalshiMarket] }], cursor: '' });
            if (url.includes('yes-token')) return response(polyYesBook);
            if (url.includes('no-token')) return response(polyNoBook);
            return response(kalshiBook);
        });
        await fetchLiveMarkets(input, {
            fetchImpl: fetchImpl as typeof fetch,
            sleep: async (ms) => {
                sleeps.push(ms);
            },
        });
        expect(polyAttempts).toBe(2);
        expect(sleeps).toContain(2000);
    });

    it('stops streaming when a response exceeds the byte cap', async () => {
        const fetchImpl = vi.fn(async () => {
            const stream = new ReadableStream<Uint8Array>({
                pull(controller) {
                    controller.enqueue(new Uint8Array(8));
                },
            });
            return new Response(stream, { status: 200 });
        });
        await expect(
            fetchLiveMarkets(input, {
                fetchImpl: fetchImpl as typeof fetch,
                maxResponseBytes: 16,
                sleep: async () => undefined,
            }),
        ).rejects.toThrow('too large');
    });

    it('cancels a declared oversized response body', async () => {
        let cancelled = false;
        const fetchImpl = vi.fn(async () => {
            const stream = new ReadableStream<Uint8Array>({
                pull() {},
                cancel() {
                    cancelled = true;
                },
            });
            return new Response(stream, { status: 200, headers: { 'content-length': '17' } });
        });
        await expect(
            fetchLiveMarkets(input, {
                fetchImpl: fetchImpl as typeof fetch,
                maxResponseBytes: 16,
                sleep: async () => undefined,
            }),
        ).rejects.toThrow('too large');
        expect(cancelled).toBe(true);
    });

    it('fails explicitly on a repeated pagination cursor', async () => {
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api')) return response({ markets: [polyMarket], next_cursor: 'loop' });
            return response({ events: [{ markets: [kalshiMarket] }], cursor: '' });
        });
        await expect(fetchLiveMarkets(input, { fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
            'pagination cursor cycle',
        );
    });

    it('detects non-consecutive cursor cycles and deduplicates repeated market IDs', async () => {
        let page = 0;
        const cursors = ['A', 'B', 'A'];
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api'))
                return response({ markets: [polyMarket, polyMarket], next_cursor: cursors[page++] });
            return response({ events: [{ markets: [kalshiMarket, kalshiMarket] }], cursor: '' });
        });
        await expect(
            fetchLiveMarkets({ ...input, maxSourcePages: 4 }, { fetchImpl: fetchImpl as typeof fetch }),
        ).rejects.toThrow('pagination cursor cycle');
    });

    it('drops a stale pair while preserving successfully hydrated pairs', async () => {
        const stalePoly = { ...polyMarket, id: 'poly-stale', clobTokenIds: '["stale-yes", "stale-no"]' };
        const staleKalshi = { ...kalshiMarket, ticker: 'KX-STALE' };
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api')) return response({ markets: [polyMarket, stalePoly] });
            if (url.includes('/events?'))
                return response({ events: [{ markets: [kalshiMarket, staleKalshi] }], cursor: '' });
            if (url.includes('stale-') || url.includes('KX-STALE')) return new Response('gone', { status: 404 });
            if (url.includes('yes-token')) return response(polyYesBook);
            if (url.includes('no-token')) return response(polyNoBook);
            return response(kalshiBook);
        });
        const result = await fetchLiveMarkets({ ...input, maxBookPairs: 2 }, { fetchImpl: fetchImpl as typeof fetch });
        expect(result.pairs).toHaveLength(1);
        expect(result.pairs[0]?.left.id).toBe('poly-1');
    });

    it('waits for sibling token requests before finalizing source request counts', async () => {
        let siblingFinished = false;
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api')) return response({ markets: [polyMarket] });
            if (url.includes('/events?')) return response({ events: [{ markets: [kalshiMarket] }], cursor: '' });
            if (url.includes('yes-token')) return new Response('gone', { status: 404 });
            if (url.includes('no-token')) {
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
                siblingFinished = true;
                return response(polyNoBook);
            }
            return response(kalshiBook);
        });
        let rejected: unknown;
        try {
            await fetchLiveMarkets(input, { fetchImpl: fetchImpl as typeof fetch });
        } catch (error) {
            rejected = error;
        }
        const requestsAtReturn = fetchImpl.mock.calls.length;
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        expect(rejected).toBeInstanceOf(Error);
        expect(siblingFinished).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(requestsAtReturn);
    });

    it('fails closed when every hydrated order book has an unknown schema', async () => {
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api')) return response({ markets: [polyMarket] });
            if (url.includes('/events?')) return response({ events: [{ markets: [kalshiMarket] }], cursor: '' });
            return response({ unexpected: true });
        });
        await expect(fetchLiveMarkets(input, { fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow('Unrecognized');
    });

    it('isolates a partial unknown book schema and waits for all hydration workers', async () => {
        const secondPoly = {
            ...polyMarket,
            id: 'poly-2',
            question: polyMarket.question.replace('Trump', 'Biden'),
            clobTokenIds: '["second-yes", "second-no"]',
        };
        const secondKalshi = {
            ...kalshiMarket,
            ticker: 'KX-SECOND',
            title: kalshiMarket.title.replace('Trump', 'Biden'),
        };
        let delayedFinished = false;
        const fetchImpl = vi.fn(async (resource: string | URL | Request) => {
            const url = String(resource);
            if (url.includes('gamma-api')) return response({ markets: [polyMarket, secondPoly] });
            if (url.includes('/events?'))
                return response({ events: [{ markets: [kalshiMarket, secondKalshi] }], cursor: '' });
            if (url.includes('yes-token')) return response({ unexpected: true });
            if (url.includes('no-token')) return response(polyNoBook);
            if (url.includes('second-yes')) {
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
                delayedFinished = true;
                return response(polyYesBook);
            }
            if (url.includes('second-no')) return response(polyNoBook);
            return response(kalshiBook);
        });
        const result = await fetchLiveMarkets({ ...input, maxBookPairs: 2 }, { fetchImpl: fetchImpl as typeof fetch });
        expect(delayedFinished).toBe(true);
        expect(result.pairs).toHaveLength(1);
        expect(result.pairs[0]?.left.id).toBe('poly-2');
    });
});
