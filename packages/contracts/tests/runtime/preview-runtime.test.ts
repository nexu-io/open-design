import { describe, expect, it } from 'vitest';
import {
  PREVIEW_RUNTIME_PROTOCOL_VERSION,
  createPreviewRuntimeNavigationFailedMessage,
  createPreviewRuntimePresentationStateBarrierMessage,
  createPreviewRuntimeProbeMessage,
  createPreviewRuntimeSetCapabilitiesMessage,
  normalizePreviewRuntimeCapabilities,
  parsePreviewRuntimeMessage,
  previewRuntimeMessageMatchesDocument,
} from '../../src/runtime/preview-runtime.js';

const identity = {
  sessionId: 'session-1',
  documentVersion: 'version-7',
};

describe('preview runtime protocol', () => {
  it('normalizes capabilities into one stable idempotent order', () => {
    expect(normalizePreviewRuntimeCapabilities([
      'edit',
      'deck',
      'edit',
      'snapshot',
    ])).toEqual(['snapshot', 'deck', 'edit']);
  });

  it('parses the complete versioned handshake without retaining unknown fields', () => {
    const hello = parsePreviewRuntimeMessage({
      type: 'od:preview:hello',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
      availableCapabilities: ['edit', 'deck', 'edit'],
      artifactSource: '<html>must not cross the contract</html>',
    });
    const applied = parsePreviewRuntimeMessage({
      type: 'od:preview:capabilities-applied',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
      enabledCapabilities: ['deck'],
    });
    const ready = parsePreviewRuntimeMessage({
      type: 'od:preview:ready',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
    });
    const presentationApplied = parsePreviewRuntimeMessage({
      type: 'od:preview:presentation-state-applied',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
      revision: 3,
    });
    const navigationFailed = parsePreviewRuntimeMessage({
      type: 'od:preview:navigation-failed',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
      reason: 'version_changed',
      navigationAttempt: 2,
      daemonStack: 'must not cross the contract',
    });

    expect(hello).toEqual({
      type: 'od:preview:hello',
      protocolVersion: 1,
      ...identity,
      availableCapabilities: ['deck', 'edit'],
    });
    expect(hello).not.toHaveProperty('artifactSource');
    expect(applied?.type).toBe('od:preview:capabilities-applied');
    expect(ready?.type).toBe('od:preview:ready');
    expect(presentationApplied).toEqual({
      type: 'od:preview:presentation-state-applied',
      protocolVersion: 1,
      ...identity,
      revision: 3,
    });
    expect(navigationFailed).toEqual({
      type: 'od:preview:navigation-failed',
      protocolVersion: 1,
      ...identity,
      reason: 'version_changed',
      navigationAttempt: 2,
    });
    expect(navigationFailed).not.toHaveProperty('daemonStack');
  });

  it('creates a canonical host capability command', () => {
    expect(createPreviewRuntimeProbeMessage(identity)).toEqual({
      type: 'od:preview:probe',
      protocolVersion: 1,
      ...identity,
    });
    expect(createPreviewRuntimeSetCapabilitiesMessage({
      ...identity,
      enabledCapabilities: ['edit', 'selection', 'edit'],
    })).toEqual({
      type: 'od:preview:set-capabilities',
      protocolVersion: 1,
      ...identity,
      enabledCapabilities: ['selection', 'edit'],
    });
    expect(createPreviewRuntimePresentationStateBarrierMessage({
      ...identity,
      revision: 7,
    })).toEqual({
      type: 'od:preview:presentation-state-barrier',
      protocolVersion: 1,
      ...identity,
      revision: 7,
    });
    expect(createPreviewRuntimeNavigationFailedMessage({
      ...identity,
      reason: 'version_changed',
      navigationAttempt: 0,
    })).toEqual({
      type: 'od:preview:navigation-failed',
      protocolVersion: 1,
      ...identity,
      reason: 'version_changed',
      navigationAttempt: 0,
    });
  });

  it('rejects unsupported versions, message types, identities, and capabilities', () => {
    const base = {
      type: 'od:preview:ready',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
    };

    expect(parsePreviewRuntimeMessage({ ...base, protocolVersion: 2 })).toBeNull();
    expect(parsePreviewRuntimeMessage({ ...base, type: 'od:preview:unknown' })).toBeNull();
    expect(parsePreviewRuntimeMessage({ ...base, sessionId: '' })).toBeNull();
    expect(parsePreviewRuntimeMessage({ ...base, documentVersion: 'x'.repeat(201) })).toBeNull();
    expect(parsePreviewRuntimeMessage({
      ...base,
      type: 'od:preview:hello',
      availableCapabilities: ['deck', 'arbitrary'],
    })).toBeNull();
    expect(parsePreviewRuntimeMessage({
      ...base,
      type: 'od:preview:presentation-state-applied',
      revision: 0,
    })).toBeNull();
    expect(parsePreviewRuntimeMessage({
      ...base,
      type: 'od:preview:navigation-failed',
      reason: 'version_changed',
      navigationAttempt: -1,
    })).toBeNull();
    expect(parsePreviewRuntimeMessage({
      ...base,
      type: 'od:preview:navigation-failed',
      reason: 'network_error',
      navigationAttempt: 0,
    })).toBeNull();
  });

  it('fences retained and standby documents by exact session and version', () => {
    const message = parsePreviewRuntimeMessage({
      type: 'od:preview:ready',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
    });

    expect(previewRuntimeMessageMatchesDocument(message, identity)).toBe(true);
    expect(previewRuntimeMessageMatchesDocument(message, {
      sessionId: 'session-2',
      documentVersion: identity.documentVersion,
    })).toBe(false);
    expect(previewRuntimeMessageMatchesDocument(message, {
      sessionId: identity.sessionId,
      documentVersion: 'version-8',
    })).toBe(false);
    expect(previewRuntimeMessageMatchesDocument(null, identity)).toBe(false);
  });
});
