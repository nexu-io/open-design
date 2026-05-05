import { z } from 'zod';
/**
 * Local mirror of SseTransportEvent from './sse/common'. Re-defining the
 * three-field interface avoids a cross-file relative import inside this leaf
 * module: the daemon walks this file via the './critique' subpath export
 * under NodeNext (which requires explicit '.js' extensions), while the web
 * Turbopack build refuses to rewrite '.js' to '.ts' on the same source.
 * Keeping the type local makes the file self-contained for both consumers.
 */
interface SseTransportEvent<Name extends string, Payload> {
    id?: string;
    event: Name;
    data: Payload;
}
export declare const PANELIST_ROLES: readonly ["designer", "critic", "brand", "a11y", "copy"];
export type PanelistRole = typeof PANELIST_ROLES[number];
export declare const FALLBACK_POLICIES: readonly ["ship_best", "ship_last", "fail"];
export type FallbackPolicy = typeof FALLBACK_POLICIES[number];
export declare const CRITIQUE_PROTOCOL_VERSION = 1;
export declare const RoleWeights: z.ZodObject<{
    designer: z.ZodNumber;
    critic: z.ZodNumber;
    brand: z.ZodNumber;
    a11y: z.ZodNumber;
    copy: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    designer: number;
    critic: number;
    brand: number;
    a11y: number;
    copy: number;
}, {
    designer: number;
    critic: number;
    brand: number;
    a11y: number;
    copy: number;
}>;
export type RoleWeights = z.infer<typeof RoleWeights>;
export declare const CritiqueConfigSchema: z.ZodEffects<z.ZodObject<{
    enabled: z.ZodBoolean;
    cast: z.ZodArray<z.ZodEnum<["designer", "critic", "brand", "a11y", "copy"]>, "many">;
    maxRounds: z.ZodNumber;
    scoreScale: z.ZodNumber;
    scoreThreshold: z.ZodNumber;
    weights: z.ZodObject<{
        designer: z.ZodNumber;
        critic: z.ZodNumber;
        brand: z.ZodNumber;
        a11y: z.ZodNumber;
        copy: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        designer: number;
        critic: number;
        brand: number;
        a11y: number;
        copy: number;
    }, {
        designer: number;
        critic: number;
        brand: number;
        a11y: number;
        copy: number;
    }>;
    perRoundTimeoutMs: z.ZodNumber;
    totalTimeoutMs: z.ZodNumber;
    parserMaxBlockBytes: z.ZodNumber;
    fallbackPolicy: z.ZodEnum<["ship_best", "ship_last", "fail"]>;
    protocolVersion: z.ZodNumber;
    maxConcurrentRuns: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    cast: ("designer" | "critic" | "brand" | "a11y" | "copy")[];
    maxRounds: number;
    scoreScale: number;
    scoreThreshold: number;
    weights: {
        designer: number;
        critic: number;
        brand: number;
        a11y: number;
        copy: number;
    };
    perRoundTimeoutMs: number;
    totalTimeoutMs: number;
    parserMaxBlockBytes: number;
    fallbackPolicy: "ship_best" | "ship_last" | "fail";
    protocolVersion: number;
    maxConcurrentRuns: number;
}, {
    enabled: boolean;
    cast: ("designer" | "critic" | "brand" | "a11y" | "copy")[];
    maxRounds: number;
    scoreScale: number;
    scoreThreshold: number;
    weights: {
        designer: number;
        critic: number;
        brand: number;
        a11y: number;
        copy: number;
    };
    perRoundTimeoutMs: number;
    totalTimeoutMs: number;
    parserMaxBlockBytes: number;
    fallbackPolicy: "ship_best" | "ship_last" | "fail";
    protocolVersion: number;
    maxConcurrentRuns: number;
}>, {
    enabled: boolean;
    cast: ("designer" | "critic" | "brand" | "a11y" | "copy")[];
    maxRounds: number;
    scoreScale: number;
    scoreThreshold: number;
    weights: {
        designer: number;
        critic: number;
        brand: number;
        a11y: number;
        copy: number;
    };
    perRoundTimeoutMs: number;
    totalTimeoutMs: number;
    parserMaxBlockBytes: number;
    fallbackPolicy: "ship_best" | "ship_last" | "fail";
    protocolVersion: number;
    maxConcurrentRuns: number;
}, {
    enabled: boolean;
    cast: ("designer" | "critic" | "brand" | "a11y" | "copy")[];
    maxRounds: number;
    scoreScale: number;
    scoreThreshold: number;
    weights: {
        designer: number;
        critic: number;
        brand: number;
        a11y: number;
        copy: number;
    };
    perRoundTimeoutMs: number;
    totalTimeoutMs: number;
    parserMaxBlockBytes: number;
    fallbackPolicy: "ship_best" | "ship_last" | "fail";
    protocolVersion: number;
    maxConcurrentRuns: number;
}>;
export type CritiqueConfig = z.infer<typeof CritiqueConfigSchema>;
export declare function defaultCritiqueConfig(): CritiqueConfig;
export type DegradedReason = 'malformed_block' | 'oversize_block' | 'adapter_unsupported' | 'protocol_version_mismatch' | 'missing_artifact';
export type FailedCause = 'cli_exit_nonzero' | 'per_round_timeout' | 'total_timeout' | 'orchestrator_internal';
export type ParserWarningKind = 'weak_debate' | 'unknown_role' | 'score_clamped' | 'composite_mismatch' | 'duplicate_ship';
export type RoundDecision = 'continue' | 'ship';
export type ShipStatus = 'shipped' | 'below_threshold' | 'timed_out' | 'interrupted';
export type PanelEvent = {
    type: 'run_started';
    runId: string;
    protocolVersion: number;
    cast: PanelistRole[];
    maxRounds: number;
    threshold: number;
    scale: number;
} | {
    type: 'panelist_open';
    runId: string;
    round: number;
    role: PanelistRole;
} | {
    type: 'panelist_dim';
    runId: string;
    round: number;
    role: PanelistRole;
    dimName: string;
    dimScore: number;
    dimNote: string;
} | {
    type: 'panelist_must_fix';
    runId: string;
    round: number;
    role: PanelistRole;
    text: string;
} | {
    type: 'panelist_close';
    runId: string;
    round: number;
    role: PanelistRole;
    score: number;
} | {
    type: 'round_end';
    runId: string;
    round: number;
    composite: number;
    mustFix: number;
    decision: RoundDecision;
    reason: string;
} | {
    type: 'ship';
    runId: string;
    round: number;
    composite: number;
    status: ShipStatus;
    artifactRef: {
        projectId: string;
        artifactId: string;
    };
    summary: string;
} | {
    type: 'degraded';
    runId: string;
    reason: DegradedReason;
    adapter: string;
} | {
    type: 'interrupted';
    runId: string;
    bestRound: number;
    composite: number;
} | {
    type: 'failed';
    runId: string;
    cause: FailedCause;
} | {
    type: 'parser_warning';
    runId: string;
    kind: ParserWarningKind;
    position: number;
};
export declare function isPanelEvent(value: unknown): value is PanelEvent;
type PayloadOf<T extends PanelEvent['type']> = Omit<Extract<PanelEvent, {
    type: T;
}>, 'type'>;
export type CritiqueSseEvent = SseTransportEvent<'critique.run_started', PayloadOf<'run_started'>> | SseTransportEvent<'critique.panelist_open', PayloadOf<'panelist_open'>> | SseTransportEvent<'critique.panelist_dim', PayloadOf<'panelist_dim'>> | SseTransportEvent<'critique.panelist_must_fix', PayloadOf<'panelist_must_fix'>> | SseTransportEvent<'critique.panelist_close', PayloadOf<'panelist_close'>> | SseTransportEvent<'critique.round_end', PayloadOf<'round_end'>> | SseTransportEvent<'critique.ship', PayloadOf<'ship'>> | SseTransportEvent<'critique.degraded', PayloadOf<'degraded'>> | SseTransportEvent<'critique.interrupted', PayloadOf<'interrupted'>> | SseTransportEvent<'critique.failed', PayloadOf<'failed'>> | SseTransportEvent<'critique.parser_warning', PayloadOf<'parser_warning'>>;
export declare const CRITIQUE_SSE_EVENT_NAMES: readonly ["critique.run_started", "critique.panelist_open", "critique.panelist_dim", "critique.panelist_must_fix", "critique.panelist_close", "critique.round_end", "critique.ship", "critique.degraded", "critique.interrupted", "critique.failed", "critique.parser_warning"];
export type CritiqueSseEventName = typeof CRITIQUE_SSE_EVENT_NAMES[number];
export declare function panelEventToSse(e: PanelEvent): CritiqueSseEvent;
export {};
//# sourceMappingURL=critique.d.ts.map