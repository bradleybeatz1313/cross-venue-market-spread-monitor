import type { Market, MatchedPair } from './types.js';

const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'will', 'be', 'is', 'in', 'on', 'of', 'and', 'or']);

function tokens(title: string): Set<string> {
    return new Set(
        title
            .toLowerCase()
            .replace(/[^a-z0-9.%]+/g, ' ')
            .split(/\s+/)
            .filter((word) => word && !STOP_WORDS.has(word)),
    );
}

function similarity(left: string, right: string): number {
    const a = tokens(left);
    const b = tokens(right);
    const intersection = [...a].filter((value) => b.has(value)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
}

function numericTerms(value: string): string[] {
    return value.match(/\d+(?:\.\d+)?%?/g) ?? [];
}

function polarityConflict(left: string, right: string): boolean {
    const negative = /\b(lose|loses|lost|not|under|below)\b/i;
    return negative.test(left) !== negative.test(right);
}

export function matchMarkets(
    left: Market[],
    right: Market[],
    options: { minSimilarity: number; maxCloseHours: number },
): MatchedPair[] {
    const matches: MatchedPair[] = [];
    for (const a of left)
        for (const b of right) {
            if (polarityConflict(a.title, b.title)) continue;
            if (numericTerms(a.title).join('|') !== numericTerms(b.title).join('|')) continue;
            const closeHours = Math.abs(Date.parse(a.closeTime) - Date.parse(b.closeTime)) / 3_600_000;
            if (!Number.isFinite(closeHours) || closeHours > options.maxCloseHours) continue;
            const score = similarity(a.title, b.title);
            if (score < options.minSimilarity) continue;
            matches.push({
                left: a,
                right: b,
                similarity: score,
                reasons: [
                    'title-token-similarity',
                    'numeric-terms-compatible',
                    'polarity-compatible',
                    'close-times-compatible',
                ],
            });
        }
    return matches.sort((a, b) => b.similarity - a.similarity);
}
