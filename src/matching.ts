import type { Market, MatchedPair } from './types.js';

const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'will', 'be', 'is', 'in', 'on', 'of', 'and', 'or']);
const SUBJECT_STOP_WORDS = new Set([
    ...STOP_WORDS,
    'acquire',
    'before',
    'buy',
    'candidate',
    'elect',
    'election',
    'nomination',
    'nominee',
    'presidential',
    'recognize',
    'republican',
    'democratic',
    'primary',
    'caucus',
    'win',
]);
const EVENT_TYPE_GROUPS = [['nomination', 'nominee'], ['caucus'], ['primary'], ['election', 'elect']] as const;
const SETTLEMENT_CONFLICT_GROUPS = [
    ['popular vote', 'national popular', 'nationwide vote'],
    ['electoral college', 'electoral votes', 'electors'],
] as const;
const FINALITY_GROUPS = [
    ['preliminary', 'estimate', 'projected', 'projection'],
    ['final', 'official', 'certified', 'certification'],
] as const;
const SOURCE_TERMS = ['reuters', 'associated press', 'ap news', 'government report'] as const;
const GEOGRAPHY_TERMS = [
    'united states',
    'california',
    'new york',
    'texas',
    'florida',
    'european union',
    'united kingdom',
] as const;
const AUTHORITY_PATTERN = /\b(?:agency|department|court|commission|bureau|office)\s+[a-z0-9]+\b/g;
const EXCLUSION_WORDS = /\b(?:ignore|ignores|ignored|excluding|excluded|regardless|irrespective|immaterial)\b/;

function normalizedWords(title: string): string[] {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9.%]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function tokens(title: string): Set<string> {
    return new Set(normalizedWords(title).filter((word) => !STOP_WORDS.has(word)));
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

function eventTypeCompatible(left: string, right: string): boolean {
    const groupsFor = (value: string): number[] => {
        const words = new Set(normalizedWords(value));
        return EVENT_TYPE_GROUPS.flatMap((group, index) => (group.some((term) => words.has(term)) ? [index] : []));
    };
    const leftGroups = groupsFor(left);
    const rightGroups = groupsFor(right);
    return (
        leftGroups.length === 0 || rightGroups.length === 0 || leftGroups.some((group) => rightGroups.includes(group))
    );
}

function subjectCompatible(left: string, right: string): boolean {
    const subject = (value: string): Set<string> =>
        new Set(
            normalizedWords(value).filter((word) => !SUBJECT_STOP_WORDS.has(word) && !/^\d+(?:\.\d+)?%?$/.test(word)),
        );
    const leftSubject = subject(left);
    const rightSubject = subject(right);
    if (leftSubject.size === 0 || rightSubject.size === 0) return true;
    const shared = [...leftSubject].filter((word) => rightSubject.has(word)).length;
    return shared / Math.min(leftSubject.size, rightSubject.size) >= 0.66;
}

function termIsExcluded(rules: string, term: string): boolean {
    let start = rules.indexOf(term);
    while (start >= 0) {
        const clauseStart = Math.max(rules.lastIndexOf(';', start), rules.lastIndexOf(',', start)) + 1;
        const semicolonEnd = rules.indexOf(';', start);
        const commaEnd = rules.indexOf(',', start);
        const ends = [semicolonEnd, commaEnd].filter((index) => index >= 0);
        const clauseEnd = ends.length > 0 ? Math.min(...ends) : rules.length;
        const prefix = rules.slice(clauseStart, start);
        const suffix = rules.slice(start + term.length, clauseEnd);
        if (
            EXCLUSION_WORDS.test(prefix) ||
            /\b(?:excluded|insufficient|not sufficient|does not qualify|will not qualify|immaterial)\b/.test(suffix)
        )
            return true;
        start = rules.indexOf(term, start + term.length);
    }
    return false;
}

function operativeTerms(rules: string, terms: readonly string[]): string[] {
    return terms.filter((term) => rules.includes(term) && !termIsExcluded(rules, term));
}

function sameConstraint(left: string[], right: string[]): boolean {
    return left.length === 0 || right.length === 0 || left.some((term) => right.includes(term));
}

function directedNumericConstraints(rules: string): { constraints: string[]; complete: boolean } {
    const constraints: string[] = [];
    const consumed: [number, number][] = [];
    const overlaps = (start: number, end: number): boolean =>
        consumed.some(([usedStart, usedEnd]) => start < usedEnd && end > usedStart);
    const add = (pattern: RegExp, normalize: (match: RegExpMatchArray) => string): void => {
        for (const match of rules.matchAll(pattern)) {
            const start = match.index ?? 0;
            const end = start + match[0].length;
            if (overlaps(start, end)) continue;
            constraints.push(normalize(match));
            consumed.push([start, end]);
        }
    };
    add(/\bnot equal to\b[^0-9]{0,20}(\d+(?:\.\d+)?%?)/g, (m) => `neq:${m[1]}`);
    add(/\b(greater than or equal to|no less than|at least)\b[^0-9]{0,20}(\d+(?:\.\d+)?%?)/g, (m) => `gte:${m[2]}`);
    add(/\b(less than or equal to|no more than|at most)\b[^0-9]{0,20}(\d+(?:\.\d+)?%?)/g, (m) => `lte:${m[2]}`);
    add(/\bon or before\b[^0-9]{0,20}(\d+(?:\.\d+)?%?)/g, (m) => `before-eq:${m[1]}`);
    add(/\bon or after\b[^0-9]{0,20}(\d+(?:\.\d+)?%?)/g, (m) => `after-eq:${m[1]}`);
    add(/\b(equal to|equals|exactly)\b[^0-9]{0,20}(\d+(?:\.\d+)?%?)/g, (m) => `eq:${m[2]}`);
    add(/(\d+(?:\.\d+)?%?)\s+or\s+(above|over|greater)\b/g, (m) => `gte:${m[1]}`);
    add(/(\d+(?:\.\d+)?%?)\s+or\s+(below|under|less)\b/g, (m) => `lte:${m[1]}`);
    add(/(\d+(?:\.\d+)?%?)\s+or\s+before\b/g, (m) => `before-eq:${m[1]}`);
    add(/(\d+(?:\.\d+)?%?)\s+or\s+after\b/g, (m) => `after-eq:${m[1]}`);
    const symbolicAliases: Record<string, string> = {
        '>=': 'gte',
        '<=': 'lte',
        '!=': 'neq',
        '==': 'eq',
        '>': 'gt',
        '<': 'lt',
        '=': 'eq',
    };
    add(/(>=|<=|!=|==|>|<|=)\s*(\d+(?:\.\d+)?%?)/g, (m) => `${symbolicAliases[m[1] as string]}:${m[2]}`);
    const strictAliases: Record<string, string> = {
        above: 'gt',
        over: 'gt',
        'more than': 'gt',
        'greater than': 'gt',
        exceeds: 'gt',
        exceed: 'gt',
        below: 'lt',
        under: 'lt',
        'less than': 'lt',
        'fewer than': 'lt',
        before: 'before',
        after: 'after',
    };
    add(
        /\b(above|over|more than|greater than|exceeds|exceed|below|under|less than|fewer than|before|after)\b[^0-9]{0,20}(\d+(?:\.\d+)?%?)/g,
        (m) => `${strictAliases[m[1] as string]}:${m[2]}`,
    );
    const masked = [...rules];
    for (const [start, end] of consumed) for (let index = start; index < end; index += 1) masked[index] = ' ';
    const remainder = masked.join('');
    const unparsedComparator =
        /(?:\b(?:above|over|greater|exceeds|exceed|below|under|less|fewer|before|after|equal|equals|exactly|least|most|more)\b[^0-9]{0,20}\d|\d[^a-z]{0,20}\b(?:above|over|greater|below|under|less|before|after)\b|(?:>=|<=|!=|==|>|<|=)\s*\d)/;
    return { constraints: [...new Set(constraints)].sort(), complete: !unparsedComparator.test(remainder) };
}

function settlementCompatible(left: Market, right: Market): boolean {
    const leftRules = left.resolutionRules.toLowerCase();
    const rightRules = right.resolutionRules.toLowerCase();
    if (!leftRules || !rightRules) return false;
    const primaryGroups = (rules: string): number[] =>
        SETTLEMENT_CONFLICT_GROUPS.flatMap((group, index) => {
            const mentioned = group.some((term) => rules.includes(term));
            const isExcluded = group.some((term) => rules.includes(term) && termIsExcluded(rules, term));
            return mentioned && !isExcluded ? [index] : [];
        });
    const leftGroups = primaryGroups(leftRules);
    const rightGroups = primaryGroups(rightRules);
    if (leftGroups.length > 0 && rightGroups.length > 0 && !leftGroups.some((group) => rightGroups.includes(group)))
        return false;
    const finalityGroups = (rules: string): number[] =>
        FINALITY_GROUPS.flatMap((group, index) => (operativeTerms(rules, group).length > 0 ? [index] : []));
    const leftFinality = finalityGroups(leftRules);
    const rightFinality = finalityGroups(rightRules);
    if (
        leftFinality.length > 0 &&
        rightFinality.length > 0 &&
        !leftFinality.some((group) => rightFinality.includes(group))
    )
        return false;
    const authorities = (rules: string): string[] =>
        (rules.match(AUTHORITY_PATTERN) ?? []).filter((authority) => !termIsExcluded(rules, authority));
    const leftAuthorities = authorities(leftRules);
    const rightAuthorities = authorities(rightRules);
    if (
        leftAuthorities.length > 0 &&
        rightAuthorities.length > 0 &&
        !leftAuthorities.some((authority) => rightAuthorities.includes(authority))
    )
        return false;
    const leftSources = operativeTerms(leftRules, SOURCE_TERMS);
    const rightSources = operativeTerms(rightRules, SOURCE_TERMS);
    if (!sameConstraint(leftSources, rightSources)) return false;
    const leftGeography = operativeTerms(leftRules, GEOGRAPHY_TERMS);
    const rightGeography = operativeTerms(rightRules, GEOGRAPHY_TERMS);
    if (!sameConstraint(leftGeography, rightGeography)) return false;
    const leftDirectedNumbers = directedNumericConstraints(leftRules);
    const rightDirectedNumbers = directedNumericConstraints(rightRules);
    if (!leftDirectedNumbers.complete || !rightDirectedNumbers.complete) return false;
    if (leftDirectedNumbers.constraints.join('|') !== rightDirectedNumbers.constraints.join('|')) return false;
    if ([...numericTerms(leftRules)].sort().join('|') !== [...numericTerms(rightRules)].sort().join('|')) return false;
    return similarity(leftRules, rightRules) >= 0.2;
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
            if (!eventTypeCompatible(a.title, b.title)) continue;
            if (!subjectCompatible(a.title, b.title)) continue;
            if (!settlementCompatible(a, b)) continue;
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
                    'event-type-compatible',
                    'subject-compatible',
                    'resolution-rules-compatible',
                    'close-times-compatible',
                ],
            });
        }
    return matches.sort((a, b) => b.similarity - a.similarity);
}
