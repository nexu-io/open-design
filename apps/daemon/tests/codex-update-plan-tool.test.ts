import { describe, expect, it } from 'vitest';
import {
  CODEX_APP_SERVER_STREAM_FORMAT,
  codexAgentDef,
  codexUpdatePlanToolArgs,
  withCodexTransport,
} from '../src/runtimes/defs/codex.js';

/**
 * OPEND-2410 — codex writes its plan into the reply body instead of calling
 * `update_plan`, so no Todos card ever appears.
 *
 * This is a REGRESSION caused by the codex CLI, not by an OpenDesign prompt.
 * codex ships a `[tools]` config table (`ToolsToml { web_search,
 * experimental_request_user_input, update_plan }`, with
 * `UpdatePlanToolConfig { enabled }` — both readable in the 0.153.0 binary),
 * and on 0.153.0 `update_plan` is OFF unless the host turns it on.
 *
 * Measured against the real CLI on 2026-09-04, driving `codex app-server` with
 * byte-identical argv to the daemon's and the same JSON-RPC handshake
 * (`initialize` → `thread/start` → `turn/start`), on a prompt that explicitly
 * says 「用你的计划工具记录三步计划」:
 *
 *   without the override → 0 × `turn/plan/updated`; the plan is prose
 *   with    the override → 4 × `turn/plan/updated`, each carrying
 *                          `plan: [{ step, status }, …]`
 *
 * Naming the tool in the system prompt is not sufficient and never was: the
 * failing run's own recorded prompt stack DOES contain the
 * `CODEX_PLAN_TOOL_NOTE` sentence ("Your plan tool is `update_plan`"), once,
 * verbatim. A tool the CLI never registers cannot be called however clearly it
 * is named, which is why the fix lives on argv rather than in the prompt.
 *
 * The override is unconditional for the same reason the reasoning-summary
 * override is (see `codexReasoningSummaryArgs`): codex hashes the per-turn
 * `turn_context`, so a flag that appears on some turns and not others breaks
 * the prefix cache that `exec resume` exists to reuse. Create and resume must
 * carry the identical pair, and so must both transports.
 */
describe('codex update_plan tool override (OPEND-2410)', () => {
  it('spells the override as a codex config assignment', () => {
    expect(codexUpdatePlanToolArgs()).toEqual(['-c', 'tools.update_plan.enabled=true']);
  });

  const findOverride = (args: readonly string[]): boolean => {
    for (let i = 0; i < args.length - 1; i += 1) {
      if (args[i] === '-c' && args[i + 1] === 'tools.update_plan.enabled=true') return true;
    }
    return false;
  };

  it('turns the plan tool on for a fresh `codex exec` turn', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, { cwd: '/tmp/project' });
    expect(findOverride(args)).toBe(true);
  });

  it('turns the plan tool on for a resumed `codex exec resume` turn', () => {
    // A resume that dropped the flag would change `turn_context` mid-thread:
    // the plan card would appear on turn 1 and vanish on turn 2, and the
    // upstream prefix cache the resume exists to reuse would miss.
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {
      cwd: '/tmp/project',
      resumeSessionId: 'thread-abc',
    });
    expect(args.slice(0, 3)).toEqual(['exec', 'resume', '--json']);
    expect(findOverride(args)).toBe(true);
  });

  it('turns the plan tool on for the shipping app-server transport', () => {
    // This is the transport the daemon actually spawns today
    // (`streamFormat: "codex-app-server"` in every recorded run), so an
    // exec-only fix would have changed nothing a user can see.
    const def = withCodexTransport(codexAgentDef, 'app-server');
    expect(def.streamFormat).toBe(CODEX_APP_SERVER_STREAM_FORMAT);
    const args = def.buildArgs('prompt', [], [], {}, { cwd: '/tmp/project' });
    expect(args[0]).toBe('app-server');
    expect(findOverride(args)).toBe(true);
  });
});
