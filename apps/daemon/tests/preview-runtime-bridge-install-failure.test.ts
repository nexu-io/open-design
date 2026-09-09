//
// Red spec for a preview bridge that fails to install and is reported as
// installed anyway.
//
// The lazy bridges all latch before they work:
//
//   function installSharedBridge(){
//     if(sharedBridgeInstalled)return;
//     sharedBridgeInstalled=true;      // <- latched here
//     <bridge body>                    // <- and this can throw
//   }
//
// `applyCapabilities` calls `enable()` inside a try and only records the
// capability as active if the call returns, so the first capability to ask is
// correctly left out when the body throws. Every capability that asks
// afterwards finds the flag already set, returns immediately, and is recorded
// as active — against a bridge that never installed. The host is then told the
// document is ready to be driven for comment, inspect and draw when nothing is
// listening.
//
// `selection`, `comment`, `inspect` and `draw` share one script, so one
// throwing body mislabels three capabilities. Edit and Deck latch the same way
// in their own modules.
//
// Measured against the real bootstrap before this was fixed:
//   request selection+comment, throwing body -> applied ["comment"]
//   request selection, then selection+comment -> applied ["selection","comment"]
// In the second case both capabilities are reported live against a bridge whose
// install threw on the very first attempt.
//
// The controls are the same modules with a healthy body, which is what stops a
// fix from passing by reporting nothing at all.

import { describe, expect, it } from 'vitest';

import { buildPreviewRuntimeBootstrap } from '../src/http/preview-runtime-bootstrap.js';
import { buildSharedLazyScriptRuntimeModule } from '../src/http/preview-runtime-modules.js';

type RuntimeModuleSource = ReturnType<typeof buildSharedLazyScriptRuntimeModule>;

const IDENTITY = { protocolVersion: 1, sessionId: 's1', documentVersion: 'v1' };
const THROWING_BODY = "<script>throw new Error('bridge body blew up');</script>";
const HEALTHY_BODY = '<script>var installed=1;</script>';

interface Driver {
  apply: (requested: string[]) => string[];
}

function driveBootstrap(
  available: string[],
  modules: RuntimeModuleSource[],
): Driver {
  const html = buildPreviewRuntimeBootstrap({
    sessionId: IDENTITY.sessionId,
    documentVersion: IDENTITY.documentVersion,
    availableCapabilities: available as never,
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
  const documentStub = {
    readyState: 'complete',
    createElement: () => ({ setAttribute: () => {}, textContent: '' }),
    addEventListener: () => {},
    head: { appendChild: () => {} },
    documentElement: { appendChild: () => {} },
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'parent', 'document', 'queueMicrotask', source)(
    win, parent, documentStub, (fn: () => void) => { fn(); },
  );
  let revision = 0;
  return {
    apply: (requested) => {
      revision += 1;
      (win.__onmessage as ((event: unknown) => void))({
        source: parent,
        data: {
          ...IDENTITY,
          type: 'od:preview:set-capabilities',
          enabledCapabilities: requested,
          revision,
        },
      });
      return (posted
        .filter((message) => message.type === 'od:preview:capabilities-applied')
        .at(-1)?.enabledCapabilities ?? []) as string[];
    },
  };
}

function sharedModule(body: string): RuntimeModuleSource {
  return buildSharedLazyScriptRuntimeModule(
    ['selection', 'comment'] as never,
    body,
    'data-od-url-selection-bridge',
  );
}

describe('a lazy preview bridge whose install throws', () => {
  it('reports both capabilities when the bridge installs (control)', () => {
    const runtime = driveBootstrap(['selection', 'comment'], [sharedModule(HEALTHY_BODY)]);

    expect(runtime.apply(['selection', 'comment'])).toEqual(['selection', 'comment']);
  });

  /**
   * The defect. `selection` asks first and correctly fails; `comment` then
   * finds the flag already latched and is reported live against nothing.
   */
  it('does not report a capability that reused a failed install', () => {
    const runtime = driveBootstrap(['selection', 'comment'], [sharedModule(THROWING_BODY)]);

    expect(runtime.apply(['selection', 'comment'])).toEqual([]);
  });

  /**
   * The realistic sequence, and the worse one: the viewer negotiates the base
   * set first and opens comment mode afterwards. The failed install is by then
   * invisible, and BOTH capabilities come back live.
   */
  it('does not resurrect a failed install on a later command', () => {
    const runtime = driveBootstrap(['selection', 'comment'], [sharedModule(THROWING_BODY)]);
    expect(runtime.apply(['selection'])).toEqual([]);

    expect(runtime.apply(['selection', 'comment'])).toEqual([]);
  });
});
