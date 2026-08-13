import type { CandidateSpread, Level, MatchedPair } from './types.js';

function costForContracts(levels: Level[], contracts: number): number | null {
    let remaining = contracts;
    let cost = 0;
    for (const level of [...levels].sort((a, b) => a.price - b.price)) {
        const take = Math.min(remaining, level.size);
        cost += take * level.price;
        remaining -= take;
        if (remaining <= 1e-9) return cost;
    }
    return null;
}

function maxContracts(levels: Level[]): number {
    return levels.reduce((sum, level) => sum + level.size, 0);
}

function totalCapitalForContracts(
    first: Level[],
    second: Level[],
    contracts: number,
    feeRatePct: number,
    slippageBufferPct: number,
): number | null {
    const firstCost = costForContracts(first, contracts);
    const secondCost = costForContracts(second, contracts);
    if (firstCost === null || secondCost === null) return null;
    const grossCost = firstCost + secondCost;
    return grossCost * (1 + (feeRatePct + slippageBufferPct) / 100);
}

function contractsForCapital(
    first: Level[],
    second: Level[],
    capitalUsd: number,
    feeRatePct: number,
    slippageBufferPct: number,
): number {
    let low = 0;
    let high = Math.min(maxContracts(first), maxContracts(second));
    for (let iteration = 0; iteration < 60; iteration += 1) {
        const midpoint = (low + high) / 2;
        const totalCapital = totalCapitalForContracts(first, second, midpoint, feeRatePct, slippageBufferPct);
        if (totalCapital !== null && totalCapital <= capitalUsd) low = midpoint;
        else high = midpoint;
    }
    return low;
}

export function analyzePair(
    pair: MatchedPair,
    options: { stakeUsd: number; feeRatePct: number; slippageBufferPct: number },
): CandidateSpread | null {
    const directions = [
        { label: 'YES Polymarket + NO Kalshi', first: pair.left.yesBook.asks, second: pair.right.noBook.asks },
        { label: 'NO Polymarket + YES Kalshi', first: pair.left.noBook.asks, second: pair.right.yesBook.asks },
    ];
    let best: CandidateSpread | null = null;
    for (const direction of directions) {
        const contracts = contractsForCapital(
            direction.first,
            direction.second,
            options.stakeUsd,
            options.feeRatePct,
            options.slippageBufferPct,
        );
        if (contracts <= 1e-9) continue;
        const firstCost = costForContracts(direction.first, contracts);
        const secondCost = costForContracts(direction.second, contracts);
        if (firstCost === null || secondCost === null) continue;
        const grossCost = firstCost + secondCost;
        const fees = (grossCost * options.feeRatePct) / 100;
        const buffer = (grossCost * options.slippageBufferPct) / 100;
        if (grossCost + fees + buffer < options.stakeUsd * (1 - 1e-6)) continue;
        const profit = contracts - grossCost - fees - buffer;
        const record: CandidateSpread = {
            classification: 'candidate-spread',
            direction: direction.label,
            leftMarketId: pair.left.id,
            leftMarketTitle: pair.left.title,
            leftMarketUrl: pair.left.canonicalUrl,
            rightMarketId: pair.right.id,
            rightMarketTitle: pair.right.title,
            rightMarketUrl: pair.right.canonicalUrl,
            similarity: Number(pair.similarity.toFixed(4)),
            matchReasons: pair.reasons,
            fillableContracts: Number(contracts.toFixed(4)),
            grossCostUsd: Number(grossCost.toFixed(4)),
            estimatedFeesUsd: Number(fees.toFixed(4)),
            safetyBufferUsd: Number(buffer.toFixed(4)),
            netProfitUsd: Number(profit.toFixed(4)),
            netReturnPct: Number(((profit / grossCost) * 100).toFixed(4)),
            sourceObservedAt:
                pair.left.observedAt > pair.right.observedAt ? pair.left.observedAt : pair.right.observedAt,
            leftResolutionRules: pair.left.resolutionRules,
            rightResolutionRules: pair.right.resolutionRules,
            riskFlags: [
                'human-resolution-review-required',
                'simultaneous-fill-not-guaranteed',
                'fees-are-configurable-estimates',
            ],
        };
        if (!best || record.netProfitUsd > best.netProfitUsd) best = record;
    }
    return best;
}
