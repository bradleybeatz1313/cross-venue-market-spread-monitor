import { analyzePair } from './analysis.js';
import { fixtureMarkets } from './fixtures.js';
import { parseInput } from './input.js';
import { fetchLiveMarkets } from './live.js';
import { matchMarkets } from './matching.js';
import type { ActorInput, CandidateSpread } from './types.js';

export interface RunSummary {
    status: 'succeeded';
    mode: ActorInput['mode'];
    sourceRequests: number;
    marketsLoaded: number;
    matchedPairs: number;
    resultCount: number;
    generatedAt: string;
    disclaimer: string;
}

export async function runAnalysis(rawInput: unknown): Promise<{ records: CandidateSpread[]; summary: RunSummary }> {
    const input = parseInput(rawInput);
    const markets = input.mode === 'fixtures' ? fixtureMarkets() : await fetchLiveMarkets(input);
    const pairs = matchMarkets(markets.polymarket, markets.kalshi, input);
    const records = pairs
        .map((pair) => analyzePair(pair, input))
        .filter((record): record is CandidateSpread => record !== null && record.netReturnPct >= input.minNetReturnPct)
        .sort((a, b) => b.netReturnPct - a.netReturnPct)
        .slice(0, input.maxResults);
    return {
        records,
        summary: {
            status: 'succeeded',
            mode: input.mode,
            sourceRequests: input.mode === 'fixtures' ? 0 : 2,
            marketsLoaded: markets.polymarket.length + markets.kalshi.length,
            matchedPairs: pairs.length,
            resultCount: records.length,
            generatedAt: new Date().toISOString(),
            disclaimer:
                'Candidate spreads are research signals, not guaranteed profit or trading advice. Verify rules, eligibility, depth, fees, and both fills manually.',
        },
    };
}
