import { z } from "zod";

/** A request for trusted server checks, never a client-authored pass verdict. */
export const touchpointTestAutomatedReportSchema = z.object({
  version: z.literal(1),
  reportId: z.string().uuid(),
  snapshotHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  placementKey: z.enum(['opend.home.account-badge', 'opend.home.campaign-modal', 'opend.home.hover-entry', 'opend.home.hover-layer', 'vela.web.console-overlay']),
  locale: z.string().min(2).max(35),
  contextToken: z.string().min(1).max(256),
  acceptanceId: z.string().min(1).max(128),
  hostRelease: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  observations: z.array(z.object({ kind: z.enum(['missing_translation', 'overflow', 'runtime_error']) }).strict()).max(3),
}).strict();
export type TouchpointTestAutomatedReport = z.infer<typeof touchpointTestAutomatedReportSchema>;
export const TOUCHPOINT_TEST_AUTOMATED_REPORT_BODY_LIMIT = 8192;

export const TOUCHPOINT_TEST_BEHAVIOR_BODY_LIMIT = 4096;
/** Identity is a server digest, never a bearer credential or a browser mint. */
export const touchpointTestContextIdentitySchema = z
  .object({
    contextId: z.string().regex(/^ctx-v1:[a-f0-9]{64}$/),
    generation: z.string().regex(/^[1-9]\d{0,9}$/),
    contextToken: z.string().regex(/^ctx-token-v1:[a-f0-9]{64}$/),
  })
  .strict();
export type TouchpointTestContextIdentity = z.infer<
  typeof touchpointTestContextIdentitySchema
>;

const fields = {
  contractVersion: z.literal(1),
  eventId: z.string().uuid(),
  loadAttemptId: z.string().uuid(),
  deploymentId: z.string().min(1).max(128),
  placementKey: z.enum([
    "opend.home.campaign-modal",
    "opend.home.account-badge",
    "opend.home.hover-entry",
    "opend.home.hover-layer",
    "vela.web.console-overlay",
  ]),
  locale: z
    .string()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/),
  ...touchpointTestContextIdentitySchema.shape,
  surface: z.enum(["placement", "entry", "layer"]),
};
/** Version of the content-button click that carries {@link TouchpointTestBehaviorButton}. */
export const TOUCHPOINT_TEST_BEHAVIOR_CTA_CONTRACT_VERSION = 2 as const;

/**
 * The registered static action a content-button click resolved to.
 * `role` comes only from a verified material role binding; `null` states the
 * role is unknown (legacy/ZIP content) instead of defaulting to primary.
 * Template and material identity are the verified V3 provenance, all three
 * present or all three `null`. `targetUrl` is the static HTTPS URL or internal
 * path the action navigates to; host-resolved targets have none.
 */
export const touchpointTestBehaviorButtonSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    role: z.enum(["primary", "secondary"]).nullable(),
    targetKind: z.enum(["https", "internal", "console_pricing", "vela_personal_subscription"]),
    targetUrl: z.string().min(1).max(2048).nullable(),
    templateId: z.string().min(1).max(128).nullable(),
    templateVersion: z.number().int().positive().nullable(),
    materialVersionId: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((button, ctx) => {
    const linked = button.targetKind === "https" || button.targetKind === "internal";
    if (linked !== (button.targetUrl !== null))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetUrl"], message: "target URL must match target kind" });
    const provenance = [button.templateId, button.templateVersion, button.materialVersionId].filter((v) => v !== null).length;
    if (provenance !== 0 && provenance !== 3)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["templateId"], message: "template and material identity are all-or-none" });
  });
export type TouchpointTestBehaviorButton = z.infer<typeof touchpointTestBehaviorButtonSchema>;

/** The element a content-button click is recorded as, derived only from its verified role. */
export function touchpointTestCtaElement(
  role: TouchpointTestBehaviorButton["role"],
): "primary_cta" | "secondary_cta" | "unclassified_cta" {
  return role === "primary" ? "primary_cta" : role === "secondary" ? "secondary_cta" : "unclassified_cta";
}

/**
 * Strict v1 exposure/close/legacy-primary events plus the v2 content-button
 * click. Actor, environment, clock, lease and content authority are absent.
 */
export const touchpointTestBehaviorEventSchema = z
  .union([
    z.object({ ...fields, kind: z.literal("exposure") }).strict(),
    z
      .object({
        ...fields,
        kind: z.literal("click"),
        element: z.enum(["primary_cta", "close", "secondary_close"]),
      })
      .strict(),
    z
      .object({
        ...fields,
        contractVersion: z.literal(TOUCHPOINT_TEST_BEHAVIOR_CTA_CONTRACT_VERSION),
        kind: z.literal("click"),
        element: z.enum(["primary_cta", "secondary_cta", "unclassified_cta"]),
        button: touchpointTestBehaviorButtonSchema,
      })
      .strict(),
  ])
  .superRefine((event, ctx) => {
    // A content-button element is a function of the verified role, never a default.
    if ("button" in event && event.element !== touchpointTestCtaElement(event.button.role))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["element"], message: "element must match button role" });
    const surfaces = {
      "opend.home.campaign-modal": ["placement"],
      "opend.home.account-badge": ["placement"],
      "opend.home.hover-entry": ["entry"],
      "opend.home.hover-layer": ["layer"],
      "vela.web.console-overlay": ["entry", "layer"],
    };
    if (
      !surfaces[event.placementKey].includes(event.surface) ||
      (event.kind === "click" && event.surface === "entry")
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["surface"],
        message: "invalid behavior surface",
      });
    // Badge/entry are surface-only. OD hover-layer accepts its content buttons
    // and explicit close X; secondary close belongs only to modal/Vela layer.
    if (event.kind === "click" && (
      event.placementKey === "opend.home.account-badge" ||
      event.placementKey === "opend.home.hover-entry" ||
      (event.placementKey === "opend.home.hover-layer" && event.element === "secondary_close")
    )) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["element"], message: "click outside frozen behavior catalog" });
  });
export type TouchpointTestBehaviorEvent = z.infer<
  typeof touchpointTestBehaviorEventSchema
>;
export type TouchpointTestBehaviorCtaEvent = Extract<TouchpointTestBehaviorEvent, { button: TouchpointTestBehaviorButton }>;

/**
 * The strict-v1 projection a server without the v2 click can store. Only a
 * verified primary button has one; a secondary or unclassified click has no
 * truthful v1 form, because v1 can only say `primary_cta`.
 */
export function legacyTouchpointTestBehaviorClick(
  event: TouchpointTestBehaviorCtaEvent,
): TouchpointTestBehaviorEvent | null {
  if (event.button.role !== "primary") return null;
  const { button: _button, contractVersion: _version, element: _element, ...rest } = event;
  return { ...rest, contractVersion: 1, kind: "click", element: "primary_cta" };
}

/** The only scenario accepted by the test touchpoint runtime. */
export type TestRuntimeScenario = 'realtime';

/**
 * One bounded page of GET /api/touchpoints/test-runtime/deployments.
 * Follow the opaque cursor until null before treating the catalog as complete.
 * Legacy servers omit nextCursor: their single page has unknown completeness.
 * Catalog metadata never grants runtime display authority.
 */
export interface TestRuntimeDeploymentCatalogPage<Deployment = unknown> {
  deployments: Deployment[];
  nextCursor?: string | null;
}

/** Server-computed placement of the current time in a test deployment window. */
export type TestRuntimeScheduleState = 'before' | 'active' | 'ended';

/** Body for POST /api/touchpoints/test-runtime/context. */
export interface TestRuntimeContextRequest {
  deploymentId: string;
  scenario: TestRuntimeScenario;
}

/** Server-issued immutable identity; the token is an identity, never a credential. */
export interface TestRuntimeContextIdentity {
  /** Stable versioned deployment/authenticated tester/realtime identity. */
  contextId: string;
  /** Decimal immutable deployment activityRevision, never a timestamp or client counter. */
  generation: string;
  /** Versioned digest binding the identity and complete immutable snapshot facts. */
  contextToken: string;
}

/**
 * Context acquired from the server. All three identity fields negotiate immutable
 * mode; their absence negotiates legacy updatedAt matching. Partial bundles are
 * invalid. updatedAt remains on both wires for old clients, not immutable identity.
 */
export type TestRuntimeContext = TestRuntimeContextRequest & { updatedAt: string; /** Authenticated application user, distinct from workspace member. */ testerAppUserId?: string } & (
  | (TestRuntimeContextIdentity & { testerMemberId: string })
  | { testerMemberId?: string; contextId?: never; generation?: never; contextToken?: never }
);

/** Additive GET runtime/test query. Old clients may omit the identity token. */
export interface TestRuntimeQuery {
  deploymentId: string;
  placementKey: string;
  locale: string;
  contextToken?: string;
}

/**
 * HTTP 409 after authentication, availability and withdrawal checks. Metadata
 * is scoped to the authenticated tester and current deployment; it grants no
 * display authority. Reacquire through POST context before requesting decisions.
 */
export interface TestRuntimeContextMismatch {
  error: 'test_context_mismatch';
  reason: 'context_token_mismatch';
  testContext: TestRuntimeContextRequest & { updatedAt: string; testerMemberId: string; testerAppUserId?: string } & TestRuntimeContextIdentity;
}

/** Server-authoritative clock and deployment-window bounds, serialized as ISO-8601 strings. */
export interface TestRuntimeTiming {
  serverTime: string;
  startsAt: string;
  endsAt: string;
  authorizationExpiresAt: string;
}

/**
 * A test-runtime decision. Content and action shapes remain owned by their
 * consuming UI component; this contract owns the exact shared wire fields.
 */
export interface TestRuntimeDecision<Content = unknown, StaticActions = unknown>
  extends TestRuntimeTiming {
  deploymentId: string;
  activityId?: string;
  snapshotHash?: string;
  artifactHash?: string;
  manifestHash?: string;
  placementKey: string;
  requiredCapabilities: string[];
  content: Content;
  staticActions: StaticActions;
  testContext: TestRuntimeContext & {
    scheduleState: TestRuntimeScheduleState;
  };
}

/** Body for POST test-deployments/:deploymentId/acceptances. */
export interface TestRuntimeAcceptanceRequest {
  placementKey: string;
  hostVersion: string;
  locale: string;
  scenario: TestRuntimeScenario;
  evidence: string;
}
