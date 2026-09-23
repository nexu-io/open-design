import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isTodoWriteToolName } from '@open-design/contracts';

import { composeSystemPrompt } from '../../src/prompts/system.js';

/**
 * The plan step must name the plan tool the RUNNING runtime actually has.
 *
 * What this suite proves: the composed system prompt, for a given runtime,
 * contains that runtime's real plan-tool name.
 *
 * What it does NOT prove: that the model then calls the tool. Prompt text is
 * the only falsifiable half of a prompt-level defect; model compliance is not
 * a property a unit test can pin.
 *
 * It also does not re-prove the translation each named tool goes through on
 * its way to the Todos card — the daemon REWRITES the tool name for two of
 * the three families (`emitCanonicalTaskSnapshot` folds Claude's
 * `TaskCreate`/`TaskUpdate` into `TodoWrite`; `emitCodexTodoList` does the
 * same for codex's `todo_list` frames), so the name the model calls is not
 * the name the host predicate ever sees. Those translations are owned by
 * `tests/runtimes/json-event-stream.test.ts` and the claude-stream suites.
 * The one family where the name passes through verbatim is opencode, and
 * that case IS asserted below.
 *
 * Why it exists — production evidence (2026-09-03, packaged beta,
 * `home-auto-send-1ih85ax6e35bp-assistant`, agent `codex`, session_mode
 * `design`): the user's prompt ended with an explicit 「先用 todo 进行一轮规划」.
 * The turn complied, made three tool calls (Bash + two web_search), emitted no
 * TodoWrite snapshot at all, and put its seven-item plan in the reply body as
 * 「现。Todo：1. …」. Codex has a plan tool (`update_plan`) and the daemon
 * already reduces it into a canonical TodoWrite snapshot in BOTH transports —
 * `handleTurnPlan` (`turn/plan/updated`) on app-server, `emitCodexTodoList`
 * (`todo_list` items) on exec-json. Nothing in the wiring was broken. What the
 * prompt gave codex was the slim charter's generic sentence, which offers
 * "Otherwise, provide a numbered plan in your response" as a sanctioned branch
 * and never names the tool codex has. Prose was the compliant reading.
 */

const BASE = {
  metadata: { kind: 'other' as const },
  executionProfile: 'filesystem' as const,
  promptCoreVariant: 'slim' as const,
};

/**
 * Runtime → the plan-tool name the agent must be told to call.
 *
 * Each entry is evidence-backed, not inferred from a family resemblance:
 *  - claude  `TodoWrite` / `TaskCreate` + `TaskUpdate` — measured on Claude
 *            Code 2.1.247 (see `applyClaudeTaskToolEnv` in runtimes/env.ts).
 *  - codex   `update_plan` — named as codex's plan tool by the canonical
 *            `TODO_TOOL_NAME_RE` and by `tool-kind.ts`; its frames arrive as
 *            `turn/plan/updated` / `todo_list` and are translated to
 *            `TodoWrite` by the daemon.
 *  - opencode `todowrite` — verbatim from a recorded production trace,
 *            `mocks/golden/9a9522ec-…events.json` (`"name": "todowrite"`,
 *            items shaped `{content, status: 'in_progress' | 'pending'}`).
 */
const RUNTIME_PLAN_TOOLS: ReadonlyArray<{
  label: string;
  agentId: string;
  streamFormat: string;
  tools: readonly string[];
  /**
   * True when the runtime's parser forwards the agent's tool name unchanged,
   * so the host's canonical predicate is what decides whether the call draws
   * a Todos card. False when the daemon rewrites the name first.
   */
  nameReachesHostVerbatim: boolean;
}> = [
  {
    label: 'claude',
    agentId: 'claude',
    streamFormat: 'claude-stream-json',
    tools: ['TodoWrite', 'TaskCreate', 'TaskUpdate'],
    nameReachesHostVerbatim: false,
  },
  {
    label: 'codex (exec-json transport)',
    agentId: 'codex',
    streamFormat: 'json-event-stream',
    tools: ['update_plan'],
    nameReachesHostVerbatim: false,
  },
  {
    label: 'codex (app-server transport, shipping default)',
    agentId: 'codex',
    streamFormat: 'codex-app-server',
    tools: ['update_plan'],
    nameReachesHostVerbatim: false,
  },
  {
    label: 'opencode',
    agentId: 'opencode',
    streamFormat: 'json-event-stream',
    tools: ['todowrite'],
    nameReachesHostVerbatim: true,
  },
  {
    label: 'byok-opencode',
    agentId: 'byok-opencode',
    streamFormat: 'json-event-stream',
    tools: ['todowrite'],
    nameReachesHostVerbatim: true,
  },
];

describe('plan-tool note — names the running runtime’s own plan tool', () => {
  for (const runtime of RUNTIME_PLAN_TOOLS) {
    it(`${runtime.label}: the prompt names its plan tool`, () => {
      const prompt = composeSystemPrompt({
        ...BASE,
        agentId: runtime.agentId,
        streamFormat: runtime.streamFormat,
      });
      expect(prompt).toContain('Your plan tool is');
      for (const tool of runtime.tools) {
        expect(prompt, `${runtime.label} must be told to call \`${tool}\``)
          .toContain(`\`${tool}\``);
      }
    });

    if (runtime.nameReachesHostVerbatim) {
      it(`${runtime.label}: the named tool reaches the Todos card`, () => {
        // This parser forwards the agent's own tool name, so the host's
        // canonical predicate is the last gate. Naming a tool it rejects
        // would point the model at a call that renders as an ordinary tool
        // row — the same invisible plan the prose branch produces, one
        // layer down.
        for (const tool of runtime.tools) {
          expect(isTodoWriteToolName(tool), `${tool} must be a recognised snapshot tool`)
            .toBe(true);
        }
      });
    }
  }

  it('a runtime with no plan tool gets no note (plain stream / API mode)', () => {
    const prompt = composeSystemPrompt({
      ...BASE,
      agentId: 'deepseek',
      streamFormat: 'plain',
    });
    expect(prompt).not.toContain('Your plan tool is');
  });
});

/**
 * The `todo-write` atom body is the OTHER place a plan is requested.
 *
 * `ensureCoreQualityStages` guarantees a `plan: ['todo-write']` stage on every
 * plugin/template pipeline that produces a design artifact, and
 * `loadAtomBodies` inlines this file's body (frontmatter stripped) straight
 * into the system prompt. So on a plugin run it sits in the same prompt as the
 * runtime note above — and it used to end with "the agent is free to use
 * TodoWrite (Claude Code) or an in-prompt list", which both names a tool codex
 * and opencode do not have and re-opens the prose branch the note just closed.
 *
 * This is a SECOND site, not the one the 2026-09-03 incident turn hit: that
 * conversation carried no applied plugin snapshot, so this body was not in its
 * prompt. It is fixed here because leaving it would let a plugin run contradict
 * the note in the same document.
 */
describe('todo-write atom body — no prose escape hatch', () => {
  const atomBody = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../plugins/_official/atoms/todo-write/SKILL.md',
    ),
    'utf8',
  );

  it('does not sanction an in-prose plan as an equivalent', () => {
    expect(atomBody).not.toContain('in-prompt list');
  });

  it('does not name one runtime’s plan tool as if it were every runtime’s', () => {
    // The body is injected verbatim for codex / opencode / ACP runs too, none
    // of which have a tool called TodoWrite.
    expect(atomBody).not.toContain('TodoWrite (Claude Code)');
  });

  it('still asks for a plan before any artifact file is written', () => {
    // The atom's whole reason to exist. Removing the escape hatch must not
    // remove the instruction it was attached to.
    expect(atomBody).toContain('Before writing any artifact files');
  });
});
