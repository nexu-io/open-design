/**
 * Versioned host/iframe protocol for the converged real-URL preview runtime.
 *
 * Keep this module browser-API free. It owns only bounded wire shapes and
 * identity fencing shared by the web host, daemon bootstrap, and tests.
 */

export const PREVIEW_RUNTIME_PROTOCOL_VERSION = 1 as const;

export const PREVIEW_RUNTIME_CAPABILITIES = [
  'content_measurement',
  'scroll',
  'snapshot',
  'observability',
  'selection',
  'comment',
  'inspect',
  'draw',
  'tweaks',
  'palette',
  'deck',
  // Full-screen presentation. Installed like `observability` rather than
  // toggled: the bridge only registers a listener at parse time and stays
  // inert until the host negotiates, and putting the switch in the document
  // URL would renavigate the running document — which is exactly what
  // presenting in place must not do.
  'presentation',
  'edit',
] as const;

export type PreviewRuntimeCapability = typeof PREVIEW_RUNTIME_CAPABILITIES[number];

export const PREVIEW_RUNTIME_MESSAGE_TYPES = [
  'od:preview:probe',
  'od:preview:hello',
  'od:preview:set-capabilities',
  'od:preview:capabilities-applied',
  'od:preview:presentation-state-barrier',
  'od:preview:presentation-state-applied',
  'od:preview:navigation-failed',
  'od:preview:ready',
] as const;

export type PreviewRuntimeMessageType = typeof PREVIEW_RUNTIME_MESSAGE_TYPES[number];

export interface PreviewRuntimeDocumentIdentity {
  sessionId: string;
  documentVersion: string;
}

interface PreviewRuntimeMessageBase extends PreviewRuntimeDocumentIdentity {
  protocolVersion: typeof PREVIEW_RUNTIME_PROTOCOL_VERSION;
}

export interface PreviewRuntimeProbeMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:probe';
}

export interface PreviewRuntimeHelloMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:hello';
  availableCapabilities: PreviewRuntimeCapability[];
}

export interface PreviewRuntimeSetCapabilitiesMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:set-capabilities';
  enabledCapabilities: PreviewRuntimeCapability[];
}

export interface PreviewRuntimeCapabilitiesAppliedMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:capabilities-applied';
  enabledCapabilities: PreviewRuntimeCapability[];
}

export interface PreviewRuntimePresentationStateBarrierMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:presentation-state-barrier';
  revision: number;
}

export interface PreviewRuntimePresentationStateAppliedMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:presentation-state-applied';
  revision: number;
}

export interface PreviewRuntimeNavigationFailedMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:navigation-failed';
  reason: 'version_changed';
  /** Exact real-URL browsing-context attempt that received the failed response. */
  navigationAttempt: number;
}

export interface PreviewRuntimeReadyMessage extends PreviewRuntimeMessageBase {
  type: 'od:preview:ready';
}

export type PreviewRuntimeMessage =
  | PreviewRuntimeProbeMessage
  | PreviewRuntimeHelloMessage
  | PreviewRuntimeSetCapabilitiesMessage
  | PreviewRuntimeCapabilitiesAppliedMessage
  | PreviewRuntimePresentationStateBarrierMessage
  | PreviewRuntimePresentationStateAppliedMessage
  | PreviewRuntimeNavigationFailedMessage
  | PreviewRuntimeReadyMessage;

const MAX_IDENTITY_LENGTH = 200;
const CAPABILITY_SET = new Set<string>(PREVIEW_RUNTIME_CAPABILITIES);
const MESSAGE_TYPE_SET = new Set<string>(PREVIEW_RUNTIME_MESSAGE_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedIdentity(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_IDENTITY_LENGTH
    && value.trim() === value;
}

function parseCapabilities(value: unknown): PreviewRuntimeCapability[] | null {
  if (!Array.isArray(value) || value.length > PREVIEW_RUNTIME_CAPABILITIES.length * 2) {
    return null;
  }
  const capabilities: PreviewRuntimeCapability[] = [];
  for (const capability of value) {
    if (typeof capability !== 'string' || !CAPABILITY_SET.has(capability)) return null;
    capabilities.push(capability as PreviewRuntimeCapability);
  }
  return normalizePreviewRuntimeCapabilities(capabilities);
}

function parseRevision(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null;
}

function parseNavigationAttempt(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    ? value
    : null;
}

export function normalizePreviewRuntimeCapabilities(
  capabilities: readonly PreviewRuntimeCapability[],
): PreviewRuntimeCapability[] {
  const requested = new Set(capabilities);
  return PREVIEW_RUNTIME_CAPABILITIES.filter((capability) => requested.has(capability));
}

export function parsePreviewRuntimeMessage(value: unknown): PreviewRuntimeMessage | null {
  if (!isRecord(value)) return null;
  if (value.protocolVersion !== PREVIEW_RUNTIME_PROTOCOL_VERSION) return null;
  if (typeof value.type !== 'string' || !MESSAGE_TYPE_SET.has(value.type)) return null;
  if (!isBoundedIdentity(value.sessionId) || !isBoundedIdentity(value.documentVersion)) return null;

  const base = {
    protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    documentVersion: value.documentVersion,
  };

  const messageType = value.type as PreviewRuntimeMessageType;
  switch (messageType) {
    case 'od:preview:probe':
      return { type: messageType, ...base };
    case 'od:preview:hello': {
      const availableCapabilities = parseCapabilities(value.availableCapabilities);
      if (availableCapabilities === null) return null;
      return { type: messageType, ...base, availableCapabilities };
    }
    case 'od:preview:set-capabilities':
    case 'od:preview:capabilities-applied': {
      const enabledCapabilities = parseCapabilities(value.enabledCapabilities);
      if (enabledCapabilities === null) return null;
      return { type: messageType, ...base, enabledCapabilities };
    }
    case 'od:preview:presentation-state-barrier':
    case 'od:preview:presentation-state-applied': {
      const revision = parseRevision(value.revision);
      if (revision === null) return null;
      return { type: messageType, ...base, revision };
    }
    case 'od:preview:navigation-failed': {
      const navigationAttempt = parseNavigationAttempt(value.navigationAttempt);
      if (value.reason !== 'version_changed' || navigationAttempt === null) return null;
      return {
        type: messageType,
        ...base,
        reason: value.reason,
        navigationAttempt,
      };
    }
    case 'od:preview:ready':
      return { type: messageType, ...base };
  }
}

export function createPreviewRuntimeProbeMessage(
  input: PreviewRuntimeDocumentIdentity,
): PreviewRuntimeProbeMessage {
  if (!isBoundedIdentity(input.sessionId) || !isBoundedIdentity(input.documentVersion)) {
    throw new TypeError('preview runtime document identity must be a non-empty bounded string');
  }
  return {
    type: 'od:preview:probe',
    protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
    sessionId: input.sessionId,
    documentVersion: input.documentVersion,
  };
}

export function createPreviewRuntimeSetCapabilitiesMessage(
  input: PreviewRuntimeDocumentIdentity & {
    enabledCapabilities: readonly PreviewRuntimeCapability[];
  },
): PreviewRuntimeSetCapabilitiesMessage {
  if (!isBoundedIdentity(input.sessionId) || !isBoundedIdentity(input.documentVersion)) {
    throw new TypeError('preview runtime document identity must be a non-empty bounded string');
  }
  return {
    type: 'od:preview:set-capabilities',
    protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
    sessionId: input.sessionId,
    documentVersion: input.documentVersion,
    enabledCapabilities: normalizePreviewRuntimeCapabilities(input.enabledCapabilities),
  };
}

export function createPreviewRuntimePresentationStateBarrierMessage(
  input: PreviewRuntimeDocumentIdentity & { revision: number },
): PreviewRuntimePresentationStateBarrierMessage {
  if (!isBoundedIdentity(input.sessionId) || !isBoundedIdentity(input.documentVersion)) {
    throw new TypeError('preview runtime document identity must be a non-empty bounded string');
  }
  const revision = parseRevision(input.revision);
  if (revision === null) {
    throw new TypeError('preview runtime presentation revision must be a positive safe integer');
  }
  return {
    type: 'od:preview:presentation-state-barrier',
    protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
    sessionId: input.sessionId,
    documentVersion: input.documentVersion,
    revision,
  };
}

export function createPreviewRuntimeNavigationFailedMessage(
  input: PreviewRuntimeDocumentIdentity & {
    reason: 'version_changed';
    navigationAttempt: number;
  },
): PreviewRuntimeNavigationFailedMessage {
  if (!isBoundedIdentity(input.sessionId) || !isBoundedIdentity(input.documentVersion)) {
    throw new TypeError('preview runtime document identity must be a non-empty bounded string');
  }
  const navigationAttempt = parseNavigationAttempt(input.navigationAttempt);
  if (navigationAttempt === null) {
    throw new TypeError('preview runtime navigation attempt must be a non-negative safe integer');
  }
  return {
    type: 'od:preview:navigation-failed',
    protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
    sessionId: input.sessionId,
    documentVersion: input.documentVersion,
    reason: input.reason,
    navigationAttempt,
  };
}

export function previewRuntimeMessageMatchesDocument(
  message: PreviewRuntimeMessage | null,
  identity: PreviewRuntimeDocumentIdentity,
): boolean {
  return message !== null
    && message.sessionId === identity.sessionId
    && message.documentVersion === identity.documentVersion;
}
