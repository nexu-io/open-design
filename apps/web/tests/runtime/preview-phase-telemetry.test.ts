import { describe, expect, it } from 'vitest';
import {
  PREVIEW_PHASES,
  PREVIEW_PHASE_COMMON_FIELDS,
  PREVIEW_PHASE_EVENT_NAME,
  PREVIEW_PHASE_FIELDS,
  PREVIEW_PHASE_IDENTITY_KEY_PATTERN,
  PREVIEW_PHASE_SANCTIONED_NAVIGATION_TRIGGERS,
  PREVIEW_PHASE_SCHEMA_VERSION,
  type PreviewPhase,
  type PreviewPhaseAttachInput,
  type PreviewPhaseFieldSpec,
} from '@open-design/contracts/runtime/preview-phase-events';
import {
  PreviewPhaseTelemetry,
  type PreviewPhaseSessionDescriptor,
} from '../../src/runtime/preview-phase-telemetry';

function clock(): { now: () => number; set: (value: number) => void } {
  let value = 0;
  return {
    now: () => value,
    set: (next: number) => {
      value = next;
    },
  };
}

function descriptor(
  overrides: Partial<PreviewPhaseSessionDescriptor> = {},
): PreviewPhaseSessionDescriptor {
  return {
    sessionId: 'sess-abc123',
    documentVersion: 'v-9f2c',
    surface: 'file_viewer',
    renderMode: 'url_load',
    sandboxProfile: 'normal',
    runtimeProtocol: 'universal',
    openKind: 'cold',
    deck: false,
    ...overrides,
  };
}

describe('PreviewPhaseTelemetry timing', () => {
  it('anchors a session at navigation_start', () => {
    const time = clock();
    const telemetry = new PreviewPhaseTelemetry({ now: time.now });

    const record = telemetry.beginSession(descriptor(), {
      trigger: 'initial_open',
      did_navigate: true,
      had_previous_version: false,
      retained_session_count: 3,
    });

    expect(record.eventName).toBe(PREVIEW_PHASE_EVENT_NAME);
    expect(record.payload.phase).toBe('navigation_start');
    expect(record.payload.schema_version).toBe(PREVIEW_PHASE_SCHEMA_VERSION);
    expect(record.payload.elapsed_ms).toBe(0);
    expect(record.payload.phase_duration_ms).toBe(0);
    expect(record.payload.sequence).toBe(0);
    expect(record.payload.attach_index).toBe(0);
    expect(record.payload.open_kind).toBe('cold');
    expect(record.payload.attach_trigger).toBe('initial_open');
    expect(record.payload.did_navigate).toBe(true);
    expect(record.payload.retained_session_count).toBe(3);
  });

  it('carries the attach trigger onto every later phase of the attach', () => {
    const time = clock();
    const telemetry = new PreviewPhaseTelemetry({ now: time.now });
    const doc = descriptor();
    telemetry.beginSession(doc, { trigger: 'content_version_change', did_navigate: true });

    time.set(300);
    const promoted = telemetry.recordPhase(doc, 'version_promoted', {
      outcome: 'promoted',
      gate_runtime_identity: true,
      gate_capabilities: true,
      gate_dom_ready: true,
      gate_presentation_state: true,
      blocked_gate: 'none',
    });

    // Promotion success, retention and recovery all want to be sliced by what
    // caused the attach. Carrying it on every row keeps those metrics as
    // single-event aggregations instead of PostHog funnel joins.
    expect(promoted?.payload.attach_trigger).toBe('content_version_change');
    expect(promoted?.payload.did_navigate).toBe(true);
  });

  it('reports elapsed time from the anchor and duration from the previous phase', () => {
    const time = clock();
    const telemetry = new PreviewPhaseTelemetry({ now: time.now });
    const doc = descriptor();
    telemetry.beginSession(doc, { trigger: 'initial_open', did_navigate: true });

    time.set(120);
    const handshake = telemetry.recordPhase(doc, 'bootstrap_handshake', {
      outcome: 'acknowledged',
      protocol_version: 1,
      available_capability_count: 12,
      probe_count: 1,
    });
    time.set(200);
    const capabilities = telemetry.recordPhase(doc, 'capabilities_applied', {
      outcome: 'applied',
      enabled_capabilities: ['scroll', 'observability'],
      enabled_capability_count: 2,
      change_reason: 'initial',
    });

    expect(handshake?.payload.elapsed_ms).toBe(120);
    expect(handshake?.payload.phase_duration_ms).toBe(120);
    expect(handshake?.payload.sequence).toBe(1);
    expect(capabilities?.payload.elapsed_ms).toBe(200);
    expect(capabilities?.payload.phase_duration_ms).toBe(80);
    expect(capabilities?.payload.sequence).toBe(2);
    expect(capabilities?.payload.enabled_capabilities).toEqual(['scroll', 'observability']);
  });

  it('measures cold visible time from the navigation anchor', () => {
    const time = clock();
    const telemetry = new PreviewPhaseTelemetry({ now: time.now });
    const doc = descriptor();
    telemetry.beginSession(doc, { trigger: 'initial_open', did_navigate: true });

    time.set(1_450);
    const paint = telemetry.recordPhase(doc, 'first_visible_paint', {
      detector: 'host_observer',
      paint_observed: true,
      visible_element_count: 3,
    });

    expect(paint?.payload.elapsed_ms).toBe(1_450);
    expect(paint?.payload.open_kind).toBe('cold');
    // Observation-only is on the wire so a dashboard author cannot mistake
    // paint for a promotion gate.
    expect(paint?.payload.observation_only).toBe(true);
  });

  it('restarts the anchor and bumps attach_index on a warm re-attach', () => {
    const time = clock();
    const telemetry = new PreviewPhaseTelemetry({ now: time.now });
    const cold = descriptor();
    telemetry.beginSession(cold, { trigger: 'initial_open', did_navigate: true });
    time.set(1_800);
    telemetry.recordPhase(cold, 'first_visible_paint', {
      detector: 'host_observer',
      paint_observed: true,
    });

    time.set(9_000);
    const warm = descriptor({ openKind: 'warm' });
    const reattach = telemetry.beginSession(warm, {
      trigger: 'file_tab_change',
      did_navigate: false,
      had_previous_version: true,
    });
    time.set(9_040);
    const warmPaint = telemetry.recordPhase(warm, 'first_visible_paint', {
      detector: 'host_observer',
      paint_observed: true,
    });

    expect(reattach.payload.attach_index).toBe(1);
    expect(reattach.payload.elapsed_ms).toBe(0);
    expect(warmPaint?.payload.attach_index).toBe(1);
    expect(warmPaint?.payload.open_kind).toBe('warm');
    // The warm window must not inherit the cold anchor, or the 100ms
    // restore ratio is unmeasurable.
    expect(warmPaint?.payload.elapsed_ms).toBe(40);
  });

  it('fails closed for a phase recorded without an open session', () => {
    const telemetry = new PreviewPhaseTelemetry({ now: clock().now });
    expect(
      telemetry.recordPhase(descriptor(), 'bootstrap_handshake', {
        outcome: 'acknowledged',
      }),
    ).toBeNull();
  });

  it('closes the session after cache_reclaimed', () => {
    const time = clock();
    const telemetry = new PreviewPhaseTelemetry({ now: time.now });
    const doc = descriptor();
    telemetry.beginSession(doc, { trigger: 'initial_open', did_navigate: true });

    time.set(60_000);
    const reclaimed = telemetry.recordPhase(doc, 'cache_reclaimed', {
      reason: 'lru_budget',
      retained_ms: 45_000,
      reuse_count: 2,
      retained_session_count: 8,
      evicted_session_count: 1,
    });

    expect(reclaimed?.payload.phase).toBe('cache_reclaimed');
    expect(telemetry.activeSessionCount()).toBe(0);
    expect(telemetry.recordPhase(doc, 'first_visible_paint', { paint_observed: true })).toBeNull();
  });

  it('clamps a non-monotonic clock instead of emitting negative durations', () => {
    const time = clock();
    time.set(5_000);
    const telemetry = new PreviewPhaseTelemetry({ now: time.now });
    const doc = descriptor();
    telemetry.beginSession(doc, { trigger: 'initial_open', did_navigate: true });

    time.set(4_000);
    const record = telemetry.recordPhase(doc, 'bootstrap_handshake', {
      outcome: 'acknowledged',
    });

    expect(record?.payload.elapsed_ms).toBe(0);
    expect(record?.payload.phase_duration_ms).toBe(0);
  });

  it('bounds retained sessions so a long-lived tab cannot grow without limit', () => {
    const telemetry = new PreviewPhaseTelemetry({ now: clock().now, maxSessions: 2 });
    const first = descriptor({ documentVersion: 'v-1' });
    const second = descriptor({ documentVersion: 'v-2' });
    const third = descriptor({ documentVersion: 'v-3' });
    for (const doc of [first, second, third]) {
      telemetry.beginSession(doc, { trigger: 'initial_open', did_navigate: true });
    }

    expect(telemetry.activeSessionCount()).toBe(2);
    expect(telemetry.recordPhase(first, 'bootstrap_handshake', { outcome: 'acknowledged' }))
      .toBeNull();
    expect(telemetry.recordPhase(third, 'bootstrap_handshake', { outcome: 'acknowledged' }))
      .not.toBeNull();
  });
});

describe('promotion gate reporting', () => {
  it('records the four promotion gates and never paint', () => {
    const telemetry = new PreviewPhaseTelemetry({ now: clock().now });
    const doc = descriptor();
    telemetry.beginSession(doc, { trigger: 'content_version_change', did_navigate: true });

    const promoted = telemetry.recordPhase(doc, 'version_promoted', {
      outcome: 'promoted',
      gate_runtime_identity: true,
      gate_capabilities: true,
      gate_dom_ready: true,
      gate_presentation_state: true,
      blocked_gate: 'none',
      attempt: 1,
      // A version that never visibly painted must still be promotable: paint
      // is observation, not a gate.
      paint_observed_at_decision: false,
    });

    expect(promoted?.payload.outcome).toBe('promoted');
    expect(promoted?.payload.gate_presentation_state).toBe(true);
    expect(promoted?.payload.paint_observed_at_decision).toBe(false);

    const blockedGateValues =
      PREVIEW_PHASE_FIELDS.version_promoted.blocked_gate?.values ?? [];
    expect(blockedGateValues).toEqual(
      expect.arrayContaining([
        'none',
        'runtime_identity',
        'capabilities',
        'dom_ready',
        'presentation_state',
      ]),
    );
    // If paint ever becomes a nameable blocking gate, the promotion-success
    // metric silently changes meaning. Keep it out of the enum.
    expect(blockedGateValues).not.toContain('first_visible_paint');
    expect(blockedGateValues.some((value) => value.includes('paint'))).toBe(false);
  });

  it('classifies navigation triggers so the target-zero ratio has a fixed denominator', () => {
    for (const trigger of ['view_change', 'capability_change', 'file_tab_change', 'project_switch']) {
      expect(PREVIEW_PHASE_SANCTIONED_NAVIGATION_TRIGGERS).not.toContain(trigger);
    }
    for (const trigger of ['initial_open', 'content_version_change', 'explicit_reload', 'recovery']) {
      expect(PREVIEW_PHASE_SANCTIONED_NAVIGATION_TRIGGERS).toContain(trigger);
    }
  });
});

// ---------------------------------------------------------------------------
// Privacy guard.
//
// The product promise is that preview telemetry never carries HTML, DOM text,
// screenshots, file paths, resource URLs, or project titles. That promise has
// to be enforced by the shape of the contract, not by reviewer attention:
// `documentVersion` is literally `legacy:<file path>` on the rolling-upgrade
// path (apps/web/src/providers/registry.ts), so a payload that copied identity
// strings verbatim would ship user file paths to PostHog on day one.
// ---------------------------------------------------------------------------

const POISON = [
  '<h1>Q3 Board Review</h1>',
  'Acme Rebrand — Confidential',
  '/Users/elian/Documents/open-design/projects/acme/deck.html',
  'C:\\Users\\elian\\projects\\acme\\deck.html',
  'https://cdn.example.com/fonts/brand-medium.woff2',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg',
  'blob:http://n-abc.localhost/9f2c-1a',
  'legacy:decks/Q3 Board Review.html',
  './assets/hero-image.png',
];

function allSpecs(): Array<[string, PreviewPhaseFieldSpec]> {
  const specs: Array<[string, PreviewPhaseFieldSpec]> = [
    ...Object.entries(PREVIEW_PHASE_COMMON_FIELDS),
  ];
  for (const phase of PREVIEW_PHASES) {
    specs.push(...Object.entries(PREVIEW_PHASE_FIELDS[phase]));
  }
  return specs;
}

function allowedStringValues(): Set<string> {
  const allowed = new Set<string>([PREVIEW_PHASE_EVENT_NAME, ...PREVIEW_PHASES]);
  for (const [, spec] of allSpecs()) {
    for (const value of spec.values ?? []) allowed.add(value);
  }
  return allowed;
}

describe('preview phase payload privacy', () => {
  it('declares no free-text field anywhere in the contract', () => {
    const kinds = new Set(allSpecs().map(([, spec]) => spec.kind));
    expect([...kinds].sort()).toEqual(
      ['boolean', 'enum', 'enum_list', 'key', 'number'].filter((kind) => kinds.has(kind as never)),
    );
    expect(kinds.has('text' as never)).toBe(false);
    for (const [name, spec] of allSpecs()) {
      if (spec.kind !== 'enum' && spec.kind !== 'enum_list') continue;
      expect(spec.values, `${name} must declare a closed value set`).toBeDefined();
      for (const value of spec.values ?? []) {
        expect(value, `${name} value ${value}`).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
      }
    }
  });

  it('hashes identity instead of copying it, for every phase', () => {
    const telemetry = new PreviewPhaseTelemetry({ now: clock().now });
    const doc = descriptor({
      sessionId: POISON[3]!,
      documentVersion: 'legacy:decks/Q3 Board Review.html',
    });
    const record = telemetry.beginSession(doc, {
      trigger: 'initial_open',
      did_navigate: true,
    });

    expect(String(record.payload.session_key)).toMatch(PREVIEW_PHASE_IDENTITY_KEY_PATTERN);
    expect(String(record.payload.document_key)).toMatch(PREVIEW_PHASE_IDENTITY_KEY_PATTERN);
    const serialized = JSON.stringify(record.payload);
    expect(serialized).not.toContain('Q3 Board Review');
    expect(serialized).not.toContain('legacy:');
    expect(serialized).not.toContain('/Users/');
  });

  it('produces the same key for the same identity so funnels still join', () => {
    const telemetry = new PreviewPhaseTelemetry({ now: clock().now });
    const a = telemetry.beginSession(descriptor(), {
      trigger: 'initial_open',
      did_navigate: true,
    });
    const b = telemetry.beginSession(descriptor(), {
      trigger: 'explicit_reload',
      did_navigate: true,
    });
    const other = telemetry.beginSession(descriptor({ documentVersion: 'v-other' }), {
      trigger: 'initial_open',
      did_navigate: true,
    });

    expect(a.payload.document_key).toBe(b.payload.document_key);
    expect(a.payload.document_key).not.toBe(other.payload.document_key);
  });

  it('drops poisoned detail keys and poisoned enum values in every phase', () => {
    const allowed = allowedStringValues();

    for (const phase of PREVIEW_PHASES) {
      const telemetry = new PreviewPhaseTelemetry({ now: clock().now });
      const doc = descriptor({ sessionId: POISON[2]!, documentVersion: POISON[7]! });
      telemetry.beginSession(doc, { trigger: 'initial_open', did_navigate: true });

      const detail: Record<string, unknown> = {};
      // Every declared field of this phase gets a poisoned value.
      for (const [field, spec] of Object.entries(PREVIEW_PHASE_FIELDS[phase])) {
        detail[field] = spec.kind === 'enum_list' ? POISON : POISON[0];
      }
      // Plus undeclared fields a careless call site might pass through.
      detail.html = '<section class="hero">Acme Rebrand</section>';
      detail.file_path = POISON[2];
      detail.resource_url = POISON[4];
      detail.project_title = 'Acme Rebrand — Confidential';
      detail.screenshot = POISON[5];
      detail.dom_text = 'Q3 Board Review';

      const record =
        phase === 'navigation_start'
          ? telemetry.beginSession(doc, {
              ...detail,
              trigger: 'initial_open',
              did_navigate: true,
            } as PreviewPhaseAttachInput)
          : telemetry.recordPhase(doc, phase as PreviewPhase, detail);
      expect(record, `phase ${phase} must still emit`).not.toBeNull();

      const payload = record!.payload;
      const serialized = JSON.stringify(payload);
      for (const poison of POISON) {
        expect(serialized, `phase ${phase} leaked ${poison}`).not.toContain(poison);
      }
      for (const marker of ['<', 'http', '/Users/', 'C:\\', 'data:', 'blob:', './', 'Acme']) {
        expect(serialized, `phase ${phase} leaked ${marker}`).not.toContain(marker);
      }
      for (const undeclared of ['html', 'file_path', 'resource_url', 'project_title', 'screenshot', 'dom_text']) {
        expect(Object.keys(payload), `phase ${phase} kept ${undeclared}`).not.toContain(undeclared);
      }

      // Nothing but closed vocabulary and identity keys may appear as a string.
      for (const [field, value] of Object.entries(payload)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          if (typeof item !== 'string') continue;
          const isKey = PREVIEW_PHASE_IDENTITY_KEY_PATTERN.test(item);
          expect(
            isKey || allowed.has(item),
            `phase ${phase} field ${field} carries uncontrolled string ${item}`,
          ).toBe(true);
        }
      }
    }
  });

  it('rejects poisoned framing, not just poisoned detail', () => {
    const telemetry = new PreviewPhaseTelemetry({ now: clock().now });
    const poisoned = {
      sessionId: POISON[2]!,
      documentVersion: POISON[7]!,
      surface: '<h1>Q3 Board Review</h1>',
      renderMode: POISON[4]!,
      sandboxProfile: POISON[0]!,
      runtimeProtocol: POISON[8]!,
      openKind: 'Acme Rebrand — Confidential',
      deck: false,
    } as unknown as PreviewPhaseSessionDescriptor;

    const record = telemetry.beginSession(poisoned, {
      trigger: POISON[1] as never,
      did_navigate: true,
    });

    const serialized = JSON.stringify(record.payload);
    for (const poison of POISON) {
      expect(serialized).not.toContain(poison);
    }
    for (const field of ['surface', 'render_mode', 'sandbox_profile', 'runtime_protocol', 'open_kind', 'attach_trigger']) {
      expect(Object.keys(record.payload), `${field} accepted a poisoned value`).not.toContain(field);
    }
  });

  it('keeps every numeric field bounded', () => {
    const telemetry = new PreviewPhaseTelemetry({ now: clock().now });
    const doc = descriptor();
    telemetry.beginSession(doc, {
      trigger: 'initial_open',
      did_navigate: true,
      retained_session_count: Number.MAX_SAFE_INTEGER,
    });
    const record = telemetry.recordPhase(doc, 'recovery_attempted', {
      trigger: 'handshake_timeout',
      attempt: -12,
      max_attempts: 1e18,
      outcome: 'retrying',
    });

    for (const value of Object.values(record!.payload)) {
      if (typeof value !== 'number') continue;
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10_000_000);
    }
  });
});
