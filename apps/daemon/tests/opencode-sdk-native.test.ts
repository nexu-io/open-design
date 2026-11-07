import { describe, expect, it } from 'vitest';

import { sdkEventToStreamRecords } from '../src/runtimes/opencode-sdk-events.js';
import { buildNativeSdkToolPlugin } from '../src/runtimes/opencode-sdk-plugin.js';
import { resolveOpenCodeCliDatabasePath } from '../src/runtimes/opencode-sdk-host.js';
import { opencodeAgentDef } from '../src/runtimes/defs/opencode.js';
import { byokOpenCodeAgentDef } from '../src/runtimes/defs/byok-opencode.js';

describe('native opencode SDK transport', () => {
  it('defaults to the SDK transport on the opencode family', () => {
    // CLI spawning is removed: both defs host OpenCode in-process via
    // `@opencode/sdk` with no env gate.
    expect((opencodeAgentDef as { transport?: string }).transport).toBe('sdk');
    expect((byokOpenCodeAgentDef as { transport?: string }).transport).toBe('sdk');
  });

  it('maps SDK server events onto parser records', () => {
    expect(sdkEventToStreamRecords({ type: 'step_start', sessionID: 'ses_1' })).toEqual([
      { type: 'step_start', sessionID: 'ses_1' },
    ]);
    const text = sdkEventToStreamRecords({
      type: 'message.part.updated',
      properties: { part: { type: 'text', sessionID: 'ses_1', text: 'hello' } },
    });
    expect(text).toEqual([{ type: 'text', sessionID: 'ses_1', part: { text: 'hello' } }]);

    const preview = sdkEventToStreamRecords({
      type: 'message.part.updated',
      properties: {
        part: { type: 'tool', sessionID: 'ses_1', callID: 'c1', tool: 'write', state: { status: 'running', input: { filePath: 'designs/a.html' } } },
      },
    });
    expect(preview[0]).toMatchObject({ type: 'od_opencode_tool', tool: 'write' });

    const done = sdkEventToStreamRecords({
      type: 'message.part.updated',
      properties: {
        part: { type: 'tool', sessionID: 'ses_1', callID: 'c1', tool: 'write', state: { status: 'completed', input: {}, output: 'ok' } },
      },
    });
    expect(done[0]).toMatchObject({ type: 'tool_use' });

    const err = sdkEventToStreamRecords({ type: 'session.error', properties: { message: 'boom' } });
    expect(err[0]).toMatchObject({ type: 'error' });
  });

  it('builds a native tool-events plugin', () => {
    const plugin = buildNativeSdkToolPlugin() as unknown as { id?: string };
    // Plugin.define returns an object carrying the id; at minimum it must be
    // defined and not throw at build time.
    expect(plugin).toBeDefined();
  });

  it('resolves the CLI credential database for the embedded host', () => {
    // Bare OpenCode.create() boots with an empty database (9 free models, 1
    // provider); pointing the host at the CLI database is what makes the SDK
    // catalog identical to `opencode models` (72 models, opencode +
    // opencode-go). This machine has the CLI database, so it resolves.
    const resolved = resolveOpenCodeCliDatabasePath();
    expect(resolved?.endsWith('opencode/opencode.db')).toBe(true);
    // Missing file behaves as absent so fresh machines fall back to default.
    expect(resolveOpenCodeCliDatabasePath('/nonexistent-home-od-test')).toBeNull();
  });
});
