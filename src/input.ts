import { z } from 'zod';

import type { ActorInput } from './types.js';

const authorizationSchema = z
    .object({
        polymarketPublicApiApproved: z.boolean(),
        kalshiDeveloperAgreementReviewed: z.boolean(),
        commercialRedistributionApproved: z.boolean(),
        termsReviewedOn: z.string(),
    })
    .strict();

const inputSchema = z
    .object({
        mode: z.enum(['fixtures', 'live']).default('live'),
        stakeUsd: z.number().positive().max(100_000).default(100),
        maxResults: z.number().int().positive().max(1000).default(100),
        minSimilarity: z.number().min(0.2).max(1).default(0.55),
        maxCloseHours: z.number().positive().max(720).default(72),
        minNetReturnPct: z.number().min(-100).max(1000).default(0),
        feeRatePct: z.number().min(0).max(20).default(1),
        slippageBufferPct: z.number().min(0).max(20).default(0.5),
        maxMarketsPerVenue: z.number().int().positive().max(10_000).default(3000),
        maxSourcePages: z.number().int().positive().max(30).default(30),
        maxBookPairs: z.number().int().positive().max(250).default(100),
        authorization: authorizationSchema
            .default({
                polymarketPublicApiApproved: true,
                kalshiDeveloperAgreementReviewed: true,
                commercialRedistributionApproved: true,
                termsReviewedOn: '2026-08-13',
            })
            .optional(),
    })
    .strict()
    .superRefine((value, context) => {
        const approved =
            value.authorization?.polymarketPublicApiApproved === true &&
            value.authorization.kalshiDeveloperAgreementReviewed === true &&
            value.authorization.commercialRedistributionApproved === true &&
            z.iso.date().safeParse(value.authorization.termsReviewedOn).success;
        if (value.mode === 'live' && !approved) {
            context.addIssue({
                code: 'custom',
                path: ['authorization'],
                message: 'Live mode requires explicit current source authorization attestations.',
            });
        }
    });

export function parseInput(value: unknown): ActorInput {
    return inputSchema.parse(value);
}
