// @vitest-environment jsdom
//
// Regression for #6333 round-2 (nettee, 2026-08-02):
// `PluginLoopSubmit` now carries a `skillIds` array alongside the
// existing primary `skillId`. `EntryShell.handlePluginLoopSubmit`
// delegates the build-args spread to
// `buildCreateProjectArgsFromPluginLoopSubmit`, which must forward
// the multi-skill compose list (length > 1) onto the produced
// `onCreateProject` args so the array reaches
// `App.handleCreateProject`'s `od:auto-send-skillIds:<projectId>`
// sessionStorage hand-off and ultimately `streamViaDaemon`'s
// `skillIds`. The single-skill flow must NOT spread `skillIds` so
// the daemon's primary `skillId` binding is the only contract.

import { describe, expect, it } from 'vitest';

import type { PluginLoopSubmit } from '../../src/components/PluginLoopHome';
import { buildCreateProjectArgsFromPluginLoopSubmit } from '../../src/components/plugin-loop-submit';

function basePayload(overrides: Partial<PluginLoopSubmit>): PluginLoopSubmit {
  return {
    prompt: 'make a deck and a PDF',
    pluginId: null,
    skillId: 'deck-builder',
    appliedPluginSnapshotId: null,
    pluginTitle: null,
    taskKind: null,
    ...overrides,
  } as PluginLoopSubmit;
}

describe('buildCreateProjectArgsFromPluginLoopSubmit', () => {
  it('forwards payload.skillIds to onCreateProject when the compose list has more than one entry (multi-skill @-mention flow)', () => {
    const payload = basePayload({
      skillId: 'deck-builder',
      skillIds: ['deck-builder', 'pdf-designer'],
    });

    const args = buildCreateProjectArgsFromPluginLoopSubmit(payload, {
      name: 'Test Deck',
      amrGatePrechecked: false,
    });

    // The primary skill stays on `skillId` (the single-skill contract),
    // and the full multi-skill compose list lands on `skillIds`.
    expect(args.skillId).toBe('deck-builder');
    expect(args.skillIds).toEqual(['deck-builder', 'pdf-designer']);

    // The hand-off fields the EntryShell relies on are present.
    expect(args.name).toBe('Test Deck');
    expect(args.pendingPrompt).toBe('make a deck and a PDF');
    expect(args.designSystemId).toBeNull();
    expect(args.autoSendFirstMessage).toBe(true);
    expect(args.amrGatePrechecked).toBe(false);
  });

  it('does NOT spread skillIds on the single-skill flow so the primary binding is the only contract (regression for the previous spread that leaked null/undefined)', () => {
    const payload = basePayload({
      skillId: 'deck-builder',
      skillIds: null,
    });

    const args = buildCreateProjectArgsFromPluginLoopSubmit(payload, {
      name: 'Test',
      amrGatePrechecked: false,
    });

    expect(args.skillId).toBe('deck-builder');
    // `skillIds` must NOT appear — null/undefined should not be spread.
    expect(args).not.toHaveProperty('skillIds');
  });

  it('does NOT spread skillIds when the compose list has length <= 1 (avoids overriding the primary skillId with a redundant one-element array)', () => {
    const payload = basePayload({
      skillId: 'deck-builder',
      // Edge case: HomeView stamps the same primary as the only
      // entry — the spread must not duplicate `skillId` as `skillIds`.
      skillIds: ['deck-builder'],
    });

    const args = buildCreateProjectArgsFromPluginLoopSubmit(payload, {
      name: 'Test',
      amrGatePrechecked: false,
    });

    expect(args.skillId).toBe('deck-builder');
    expect(args).not.toHaveProperty('skillIds');
  });

  it('preserves pluginId / pluginType / snapshotId / pluginInputs / initialRunContext / conversationMode / attachments when present', () => {
    const attachment = new File(['x'], 'x.png');
    const payload = basePayload({
      pluginId: 'od-default',
      pluginType: 'official',
      appliedPluginSnapshotId: 'snap-1',
      pluginInputs: { tone: 'concise' },
      conversationMode: 'design',
      attachments: [attachment],
      // `initialRunContext` is typed loosely here for the helper test.
      initialRunContext: { kind: 'recent-files', fileIds: ['f-1'] } as never,
    });

    const args = buildCreateProjectArgsFromPluginLoopSubmit(payload, {
      name: 'Test',
      amrGatePrechecked: true,
    });

    expect(args.pluginId).toBe('od-default');
    expect(args.pluginType).toBe('official');
    expect(args.appliedPluginSnapshotId).toBe('snap-1');
    expect(args.pluginInputs).toEqual({ tone: 'concise' });
    expect(args.conversationMode).toBe('design');
    expect(args.pendingFiles).toEqual([attachment]);
    expect(args.initialRunContext).toEqual({ kind: 'recent-files', fileIds: ['f-1'] });
    expect(args.amrGatePrechecked).toBe(true);
  });

  it('omits pluginId / pluginType / snapshotId / pluginInputs / initialRunContext / conversationMode / pendingFiles when absent (no leak of undefined)', () => {
    const payload = basePayload({});

    const args = buildCreateProjectArgsFromPluginLoopSubmit(payload, {
      name: 'Test',
      amrGatePrechecked: false,
    });

    expect(args).not.toHaveProperty('pluginId');
    expect(args).not.toHaveProperty('pluginType');
    expect(args).not.toHaveProperty('appliedPluginSnapshotId');
    expect(args).not.toHaveProperty('pluginInputs');
    expect(args).not.toHaveProperty('initialRunContext');
    expect(args).not.toHaveProperty('conversationMode');
    expect(args).not.toHaveProperty('pendingFiles');
  });

  it('defaults designSystemId and skillId to null when payload omits them (the daemon treats absence as no binding)', () => {
    const payload = basePayload({}).delete
      ? basePayload({})
      : ({
          prompt: 'plain prompt',
          pluginId: null,
          appliedPluginSnapshotId: null,
          pluginTitle: null,
          taskKind: null,
        } as PluginLoopSubmit);

    const args = buildCreateProjectArgsFromPluginLoopSubmit(payload, {
      name: 'Plain',
      amrGatePrechecked: false,
    });

    expect(args.skillId).toBeNull();
    expect(args.designSystemId).toBeNull();
  });
});
