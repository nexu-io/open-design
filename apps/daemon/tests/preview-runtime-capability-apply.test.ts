//
// Red spec for a preview runtime that reports a capability it never enabled.
//
// `applyCapabilities` in the bootstrap walks the requested capabilities and,
// for each one, calls its module's `enable()` and records it as active:
//
//   var hooks=modules[capability];
//   try {
//     if(hooks){if(shouldEnable)hooks.enable();else hooks.disable();}
//     if(shouldEnable)activeSet.add(capability);else activeSet.delete(capability);
//   } catch (_) {}
//
// The `if(hooks)` guard skips the call when no module registered for that
// capability — and then adds it to `activeSet` anyway. The document answers the
// host saying the capability is on while nothing at all is behind it, so the
// host replays the mode payload into a document that will never respond to it.
//
// A module can be missing for ordinary reasons: its registration threw, its
// source failed to evaluate, or it was omitted from the modules list for a
// document served through a different route.
//
// The first case below is the control — a capability whose module enables
// cleanly must still be reported — so a fix cannot pass by reporting nothing.

import { describe, expect, it } from 'vitest';

import { buildPreviewRuntimeBootstrap } from '../src/http/preview-runtime-bootstrap.js';

const IDENTITY = { protocolVersion: 1, sessionId: 's1', documentVersion: 'v1' };

interface RuntimeHarness {
  applied: () => string[] | undefined;
  deliver: (data: Record<string, unknown>) => void;
}

/** Evaluate the real bootstrap and drive it the way the host does. */
function runBootstrap(modules: { capabilities: string[]; source: string }[]): RuntimeHarness {
  const html = buildPreviewRuntimeBootstrap({
    sessionId: IDENTITY.sessionId,
    documentVersion: IDENTITY.documentVersion,
    availableCapabilities: ['selection', 'comment'] as never,
    modules: modules as never,
  });
  const source = html.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
  const posted: Record<string, unknown>[] = [];
  const parent = { postMessage: (message: Record<string, unknown>) => { posted.push(message); } };
  const win: Record<string, unknown> = {
    addEventListener: (type: string, fn: unknown) => {
      if (type === 'message') win.__onmessage = fn;
    },
    parent,
  };
  // The bootstrap only reads `document.readyState` to decide when to announce
  // readiness, and the modules under test touch no DOM at all. A stub keeps
  // this spec inside the daemon package's non-DOM type environment.
  const documentStub = { readyState: 'complete' };
  // eslint-disable-next-line no-new-func
  new Function('window', 'parent', 'document', 'queueMicrotask', source)(
    win, parent, documentStub, (fn: () => void) => { fn(); },
  );
  return {
    applied: () => (posted
      .filter((message) => message.type === 'od:preview:capabilities-applied')
      .at(-1)?.enabledCapabilities) as string[] | undefined,
    deliver: (data) => (win.__onmessage as ((e: unknown) => void) | undefined)?.({ source: parent, data }),
  };
}

const WORKING_SELECTION = {
  capabilities: ['selection'],
  source: "register('selection',function(){return {enable:function(){},disable:function(){}};});",
};

describe('runtime capability apply reports only what it enabled', () => {
  it('reports a capability whose module enabled cleanly (control)', () => {
    const runtime = runBootstrap([
      WORKING_SELECTION,
      {
        capabilities: ['comment'],
        source: "register('comment',function(){return {enable:function(){},disable:function(){}};});",
      },
    ]);
    runtime.deliver({
      ...IDENTITY,
      type: 'od:preview:set-capabilities',
      enabledCapabilities: ['selection', 'comment'],
    });

    expect(runtime.applied()).toEqual(['selection', 'comment']);
  });

  /**
   * The defect: nothing registered for `comment`, nothing ran, and the document
   * still tells the host it is on.
   */
  it('does not report a capability that has no module behind it', () => {
    const runtime = runBootstrap([WORKING_SELECTION]);
    runtime.deliver({
      ...IDENTITY,
      type: 'od:preview:set-capabilities',
      enabledCapabilities: ['selection', 'comment'],
    });

    expect(runtime.applied()).toEqual(['selection']);
  });

  /**
   * A module that throws on enable is already left out of the reply. Pinned so
   * the fix for the missing-module case cannot regress it into being reported.
   */
  it('does not report a capability whose module threw while enabling', () => {
    const runtime = runBootstrap([
      WORKING_SELECTION,
      {
        capabilities: ['comment'],
        source: "register('comment',function(){return {enable:function(){throw new Error('boom');},disable:function(){}};});",
      },
    ]);
    runtime.deliver({
      ...IDENTITY,
      type: 'od:preview:set-capabilities',
      enabledCapabilities: ['selection', 'comment'],
    });

    expect(runtime.applied()).toEqual(['selection']);
  });
});
