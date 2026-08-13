import { describe, expect, it } from 'vitest';

import { runAnalysis } from '../src/pipeline.js';

describe('fixture pipeline', () => {
    it('produces deterministic provenance-bearing candidate spreads and a summary', async () => {
        const result = await runAnalysis({ mode: 'fixtures', stakeUsd: 100, maxResults: 10 });
        expect(result.summary.mode).toBe('fixtures');
        expect(result.summary.sourceRequests).toBe(0);
        expect(result.records.length).toBeGreaterThan(0);
        expect(result.records[0]?.sourceObservedAt).toMatch(/^2026-/);
        expect(result.records[0]?.leftMarketUrl).toMatch(/^https:\/\//);
    });
});
