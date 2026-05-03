import { z } from 'zod';

export const PANELIST_ROLES = ['designer', 'critic', 'brand', 'a11y', 'copy'] as const;
export type PanelistRole = typeof PANELIST_ROLES[number];

export const FALLBACK_POLICIES = ['ship_best', 'ship_last', 'fail'] as const;
export type FallbackPolicy = typeof FALLBACK_POLICIES[number];

export const CRITIQUE_PROTOCOL_VERSION = 1;

export const RoleWeights = z.object({
  designer: z.number().min(0).max(1),
  critic: z.number().min(0).max(1),
  brand: z.number().min(0).max(1),
  a11y: z.number().min(0).max(1),
  copy: z.number().min(0).max(1),
});
export type RoleWeights = z.infer<typeof RoleWeights>;

export const CritiqueConfigSchema = z.object({
  enabled: z.boolean(),
  cast: z.array(z.enum(PANELIST_ROLES)).min(1),
  maxRounds: z.number().int().min(1).max(10),
  scoreScale: z.number().int().min(1).max(100),
  scoreThreshold: z.number().min(0).max(100)
    .describe('Must be <= scoreScale; enforced by cross-field refine'),
  weights: RoleWeights,
  perRoundTimeoutMs: z.number().int().min(1000),
  totalTimeoutMs: z.number().int().min(1000),
  parserMaxBlockBytes: z.number().int().min(1024),
  fallbackPolicy: z.enum(FALLBACK_POLICIES),
  protocolVersion: z.number().int().min(1),
  maxConcurrentRuns: z.number().int().min(1),
}).refine(
  (cfg) => cfg.scoreThreshold <= cfg.scoreScale,
  { message: 'scoreThreshold must be <= scoreScale' },
);

export type CritiqueConfig = z.infer<typeof CritiqueConfigSchema>;

export function defaultCritiqueConfig(): CritiqueConfig {
  return {
    enabled: false,
    cast: [...PANELIST_ROLES],
    maxRounds: 3,
    scoreScale: 10,
    scoreThreshold: 8.0,
    weights: { designer: 0, critic: 0.4, brand: 0.2, a11y: 0.2, copy: 0.2 },
    perRoundTimeoutMs: 90_000,
    totalTimeoutMs: 240_000,
    parserMaxBlockBytes: 262_144,
    fallbackPolicy: 'ship_best',
    protocolVersion: CRITIQUE_PROTOCOL_VERSION,
    // Contracts layer cannot call os.cpus(); daemon env layer overrides via OD_CRITIQUE_MAX_CONCURRENT_RUNS.
    maxConcurrentRuns: 4,
  };
}
