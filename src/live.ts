import type { ActorInput, Market } from './types.js';

export async function fetchLiveMarkets(_input: ActorInput): Promise<{ polymarket: Market[]; kalshi: Market[] }> {
    throw new Error(
        'Live source access is disabled in this release pending written commercial redistribution authorization from both venues.',
    );
}
