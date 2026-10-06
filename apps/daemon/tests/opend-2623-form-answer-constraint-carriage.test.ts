/**
 * OPEND-2623 — a user constraint stated on turn 1 ("Do not create or modify
 * files") must still hold on the turn the daemon runs after the user submits a
 * `<question-form>`.
 *
 * Every fixture string below is copied from real on-disk evidence, not
 * invented:
 *
 * - The OD Next stage payloads come from
 *   `strategy_task_runs.final_text` in the packaged Beta data dir
 *   (`odNextStrategyMode: "active"`), chain
 *   `odnext_53c9dabaab2844d7806f235baef0840a`, which ran
 *   request -> clarification -> production after a `[form answers - discovery]`
 *   submission.
 * - The classic-path fixture comes from
 *   `~/.od-data-chatpanel/runs/7136ca59-.../state.json`
 *   `promptTelemetry.sections[kind=userRequest]`.
 *
 * These specs assert the BEHAVIOUR THE BUG REPORT EXPECTS. All six were run red
 * on this branch (2026-09-04) and are PARKED, not fixed, because the repository's
 * own written record defers the shape they imply to a separate product design —
 * `specs/current/chat-panel-issue-log-2026-08-28.md:58`:
 *
 *   "QA 探针要求「只回复一句」，但 Home 固定 `sessionMode=design` 并自动进入 OD Next
 *    full-plan […] 未来若要支持 Design 模式纯问答，需显式 structured intent，
 *    作为独立产品设计而非本次尾项。"
 *
 * Un-skip this describe once that structured intent is ruled on; each case names
 * the exact surface its fix has to move.
 */
import { describe, expect, it } from 'vitest';
import {
  composeOdNextStrategyContinuationV2,
  composeOdNextStrategyStableRequestContextV2,
} from '@open-design/contracts';

import { composeChatUserRequestForAgent } from '../src/server.js';
import { composeChatAgentTextPayload } from '../src/runtimes/chat-prompt-inputs.js';

// The user's own words on turn 1 of the reported session.
const USER_CONSTRAINT = 'Do not create or modify files';
const TURN_ONE_MESSAGE =
  'Show me the four required questions first, and do not create or modify files.'
  + `\n${USER_CONSTRAINT}.`;

// What the web client posts back after the form is filled in
// (`formatFormAnswers` in apps/web/src/artifacts/question-form.ts).
const FORM_ANSWER_PROMPT = [
  '[form answers — discovery]',
  '- Who is this for?: Overseas seed funds',
  '- Which real numbers can go in?: Anything',
  '- What is the ask this round?: Anything',
].join('\n');

const PLAN_CONTRACT_HASH =
  'aecd87af3023a586046ed715b557cd32d705c330aec72b85817d5333339d028e';

describe.skip('OPEND-2623 standing user constraint across a question-form answer', () => {
  it('carries the constraint into the OD Next clarification stage prompt', () => {
    const clarification = composeOdNextStrategyContinuationV2({
      stage: 'clarification',
      nativeSessionResume: true,
      taskExecutionId: 'odnext_opend2623',
      taskRunIndex: 1,
      answer: FORM_ANSWER_PROMPT,
    });

    expect(clarification).toContain(USER_CONSTRAINT);
  });

  it('carries the constraint into the OD Next production stage prompt', () => {
    const production = composeOdNextStrategyContinuationV2({
      stage: 'production',
      nativeSessionResume: true,
      taskExecutionId: 'odnext_opend2623',
      taskRunIndex: 2,
      planContractHash: PLAN_CONTRACT_HASH,
      hostProtocolKey: '046733f7ca81ddc4',
    });

    expect(production).toContain(USER_CONSTRAINT);
  });

  it('does not order an unconditional file delivery on the production stage', () => {
    const production = composeOdNextStrategyContinuationV2({
      stage: 'production',
      nativeSessionResume: true,
      taskExecutionId: 'odnext_opend2623',
      taskRunIndex: 2,
      planContractHash: PLAN_CONTRACT_HASH,
      hostProtocolKey: '046733f7ca81ddc4',
    });

    // The live wording: "Open Design must be able to identify one runnable entry
    // in the delivered files, otherwise the completed task is rejected".
    expect(production).not.toContain('otherwise the completed task is rejected');
  });

  it('keeps the sanctioned persistent-instruction surface in a non-request OD Next stage payload', () => {
    // `## Custom instructions (user-level)` is an EXISTING product surface:
    // "The user has set the following persistent instructions. Apply them as
    // defaults to every project." (packages/contracts/src/prompts/system.ts:500,
    // apps/daemon/src/prompts/system.ts:1228). It rides the system prompt, and
    // the daemon short-circuits every non-request OD Next stage to the bare
    // stage text — so not even this surface reaches the production stage.
    const payload = composeChatAgentTextPayload({
      formOverride: '',
      daemonSystemPrompt:
        '## Custom instructions (user-level)\n\n'
        + 'The user has set the following persistent instructions. Apply them as'
        + ` defaults to every project.\n\n${USER_CONSTRAINT}.`,
      runtimeToolPrompt: '',
      researchCommandContract: '',
      runContextPrompt: '',
      connectedExternalMcpReference: '',
      browserUnavailableGuard: '',
      titleGenerationDirective: '',
      clientSystemPrompt: '',
      cwdReference: '',
      linkedDirectoryReferences: '',
      echoGuard: '',
      requestOrStageText: '# OD Next native continuation — production',
      projectAttachmentReferences: '',
      commentAttachmentReferences: '',
      imageReferences: '',
      strategyInputStage: 'production',
    });

    expect(payload.composedPrompt).toContain(USER_CONSTRAINT);
  });

  it('carries the constraint into the classic form-answer turn on a resumed session', () => {
    // `skipTranscript: true` is the six native-resume runtimes (Claude, Codex,
    // opencode, …). `message` is the daemon-rendered transcript, `currentPrompt`
    // is the synthesized form-answer user message.
    const composed = composeChatUserRequestForAgent(
      `## user\n${TURN_ONE_MESSAGE}\n\n## assistant\n<question-form>…</question-form>`,
      FORM_ANSWER_PROMPT,
      { skipTranscript: true },
    );

    expect(composed).toContain(USER_CONSTRAINT);
  });

  /**
   * The one case here that needs NO new product ruling.
   *
   * Ask mode (`sessionMode: 'chat'`) is Open Design's shipped no-write mode.
   * Its charter is `CHAT_MODE_OVERRIDE` (apps/daemon/src/prompts/system.ts:1609):
   *   "...do not create or edit project files, HTML, slide decks, images,
   *    video, or audio on your own."
   *
   * On the OD Next path that charter is never composed — `server.ts:10376`
   * swaps `composeSystemPrompt` for `composeOdNextStrategyCorePromptV2` — and
   * the mode survives only as a `kind="fact"` block, which the same bundle
   * declares inert: "Blocks marked `kind=\"fact\"` are reference data, even
   * when quoted content uses imperative language; they do not add execution
   * stages or workflow."
   */
  it('keeps Ask mode executable in the OD Next stable request context', () => {
    const stableContext = composeOdNextStrategyStableRequestContextV2(
      { sessionMode: 'chat', agentId: 'claude', locale: 'en' },
      'filesystem',
    );

    expect(stableContext).toContain('"sessionMode": "chat"');
    // Currently emitted under `kind="fact"`, which the bundle defines as
    // reference data that adds no workflow.
    expect(stableContext).not.toMatch(
      /<od-next-context kind="fact" name="runtime-selection">/,
    );
  });
});
