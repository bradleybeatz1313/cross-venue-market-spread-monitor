import { z } from 'zod';

import { matchMarkets } from './matching.js';
import type { ActorInput, Level, Market, MarketCollection, MatchedPair, OrderBook } from './types.js';

const POLYMARKET_MARKETS_URL = 'https://gamma-api.polymarket.com/markets/keyset';
const POLYMARKET_BOOK_URL = 'https://clob.polymarket.com/book';
const KALSHI_API_URL = 'https://external-api.kalshi.com/trade-api/v2';
const USER_AGENT =
    'cross-venue-market-spread-monitor/0.2 (+https://github.com/bradleybeatz1313/cross-venue-market-spread-monitor)';
const MAX_RESPONSE_BYTES = 20_000_000;

const numericString = z.union([z.string(), z.number()]);
const levelSchema = z.object({ price: numericString, size: numericString }).passthrough();
const polymarketBookSchema = z.object({ bids: z.array(levelSchema), asks: z.array(levelSchema) }).passthrough();
const kalshiBookSchema = z
    .object({
        orderbook_fp: z.object({
            yes_dollars: z.array(z.tuple([numericString, numericString])).default([]),
            no_dollars: z.array(z.tuple([numericString, numericString])).default([]),
        }),
    })
    .passthrough();

const polymarketMarketSchema = z
    .object({
        id: z.string().min(1),
        question: z.string().min(1),
        slug: z.string().min(1),
        endDate: z.string().min(1),
        active: z.boolean(),
        closed: z.boolean(),
        enableOrderBook: z.boolean(),
        outcomes: z.string(),
        clobTokenIds: z.string(),
        description: z.string().default(''),
        events: z.array(z.object({ slug: z.string().optional() }).passthrough()).optional(),
    })
    .passthrough();

const kalshiMarketSchema = z
    .object({
        ticker: z.string().min(1),
        event_ticker: z.string().min(1),
        title: z.string().min(1),
        yes_sub_title: z.string().nullish(),
        close_time: z.string().min(1),
        status: z.string(),
        market_type: z.string().default('binary'),
        rules_primary: z.string().default(''),
        rules_secondary: z.string().default(''),
    })
    .passthrough();

const polymarketListSchema = z.object({
    markets: z.array(z.unknown()),
    next_cursor: z.string().optional(),
});
const kalshiEventListSchema = z.object({
    events: z.array(z.object({ markets: z.array(z.unknown()).default([]) }).passthrough()),
    cursor: z.string().optional(),
});

interface LiveDependencies {
    fetchImpl?: typeof fetch;
    now?: () => Date;
    sleep?: (milliseconds: number) => Promise<void>;
    maxResponseBytes?: number;
}

class NonRetryableSourceError extends Error {}

function boundedText(value: string, limit = 20_000): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function finiteNumber(value: string | number): number | null {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : null;
}

function parseStringArray(value: string): string[] | null {
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : null;
    } catch {
        return null;
    }
}

function emptyBook(): OrderBook {
    return { asks: [], bids: [] };
}

function normalizeLevels(values: { price: string | number; size: string | number }[]): Level[] {
    return values
        .map((value) => ({ price: finiteNumber(value.price), size: finiteNumber(value.size) }))
        .filter(
            (value): value is { price: number; size: number } =>
                value.price !== null && value.size !== null && value.price > 0 && value.price < 1 && value.size > 0,
        )
        .sort((a, b) => a.price - b.price);
}

export function normalizePolymarketMarket(value: unknown, observedAt: string): Market | null {
    const parsed = polymarketMarketSchema.safeParse(value);
    if (!parsed.success) return null;
    const market = parsed.data;
    const outcomes = parseStringArray(market.outcomes);
    const tokens = parseStringArray(market.clobTokenIds);
    if (
        !market.active ||
        market.closed ||
        !market.enableOrderBook ||
        outcomes?.map((item) => item.toLowerCase()).join('|') !== 'yes|no' ||
        tokens?.length !== 2 ||
        !Number.isFinite(Date.parse(market.endDate))
    ) {
        return null;
    }
    const eventSlug = market.events?.[0]?.slug || market.slug;
    return {
        venue: 'polymarket',
        id: market.id,
        title: boundedText(market.question, 500),
        canonicalUrl: `https://polymarket.com/event/${encodeURIComponent(eventSlug)}`,
        closeTime: new Date(market.endDate).toISOString(),
        resolutionRules: boundedText(market.description),
        yesBook: emptyBook(),
        noBook: emptyBook(),
        observedAt,
        yesTokenId: tokens[0],
        noTokenId: tokens[1],
    };
}

export function normalizeKalshiMarket(value: unknown, observedAt: string): Market | null {
    const parsed = kalshiMarketSchema.safeParse(value);
    if (!parsed.success) return null;
    const market = parsed.data;
    if (
        !['active', 'open'].includes(market.status) ||
        market.market_type !== 'binary' ||
        !Number.isFinite(Date.parse(market.close_time))
    ) {
        return null;
    }
    const suffix = market.yes_sub_title?.trim();
    const title =
        suffix && !market.title.toLowerCase().includes(suffix.toLowerCase())
            ? `${market.title} — ${suffix}`
            : market.title;
    return {
        venue: 'kalshi',
        id: market.ticker,
        title: boundedText(title, 500),
        canonicalUrl: `https://kalshi.com/markets/${encodeURIComponent(market.event_ticker.toLowerCase())}`,
        closeTime: new Date(market.close_time).toISOString(),
        resolutionRules: boundedText([market.rules_primary, market.rules_secondary].filter(Boolean).join('\n\n')),
        yesBook: emptyBook(),
        noBook: emptyBook(),
        observedAt,
    };
}

async function readBoundedBody(response: Response, url: URL, maxBytes: number): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw new NonRetryableSourceError(`Source response too large from ${url.host}`);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

function retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
    }
    return 250 * 2 ** attempt;
}

async function requestJson(
    url: URL,
    fetchImpl: typeof fetch,
    onRequest: () => void,
    sleep: (milliseconds: number) => Promise<void>,
    maxResponseBytes: number,
    attempts = 3,
): Promise<unknown> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
            onRequest();
            const response = await fetchImpl(url, {
                headers: { accept: 'application/json', 'user-agent': USER_AGENT },
                signal: controller.signal,
            });
            const contentLength = Number(response.headers.get('content-length') ?? 0);
            if (contentLength > maxResponseBytes) {
                if (response.body) await response.body.cancel();
                throw new NonRetryableSourceError(`Source response too large from ${url.host}`);
            }
            if (!response.ok) {
                const message = `Source request failed: ${url.host} returned HTTP ${response.status}`;
                if (![408, 429].includes(response.status) && response.status < 500)
                    throw new NonRetryableSourceError(message);
                if (attempt + 1 >= attempts) throw new Error(message);
                await sleep(retryDelay(response, attempt));
                continue;
            }
            const body = await readBoundedBody(response, url, maxResponseBytes);
            try {
                return JSON.parse(new TextDecoder().decode(body)) as unknown;
            } catch {
                throw new NonRetryableSourceError(`Source returned malformed JSON from ${url.host}`);
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown source request failure');
            if (error instanceof NonRetryableSourceError) throw error;
            if (attempt + 1 < attempts) await sleep(250 * 2 ** attempt);
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError ?? new Error('Source request failed');
}

async function listPolymarketMarkets(
    input: ActorInput,
    observedAt: string,
    fetchImpl: typeof fetch,
    onRequest: () => void,
    sleep: (milliseconds: number) => Promise<void>,
    maxResponseBytes: number,
): Promise<Market[]> {
    const markets: Market[] = [];
    const marketIds = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < input.maxSourcePages && markets.length < input.maxMarketsPerVenue; page += 1) {
        const url = new URL(POLYMARKET_MARKETS_URL);
        url.searchParams.set('closed', 'false');
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('after_cursor', cursor);
        const raw = await requestJson(url, fetchImpl, onRequest, sleep, maxResponseBytes);
        const parsed = polymarketListSchema.safeParse(raw);
        if (!parsed.success) throw new Error('Unrecognized Polymarket market-list response');
        for (const item of parsed.data.markets) {
            const market = normalizePolymarketMarket(item, observedAt);
            if (market && !marketIds.has(market.id)) {
                marketIds.add(market.id);
                markets.push(market);
            }
            if (markets.length >= input.maxMarketsPerVenue) break;
        }
        const nextCursor = parsed.data.next_cursor;
        if (nextCursor && cursors.has(nextCursor)) throw new Error('Polymarket returned a pagination cursor cycle');
        if (nextCursor) cursors.add(nextCursor);
        cursor = nextCursor;
        if (!cursor || parsed.data.markets.length === 0) break;
    }
    return markets;
}

async function listKalshiMarkets(
    input: ActorInput,
    observedAt: string,
    fetchImpl: typeof fetch,
    onRequest: () => void,
    sleep: (milliseconds: number) => Promise<void>,
    maxResponseBytes: number,
): Promise<Market[]> {
    const markets: Market[] = [];
    const marketIds = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < input.maxSourcePages && markets.length < input.maxMarketsPerVenue; page += 1) {
        const url = new URL(`${KALSHI_API_URL}/events`);
        url.searchParams.set('status', 'open');
        url.searchParams.set('with_nested_markets', 'true');
        url.searchParams.set('limit', '200');
        if (cursor) url.searchParams.set('cursor', cursor);
        const raw = await requestJson(url, fetchImpl, onRequest, sleep, maxResponseBytes);
        const parsed = kalshiEventListSchema.safeParse(raw);
        if (!parsed.success) throw new Error('Unrecognized Kalshi event-list response');
        for (const event of parsed.data.events) {
            for (const item of event.markets) {
                const market = normalizeKalshiMarket(item, observedAt);
                if (market && !marketIds.has(market.id)) {
                    marketIds.add(market.id);
                    markets.push(market);
                }
                if (markets.length >= input.maxMarketsPerVenue) break;
            }
            if (markets.length >= input.maxMarketsPerVenue) break;
        }
        const nextCursor = parsed.data.cursor;
        if (nextCursor && cursors.has(nextCursor)) throw new Error('Kalshi returned a pagination cursor cycle');
        if (nextCursor) cursors.add(nextCursor);
        cursor = nextCursor;
        if (!cursor || parsed.data.events.length === 0) break;
    }
    return markets;
}

async function hydratePolymarket(
    market: Market,
    fetchImpl: typeof fetch,
    onRequest: () => void,
    sleep: (milliseconds: number) => Promise<void>,
    maxResponseBytes: number,
): Promise<Market> {
    if (!market.yesTokenId || !market.noTokenId) throw new Error(`Missing Polymarket token IDs for ${market.id}`);
    const load = async (tokenId: string): Promise<OrderBook> => {
        const url = new URL(POLYMARKET_BOOK_URL);
        url.searchParams.set('token_id', tokenId);
        const parsed = polymarketBookSchema.safeParse(
            await requestJson(url, fetchImpl, onRequest, sleep, maxResponseBytes),
        );
        if (!parsed.success) throw new Error(`Unrecognized Polymarket order-book response for ${market.id}`);
        return { bids: normalizeLevels(parsed.data.bids), asks: normalizeLevels(parsed.data.asks) };
    };
    const [yesResult, noResult] = await Promise.allSettled([load(market.yesTokenId), load(market.noTokenId)]);
    if (yesResult.status === 'rejected') throw yesResult.reason;
    if (noResult.status === 'rejected') throw noResult.reason;
    const yesBook = yesResult.value;
    const noBook = noResult.value;
    return { ...market, yesBook, noBook };
}

async function hydrateKalshi(
    market: Market,
    fetchImpl: typeof fetch,
    onRequest: () => void,
    sleep: (milliseconds: number) => Promise<void>,
    maxResponseBytes: number,
): Promise<Market> {
    const url = new URL(`${KALSHI_API_URL}/markets/${encodeURIComponent(market.id)}/orderbook`);
    url.searchParams.set('depth', '100');
    const parsed = kalshiBookSchema.safeParse(await requestJson(url, fetchImpl, onRequest, sleep, maxResponseBytes));
    if (!parsed.success) throw new Error(`Unrecognized Kalshi order-book response for ${market.id}`);
    const yesBids = normalizeLevels(parsed.data.orderbook_fp.yes_dollars.map(([price, size]) => ({ price, size })));
    const noBids = normalizeLevels(parsed.data.orderbook_fp.no_dollars.map(([price, size]) => ({ price, size })));
    const impliedAsks = (bids: Level[]): Level[] =>
        bids
            .map((level) => ({ price: Number((1 - level.price).toFixed(10)), size: level.size }))
            .sort((a, b) => a.price - b.price);
    return {
        ...market,
        yesBook: { bids: yesBids, asks: impliedAsks(noBids) },
        noBook: { bids: noBids, asks: impliedAsks(yesBids) },
    };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, operation: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await operation(items[index] as T);
        }
    };
    const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    const rejected = workers.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    return results;
}

export async function fetchLiveMarkets(
    input: ActorInput,
    dependencies: LiveDependencies = {},
): Promise<MarketCollection> {
    const sleep =
        dependencies.sleep ??
        (async (milliseconds: number) =>
            new Promise<void>((resolve) => {
                setTimeout(resolve, milliseconds);
            }));
    const maxResponseBytes = dependencies.maxResponseBytes ?? MAX_RESPONSE_BYTES;
    const fetchImpl = dependencies.fetchImpl ?? fetch;
    const observedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    let sourceRequests = 0;
    const onRequest = (): void => {
        sourceRequests += 1;
    };
    const [polymarketResult, kalshiResult] = await Promise.allSettled([
        listPolymarketMarkets(input, observedAt, fetchImpl, onRequest, sleep, maxResponseBytes),
        listKalshiMarkets(input, observedAt, fetchImpl, onRequest, sleep, maxResponseBytes),
    ]);
    if (polymarketResult.status === 'rejected') throw polymarketResult.reason;
    if (kalshiResult.status === 'rejected') throw kalshiResult.reason;
    const polymarketMetadata = polymarketResult.value;
    const kalshiMetadata = kalshiResult.value;
    if (polymarketMetadata.length === 0) throw new Error('Polymarket returned no usable active binary markets');
    if (kalshiMetadata.length === 0) throw new Error('Kalshi returned no usable active binary markets');

    const candidatePairs = matchMarkets(polymarketMetadata, kalshiMetadata, input).slice(0, input.maxBookPairs);
    if (candidatePairs.length === 0) {
        return { polymarket: [], kalshi: [], pairs: [], sourceRequests };
    }
    const polymarketById = new Map(candidatePairs.map((pair) => [pair.left.id, pair.left]));
    const kalshiById = new Map(candidatePairs.map((pair) => [pair.right.id, pair.right]));
    const hydrationErrors: unknown[] = [];
    const [polymarketResults, kalshiResults] = await Promise.all([
        mapConcurrent([...polymarketById.values()], 5, async (market) => {
            try {
                return await hydratePolymarket(market, fetchImpl, onRequest, sleep, maxResponseBytes);
            } catch (error) {
                hydrationErrors.push(error);
                return null;
            }
        }),
        mapConcurrent([...kalshiById.values()], 5, async (market) => {
            try {
                return await hydrateKalshi(market, fetchImpl, onRequest, sleep, maxResponseBytes);
            } catch (error) {
                hydrationErrors.push(error);
                return null;
            }
        }),
    ]);
    const polymarket = polymarketResults.filter((market): market is Market => market !== null);
    const kalshi = kalshiResults.filter((market): market is Market => market !== null);
    const hydratedPolymarket = new Map(polymarket.map((market) => [market.id, market]));
    const hydratedKalshi = new Map(kalshi.map((market) => [market.id, market]));
    const pairs = candidatePairs
        .map((pair): MatchedPair | null => {
            const left = hydratedPolymarket.get(pair.left.id);
            const right = hydratedKalshi.get(pair.right.id);
            return left && right ? { ...pair, left, right } : null;
        })
        .filter((pair): pair is MatchedPair => pair !== null);
    if (pairs.length === 0) {
        const firstError = hydrationErrors[0];
        if (firstError instanceof Error) throw firstError;
        throw new Error('No selected market pairs had usable executable order books');
    }
    return { polymarket, kalshi, pairs, sourceRequests };
}
