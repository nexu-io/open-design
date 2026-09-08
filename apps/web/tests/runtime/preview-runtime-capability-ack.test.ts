// @vitest-environment node
//
// Red spec for a preview capability the host asks for, never gets, and never
// hears about.
//
// The host negotiates capabilities by posting `od:preview:set-capabilities` and
// waiting for the document to answer `od:preview:capabilities-applied`. It
// matches that answer by joining the returned capability list and comparing it
// to the list it sent:
//
//   if (message.enabledCapabilities.join('\0') === this.#lastCommandKey)
//
// That comparison assumes the document either applies everything it was asked
// for or answers nothing. It does neither. `applyCapabilities` in the runtime
// bootstrap enables each module inside a `try`, and a module whose `enable()`
// throws is simply left out of the reply — the document answers honestly with a
// SHORTER list.
//
// The host then treats that honest answer as noise. `onCapabilitiesApplied`
// never fires, so the presentation barrier is never sent, the frame is never
// recorded as having applied anything, and a standby waiting on that
// acknowledgement is never promoted. Nothing retries and nothing is reported:
// the host sits in comment mode against a document that never enabled comment,
// with no signal anywhere that the two disagree.
//
// Observed in a 500-artifact patrol: 2 of 63 selection operations failed with
// the runtime fully awake (hello, ready, identity and presentation state all
// acknowledged), `comment` advertised by the document, `comment` absent from
// the applied set, and `capabilityAcknowledged: false`. The other 61 applied
// `comment` and passed.
//
// The controls below are the same flow with a complete reply, which is what
// keeps this spec from passing vacuously: a fix that accepted every message, or
// one that stopped fencing stale replies, fails them.

import { describe, expect, it } from 'vitest';

import { PreviewRuntimeController } from '../../src/runtime/preview-runtime-controller';
import type {
  PreviewRuntimeCapability,
  PreviewRuntimeDocumentIdentity,
} from '@open-design/contracts/runtime/preview-runtime';

const IDENTITY: PreviewRuntimeDocumentIdentity = { sessionId: 's1', documentVersion: 'v1' };

const BASE: PreviewRuntimeCapability[] = [
  'content_measurement', 'scroll', 'snapshot', 'observability', 'selection', 'tweaks', 'palette',
];
const AVAILABLE: PreviewRuntimeCapability[] = [...BASE, 'comment', 'inspect', 'draw', 'deck', 'edit'];

function harness() {
  const sent: Record<string, unknown>[] = [];
  const target = { postMessage: (message: unknown) => { sent.push(message as Record<string, unknown>); } };
  const applied: PreviewRuntimeCapability[][] = [];
  const controller = new PreviewRuntimeController({
    identity: IDENTITY,
    target,
    callbacks: { onCapabilitiesApplied: (capabilities) => applied.push([...capabilities]) },
  });
  const deliver = (data: Record<string, unknown>) => controller.handleMessage({ source: target, data });
  deliver({
    type: 'od:preview:hello',
    protocolVersion: 1,
    ...IDENTITY,
    availableCapabilities: AVAILABLE,
  });
  const lastCommand = () => sent
    .filter((message) => message.type === 'od:preview:set-capabilities')
    .at(-1) as { enabledCapabilities: PreviewRuntimeCapability[]; revision?: number } | undefined;
  const barrierSent = () => sent.some((message) => (
    message.type === 'od:preview:presentation-state-barrier'
  ));
  return { applied, barrierSent, controller, deliver, lastCommand, sent };
}

describe('capability acknowledgement that reports less than was asked for', () => {
  it('acknowledges a document that applied everything (control)', () => {
    const h = harness();
    h.controller.setEnabledCapabilities([...BASE, 'comment']);
    const command = h.lastCommand()!;
    h.deliver({
      type: 'od:preview:capabilities-applied',
      protocolVersion: 1,
      ...IDENTITY,
      ...(command.revision === undefined ? {} : { revision: command.revision }),
      enabledCapabilities: command.enabledCapabilities,
    });

    expect(h.applied).toHaveLength(1);
    expect(h.applied[0]).toContain('comment');
    expect(h.barrierSent()).toBe(true);
  });

  /**
   * The defect. The document answered the command it was given; it simply could
   * not enable one module. The host must hear that answer — with the set that
   * was really applied — instead of waiting forever for a reply that already
   * came.
   */
  it('acknowledges a document that could not enable one capability', () => {
    const h = harness();
    h.controller.setEnabledCapabilities([...BASE, 'comment']);
    const command = h.lastCommand()!;
    // Exactly what the runtime returns when comment's enable() throws:
    // `available.filter(activeSet)` with comment absent.
    h.deliver({
      type: 'od:preview:capabilities-applied',
      protocolVersion: 1,
      ...IDENTITY,
      ...(command.revision === undefined ? {} : { revision: command.revision }),
      enabledCapabilities: BASE,
    });

    expect(h.applied, 'the reply must not be discarded').toHaveLength(1);
    expect(h.applied[0], 'the host must record what was really applied').not.toContain('comment');
    expect(h.barrierSent(), 'the handshake must continue').toBe(true);
  });

  /**
   * The fence still has to hold, or the fix trades a hang for a document being
   * driven from a superseded command's reply.
   */
  it('still ignores the reply to a superseded command (control)', () => {
    const h = harness();
    h.controller.setEnabledCapabilities([...BASE, 'comment']);
    const stale = h.lastCommand()!;
    h.controller.setEnabledCapabilities([...BASE, 'inspect']);

    h.deliver({
      type: 'od:preview:capabilities-applied',
      protocolVersion: 1,
      ...IDENTITY,
      ...(stale.revision === undefined ? {} : { revision: stale.revision }),
      enabledCapabilities: stale.enabledCapabilities,
    });

    expect(h.applied, 'a reply to the previous command is not an answer to this one').toHaveLength(0);
  });
});
