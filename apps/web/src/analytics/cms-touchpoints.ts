import type { AmrEntryAttribution, CmsTouchpointActionFacts, CmsTouchpointContext, CmsTouchpointPlacement, CmsTouchpointSurfaceViewProps, CmsTouchpointClickProps } from '@open-design/contracts/analytics';
import {
  materialProvenanceSchema,
  TouchpointComponentV2ManifestSchema,
  type TouchpointComponentV2Manifest,
  type MaterialActionRoles,
  type TouchpointCloseReason,
} from '@open-design/contracts';
import {
  verifyWebTouchpoint,
  type WebTouchpointContent,
} from '../components/touchpoint-component';
import type { TouchpointTestBehaviorButton } from '@open-design/contracts/api/touchpointTestRuntime';
import type { TouchpointLoadAttempt } from '../components/touchpoint-load-observability';
import { trackCmsTouchpointClick, trackCmsTouchpointSurfaceView, type Track } from './events';

const placements = new Set<CmsTouchpointPlacement>(['opend.home.campaign-modal', 'opend.home.account-badge', 'opend.home.hover-entry', 'opend.home.hover-layer']);
const contexts = new WeakMap<TouchpointLoadAttempt, CmsTouchpointContext>();
const actionContexts = new WeakMap<TouchpointLoadAttempt, Map<string, CmsTouchpointContext>>();
type Declaration =
  TouchpointComponentV2Manifest['placements'][number]['staticActions'][number];
type RoleReceipt = Readonly<{
  contentId: string;
  manifestHash: string;
  placement: string;
  bindings: readonly Readonly<MaterialActionRoles['bindings'][number]>[];
  declarations: readonly Readonly<Declaration>[];
}>;
const roles = new WeakMap<TouchpointLoadAttempt, RoleReceipt>();
const issuedCaptures = new WeakMap<CmsPrimaryCapture, TouchpointLoadAttempt>();
const actionRoles = new WeakMap<
  CmsPrimaryCapture,
  Readonly<{
    context: CmsTouchpointContext;
    action: Readonly<CmsTouchpointActionFacts>;
    role: 'primary' | 'secondary';
  }>
>();
const captured = new WeakMap<CmsTouchpointContext, Set<string>>();
export type CmsPrimaryCapture = Readonly<{ context: CmsTouchpointContext; eventId: string; action?: Readonly<CmsTouchpointActionFacts> }>;
export type CmsActionDecision = Readonly<{
  activityId?: string; deploymentId: string; placementKey: string;
  content: Readonly<{ id: string }>; touchpointDecisionId?: string;
}>;

type CmsContentDecision = CmsActionDecision &
  Readonly<{ content: WebTouchpointContent }>;
function matchesAttempt(
  attempt: TouchpointLoadAttempt,
  decision: CmsContentDecision,
): boolean {
  const facts = attempt.analyticsFacts;
  return (
    attempt.renewable &&
    facts.decision_outcome === 'eligible' &&
    facts.activity_id === decision.activityId &&
    facts.deployment_id === decision.deploymentId &&
    facts.content_version_id === decision.content.id &&
    facts.placement_key === decision.placementKey &&
    decision.content.placementKey === decision.placementKey
  );
}

// Only freeze our JSON clone. The caller remains mutable across verifier awaits.
function freezeVerificationInput<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeVerificationInput(child);
    Object.freeze(value);
  }
  return value;
}
function matchesVerificationInput(
  content: WebTouchpointContent,
  raw: string,
): boolean {
  try {
    return JSON.stringify(content) === raw;
  } catch {
    // A caller mutation cannot prevent disposal of the verified artifact.
    return false;
  }
}

/** Verification, not a provenance-shaped object, establishes the binding. The
 * caller's current fence and the real attempt must still agree after the await. */
export async function verifyCmsTouchpointContent(
  attempt: TouchpointLoadAttempt | undefined,
  decision: CmsContentDecision,
  isCurrent: () => boolean,
) {
  const rawContent = JSON.stringify(decision.content);
  const content = freezeVerificationInput(
    JSON.parse(rawContent) as WebTouchpointContent,
  );
  // Verify raw manifest ordering/hash, while issuing roles from its strict parse.
  const snapshot = TouchpointComponentV2ManifestSchema.safeParse(
    content.manifest,
  );
  const material = materialProvenanceSchema.safeParse(
    snapshot.success ? snapshot.data.material : undefined,
  );
  const contentId = content.id;
  const manifestHash = content.manifestHash;
  const placementKey = content.placementKey;
  const verified = await verifyWebTouchpoint(content);
  if (
    attempt &&
    isCurrent() &&
    matchesAttempt(attempt, decision) &&
    snapshot.success &&
    !contexts.has(attempt) &&
    matchesVerificationInput(decision.content, rawContent)
  ) {
    const base = cmsTouchpointContext(attempt);
    if (base) {
      contexts.set(
        attempt,
        Object.freeze({
          ...base,
          // A concurrent same-content credential renewal cannot rewrite B.
          decision_id:
            attempt.mode === 'production'
              ? (decision.touchpointDecisionId ?? base.decision_id)
              : null,
          ...(material.success && material.data.sourceDslVersion === 3
            ? {
                template_id: material.data.templateId,
                template_version: material.data.templateVersion,
                material_version_id: material.data.materialVersionId,
              }
            : {}),
        }),
      );
      const selected = snapshot.data.placements.find(
        (p) => p.key === placementKey,
      );
      const bindings = snapshot.data.roleBindings?.bindings.filter(
        (b) => b.placementKey === placementKey,
      );
      if (selected && bindings?.length) {
        const declarations = selected.staticActions.map((declaration) =>
          Object.freeze({
            ...declaration,
            target: Object.freeze({ ...declaration.target }),
          }),
        );
        roles.set(
          attempt,
          Object.freeze({
            contentId,
            manifestHash,
            placement: placementKey,
            bindings: Object.freeze(
              bindings.map((binding) => Object.freeze({ ...binding })),
            ),
            declarations: Object.freeze(declarations),
          }),
        );
      }
    }
  }
  return verified;
}

/** Hosts whose mount verifier is private prepare only new canonical V3
 * attempts. Held DOM renewals never read or verify replacement metadata.
 * The mount retains its own verification and authorization boundary. */
export async function prepareCmsTouchpointContent(
  attempt: TouchpointLoadAttempt | undefined,
  decision: CmsContentDecision,
  isCurrent: () => boolean,
): Promise<void> {
  if (
    !attempt ||
    contexts.has(attempt) ||
    !isCurrent() ||
    !matchesAttempt(attempt, decision)
  )
    return;
  const material = materialProvenanceSchema.safeParse(
    decision.content.manifest.material,
  );
  if (!material.success || material.data.sourceDslVersion !== 3) return;
  try {
    const verified = await verifyCmsTouchpointContent(
      attempt,
      decision,
      isCurrent,
    );
    verified.dispose();
  } catch {
    /* Optional analytics cannot alter the host's mount or authority. */
  }
}

/** Bind only to a real runtime owner's eligible placement; preview has no owner. */
export function cmsTouchpointContext(attempt: TouchpointLoadAttempt | undefined): CmsTouchpointContext | null {
  if (!attempt) return null;
  const existing = contexts.get(attempt);
  if (existing) return existing;
  const facts = attempt.analyticsFacts;
  if (facts.host_product !== 'opend' || facts.host_family !== 'open-design-desktop' || facts.decision_outcome !== 'eligible' || !facts.activity_id || !facts.deployment_id || !facts.content_version_id || !placements.has(facts.placement_key as CmsTouchpointPlacement)) return null;
  const context: CmsTouchpointContext = Object.freeze({
    host_product: facts.host_product, host_family: facts.host_family, mode: attempt.mode,
    placement_key: facts.placement_key as CmsTouchpointPlacement,
    activity_id: facts.activity_id, deployment_id: facts.deployment_id, content_version_id: facts.content_version_id,
    load_attempt_id: facts.load_attempt_id, decision_id: facts.decision_id, locale: facts.locale,
  });
  contexts.set(attempt, context);
  return context;
}
/** The action credential is the one passed to dispatch, which may deliberately be older than the owner's latest grant. */
export function cmsPrimaryCapture(
  attempt: TouchpointLoadAttempt | undefined,
  decision?: CmsActionDecision,
): CmsPrimaryCapture | undefined {
  const context = cmsTouchpointContext(attempt);
  if (!context || !attempt) return undefined;
  if (
    decision &&
    (decision.activityId !== context.activity_id ||
      decision.deploymentId !== context.deployment_id ||
      decision.content.id !== context.content_version_id ||
      decision.placementKey !== context.placement_key)
  )
    return undefined;
  const issue = (context: CmsTouchpointContext) => {
    const capture = Object.freeze({ context, eventId: crypto.randomUUID() });
    issuedCaptures.set(capture, attempt);
    return capture;
  };
  if (context.mode === 'test') return issue(context);
  // Entry/badge have no canonical primary; keep their existing callers compatible.
  if (
    !decision &&
    (context.placement_key === 'opend.home.account-badge' ||
      context.placement_key === 'opend.home.hover-entry')
  )
    return issue(context);
  const credential = decision?.touchpointDecisionId;
  if (typeof credential !== 'string' || !credential.trim()) return undefined;
  let byCredential = actionContexts.get(attempt);
  if (!byCredential) {
    byCredential = new Map();
    actionContexts.set(attempt, byCredential);
  }
  let actionContext = byCredential.get(credential);
  if (!actionContext) {
    // Stable identities preserve both canonical click and AMR retry deduplication.
    // Never update the first-visible B context held in `contexts`.
    actionContext =
      credential === context.decision_id
        ? context
        : Object.freeze({ ...context, decision_id: credential });
    byCredential.set(credential, actionContext);
  }
  return issue(actionContext);
}
/** Action facts come from the real registered action. Only our private verified
 * receipt can attach a role; copied captures and caller role keys have no authority. */
export function cmsActionCapture(
  capture: CmsPrimaryCapture | undefined,
  decision: CmsActionDecision &
    Readonly<{ staticActions: readonly Declaration[] }>,
  actionId: string,
): CmsPrimaryCapture | undefined {
  if (!capture) return undefined;
  const matches = decision.staticActions.filter((a) => a.id === actionId);
  if (matches.length !== 1) return undefined;
  const declaration = matches[0]!;
  const target_kind =
    declaration.target.kind === 'console-pricing'
      ? 'console_pricing'
      : declaration.target.kind === 'vela-personal-subscription'
        ? 'vela_personal_subscription'
        : declaration.target.kind;
  const action = Object.freeze({ action_id: actionId, target_kind });
  const result = Object.freeze({ ...capture, action });
  const attempt = issuedCaptures.get(capture);
  const receipt = attempt && roles.get(attempt);
  const context = capture.context;
  if (
    attempt?.renewable &&
    receipt &&
    decision.activityId === context.activity_id &&
    decision.deploymentId === context.deployment_id &&
    decision.content.id === receipt.contentId &&
    context.content_version_id === receipt.contentId &&
    decision.placementKey === receipt.placement &&
    context.placement_key === receipt.placement &&
    (attempt.mode === 'test' ||
      decision.touchpointDecisionId === context.decision_id)
  ) {
    const binding = receipt.bindings.find((b) => b.buttonId === actionId);
    const declared = receipt.declarations.find((a) => a.id === actionId);
    if (binding && declared && sameTarget(declared.target, declaration.target))
      actionRoles.set(
        result,
        Object.freeze({ context, action, role: binding.role }),
      );
  }
  return result;
}
/**
 * Test-channel facts of the button a capture from {@link cmsActionCapture}
 * resolved to. The role is read only from the private verified receipt; with
 * no receipt the role is `null`, never a default. Template/material identity
 * is the verified V3 provenance bound to the capture's context.
 */
export function cmsActionButtonFacts(
  capture: CmsPrimaryCapture | undefined,
  decision: Readonly<{ staticActions: readonly Declaration[] }>,
): TouchpointTestBehaviorButton | undefined {
  const action = capture?.action;
  if (!capture || !action) return undefined;
  const matches = decision.staticActions.filter((a) => a.id === action.action_id);
  if (matches.length !== 1) return undefined;
  const target = matches[0]!.target;
  const receipt = actionRoles.get(capture);
  const role =
    receipt && receipt.context === capture.context && receipt.action === action
      ? receipt.role
      : null;
  const { template_id, template_version, material_version_id } = capture.context;
  const provenance =
    template_id !== undefined && template_version !== undefined && material_version_id !== undefined;
  return Object.freeze({
    id: action.action_id,
    role,
    targetKind: action.target_kind,
    targetUrl: target.kind === 'https' ? target.url : target.kind === 'internal' ? target.path : null,
    templateId: provenance ? template_id : null,
    templateVersion: provenance ? template_version : null,
    materialVersionId: provenance ? material_version_id : null,
  });
}
function sameTarget(
  a: Declaration['target'],
  b: Declaration['target'],
): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'https':
      return b.kind === 'https' && a.url === b.url;
    case 'internal':
      return b.kind === 'internal' && a.path === b.path;
    case 'vela-personal-subscription':
      return (
        b.kind === 'vela-personal-subscription' && a.resourceId === b.resourceId
      );
    case 'console-pricing':
      return true;
  }
}
function once(context: CmsTouchpointContext, eventId: string, capture: () => void): void {
  let ids = captured.get(context);
  if (!ids) { ids = new Set(); captured.set(context, ids); }
  if (ids.has(eventId)) return;
  ids.add(eventId);
  try { capture(); } catch { /* Analytics cannot change authority, navigation or receipt delivery. */ }
}
export function captureCmsVisible(track: Track, attempt: TouchpointLoadAttempt | undefined, eventId: string | null | undefined): void {
  const context = cmsTouchpointContext(attempt);
  if (!context || !eventId || attempt?.behaviorEventId !== eventId) return;
  let props: CmsTouchpointSurfaceViewProps;
  switch (context.placement_key) {
    case 'opend.home.campaign-modal': props = { ...context, placement_key: context.placement_key, page_name: 'home', area: 'cms_campaign_modal', element: 'modal' }; break;
    case 'opend.home.account-badge': case 'opend.home.hover-entry': props = { ...context, placement_key: context.placement_key, page_name: 'home', area: 'cms_account_badge', element: 'badge' }; break;
    case 'opend.home.hover-layer': props = { ...context, placement_key: context.placement_key, page_name: 'home', area: 'cms_hover_layer', element: 'layer' }; break;
  }
  once(context, eventId, () => trackCmsTouchpointSurfaceView(track, props, { insertId: eventId }));
}
export function captureCmsPrimary(
  track: Track,
  capture: CmsPrimaryCapture,
  attribution?: AmrEntryAttribution,
): void {
  const { context, eventId } = capture;
  const entry =
    attribution &&
    (!capture.action || capture.action.target_kind === 'console_pricing')
      ? {
          entry_id: attribution.entryId,
          source_product: attribution.sourceProduct,
          source_detail: 'cms_campaign_primary_cta' as const,
          entry_occurred_at: attribution.occurredAt,
        }
      : {};
  const action = capture.action;
  if (action?.target_kind === 'vela_personal_subscription') return;
  const receipt = actionRoles.get(capture);
  const verifiedRole =
    receipt && receipt.context === context && receipt.action === action
      ? receipt.role
      : undefined;
  const button =
    verifiedRole && action?.target_kind === 'console_pricing'
      ? {
          action_id: action.action_id,
          target_kind: 'console_pricing' as const,
          button_role: verifiedRole,
        }
      : {};
  const click =
    action &&
    (action.target_kind === 'https' || action.target_kind === 'internal')
      ? {
          element: 'link_cta' as const,
          action_id: action.action_id,
          target_kind: action.target_kind,
          ...(verifiedRole ? { button_role: verifiedRole } : {}),
        }
      : { element: 'primary_cta' as const, ...entry, ...button };
  let props: CmsTouchpointClickProps;
  switch (context.placement_key) {
    case 'opend.home.campaign-modal':
      props = {
        ...context,
        placement_key: context.placement_key,
        page_name: 'home',
        area: 'cms_campaign_modal',
        ...click,
      };
      break;
    case 'opend.home.hover-layer':
      props = {
        ...context,
        placement_key: context.placement_key,
        page_name: 'home',
        area: 'cms_hover_layer',
        ...click,
      };
      break;
    default:
      return; // Badge and entry have no upgrade click in the frozen catalog.
  }
  once(context, eventId, () =>
    trackCmsTouchpointClick(track, props, { insertId: eventId }),
  );
}
/** Unspecified legacy dismissals stay unknown; automatic close never calls this. */
export function captureCmsClose(track: Track, attempt: TouchpointLoadAttempt | undefined, reason?: TouchpointCloseReason, suppliedEventId?: string): string | undefined {
  const context = cmsTouchpointContext(attempt);
  if (
    !context ||
    !attempt?.behaviorEventId ||
    !attempt.renewable ||
    (reason !== 'close' && reason !== 'secondary_close')
  )
    return;
  if (context.placement_key === 'opend.home.hover-layer') {
    if (reason !== 'close') return;
    const eventId = suppliedEventId ?? crypto.randomUUID();
    once(context, eventId, () =>
      trackCmsTouchpointClick(
        track,
        {
          ...context,
          placement_key: 'opend.home.hover-layer',
          page_name: 'home',
          area: 'cms_hover_layer',
          element: 'close',
        },
        { insertId: eventId },
      ),
    );
    return eventId;
  }
  if (context.placement_key !== 'opend.home.campaign-modal') return;
  const eventId = suppliedEventId ?? crypto.randomUUID();
  once(context, eventId, () => trackCmsTouchpointClick(track, { ...context, placement_key: context.placement_key as 'opend.home.campaign-modal', page_name: 'home', area: 'cms_campaign_modal', element: reason }, { insertId: eventId }));
  return eventId;
}
