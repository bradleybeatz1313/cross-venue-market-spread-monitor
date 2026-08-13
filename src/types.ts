export type Venue = 'polymarket' | 'kalshi';

export interface Level {
    price: number;
    size: number;
}
export interface OrderBook {
    asks: Level[];
    bids: Level[];
}

export interface Market {
    venue: Venue;
    id: string;
    title: string;
    canonicalUrl: string;
    closeTime: string;
    resolutionRules: string;
    yesBook: OrderBook;
    noBook: OrderBook;
    observedAt: string;
}

export interface MatchedPair {
    left: Market;
    right: Market;
    similarity: number;
    reasons: string[];
}

export interface AuthorizationInput {
    polymarketPublicApiApproved: boolean;
    kalshiDeveloperAgreementReviewed: boolean;
    commercialRedistributionApproved: boolean;
    termsReviewedOn: string;
}

export interface ActorInput {
    mode: 'fixtures' | 'live';
    stakeUsd: number;
    maxResults: number;
    minSimilarity: number;
    maxCloseHours: number;
    minNetReturnPct: number;
    feeRatePct: number;
    slippageBufferPct: number;
    authorization?: AuthorizationInput;
}

export interface CandidateSpread {
    classification: 'candidate-spread';
    direction: string;
    leftMarketId: string;
    leftMarketTitle: string;
    leftMarketUrl: string;
    rightMarketId: string;
    rightMarketTitle: string;
    rightMarketUrl: string;
    similarity: number;
    matchReasons: string[];
    fillableContracts: number;
    grossCostUsd: number;
    estimatedFeesUsd: number;
    safetyBufferUsd: number;
    netProfitUsd: number;
    netReturnPct: number;
    sourceObservedAt: string;
    leftResolutionRules: string;
    rightResolutionRules: string;
    riskFlags: string[];
}
