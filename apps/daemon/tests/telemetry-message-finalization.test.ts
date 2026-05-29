import { describe, expect, it, vi } from 'vitest';

import {
  FORM_ANSWERED_GENERIC_OVERRIDE,
  composeChatUserRequestForAgent,
  createFinalizedMessageTelemetryReporter,
  shouldReportRunCompletedFromMessage,
  telemetryPromptFromRunRequest,
} from '../src/server.js';

describe('Langfuse message finalization gate', () => {
  const terminalMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'final answer',
    runId: 'run-1',
    runStatus: 'succeeded',
  };

  it('does not report when only terminal runStatus has been persisted', () => {
    expect(
      shouldReportRunCompletedFromMessage(terminalMessage, {
        ...terminalMessage,
      }),
    ).toBe(false);
  });

  it('reports only on the final telemetry-marked message write', () => {
    expect(
      shouldReportRunCompletedFromMessage(terminalMessage, {
        ...terminalMessage,
        producedFiles: [],
        telemetryFinalized: true,
      }),
    ).toBe(true);
  });

  it('ignores non-terminal run statuses even if marked finalized', () => {
    expect(
      shouldReportRunCompletedFromMessage(
        { ...terminalMessage, runStatus: 'running' },
        { telemetryFinalized: true },
      ),
    ).toBe(false);
  });

  it('uses the explicit current prompt for telemetry instead of the full transcript', () => {
    expect(
      telemetryPromptFromRunRequest(
        '## user\npre-consent brief\n\n## assistant\ndraft\n\n## user\npost-consent revision',
        'post-consent revision',
      ),
    ).toBe('post-consent revision');
  });

  it('falls back to the legacy message when currentPrompt is absent', () => {
    expect(telemetryPromptFromRunRequest('legacy prompt', undefined)).toBe(
      'legacy prompt',
    );
  });

  it('promotes discovery form answers above the transcript with a build-now instruction', () => {
    const currentPrompt = [
      '[form answers \u2014 discovery]',
      '- output: Dashboard / tool UI',
      '- brand: Pick a direction for me [value: pick_direction]',
    ].join('\n');
    const prompt = composeChatUserRequestForAgent(
      '## user\ninitial brief\n\n## assistant\n<form/>',
      currentPrompt,
    );

    expect(prompt).toContain('## Latest user turn - form answers submitted');
    expect(prompt).toContain(currentPrompt);
    expect(prompt).toContain('The user has answered the discovery form.');
    expect(prompt).toContain('For Branch B answers, build now instead of asking another brief.');
    expect(prompt.indexOf('## Full conversation transcript')).toBeGreaterThan(
      prompt.indexOf(currentPrompt),
    );
  });

  it('task-type form answers trigger the build transition just like discovery', () => {
    const prompt = composeChatUserRequestForAgent(
      '## user\ninitial brief',
      '[form answers - task-type]\n- taskType: Slide deck',
    );

    expect(prompt).toContain('The user has answered the task-type form.');
    expect(prompt).toContain('build now instead of asking another brief');
    expect(prompt).not.toContain('Treat these form answers as the active user turn');
  });

  it('unknown form ids get the generic transition without forcing the build', () => {
    const prompt = composeChatUserRequestForAgent(
      '## user\ninitial brief',
      '[form answers - preferences]\n- theme: dark',
    );

    expect(prompt).toContain('The user has answered the preferences form.');
    expect(prompt).toContain('Treat these form answers as the active user turn');
    expect(prompt).not.toContain('build now instead of asking another brief');
  });

  // `agy -c` carries its own conversation memory, so packing the
  // rendered web transcript (the `## user` / `## assistant` blocks)
  // into the user request duplicates context the upstream CLI already
  // has — AND the embedded copy includes the literal `<question-form>`
  // markup the agent emitted on turn 1, which the model then re-emits
  // on turn 2, looking like the discovery form loop never breaks.
  // With `skipTranscript: true`, only the latest user turn ships and
  // the misleading "## Full conversation transcript" header is dropped.
  it('drops the transcript and transcript header when skipTranscript is true', () => {
    const currentPrompt = [
      '[form answers — discovery]',
      '- output: Dashboard / tool UI',
      '- brand: Pick a direction for me [value: pick_direction]',
    ].join('\n');
    const transcript = [
      '## user',
      '初始需求',
      '',
      '## assistant',
      '<question-form id="discovery">…</question-form>',
      '',
      '## user',
      currentPrompt,
    ].join('\n');

    const prompt = composeChatUserRequestForAgent(transcript, currentPrompt, {
      skipTranscript: true,
    });

    // The form-answer transition still fires — that drives RULE 2 / 3.
    expect(prompt).toContain('The user has answered the discovery form.');
    // The latest user turn is preserved verbatim.
    expect(prompt).toContain(currentPrompt);
    // The transcript header is dropped — it was misleading because the
    // body underneath is no longer a transcript.
    expect(prompt).not.toContain('## Full conversation transcript');
    // The prior assistant turn's `<question-form>` markup must NOT
    // leak in — that's the form-loop regression we're guarding.
    // (The transition block legitimately mentions "<question-form>"
    // in prose, so the assertion targets the opening tag the prior
    // turn carried, not the bare substring.)
    expect(prompt).not.toContain('<question-form id="discovery">');
    expect(prompt).not.toContain('## assistant');
  });

  // The aggressive form-answered OVERRIDE block is what tells weak
  // plain agents (GPT-OSS-120B Medium, Gemini 3.5 Flash) to skip
  // RULE 1's form example on follow-up turns. We pin the trigger
  // condition AND the specific anti-patterns the literal carries,
  // because silently weakening any of them — e.g. dropping the
  // markdown-fence ban or the "subagents stopped" hallucination ban —
  // reintroduces the form-echo regression we hit in PR #3157 on GPT-OSS.
  it('FORM_ANSWERED_SYSTEM_OVERRIDE pins the anti-patterns weak plain agents need spelled out', async () => {
    const { FORM_ANSWERED_SYSTEM_OVERRIDE } = await import('../src/server.js');

    // Headline must call out that this is a follow-up turn, not turn 1.
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('## OVERRIDE — form already answered');
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('turn 2 or later');
    // RULE 1 stays in the prompt so turn 1 can still emit a valid form;
    // OVERRIDE just demotes it to documentation for follow-up turns.
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('Treat RULE 1\nas read-only documentation');

    // Forbidden anti-patterns observed in real captures:
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('`<question-form>` tag of any id');
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('```json fenced block');
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('Form-asking prose');
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('"subagents stopped"');

    // Required path: route to RULE 2 / RULE 3 so the model still
    // emits the `<artifact>` block on the same turn.
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('RULE 2');
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('RULE 3');
    expect(FORM_ANSWERED_SYSTEM_OVERRIDE).toContain('`<artifact>`');
  });

  it('FORM_ANSWERED_GENERIC_OVERRIDE is used for non-discovery/task-type form ids', () => {
    // Non-build-transition forms should get a smaller override that only
    // suppresses re-asking — not the RULE 2 / RULE 3 / artifact directive.
    expect(FORM_ANSWERED_GENERIC_OVERRIDE).toContain('## OVERRIDE — form already answered');
    expect(FORM_ANSWERED_GENERIC_OVERRIDE).toContain('turn 2 or later');
    expect(FORM_ANSWERED_GENERIC_OVERRIDE).toContain('Do not ask the same form again');
    // Must NOT contain the artifact-build directive that only applies to
    // discovery / task-type — sending it for an unrelated form id would give
    // the model contradictory instructions.
    expect(FORM_ANSWERED_GENERIC_OVERRIDE).not.toContain('RULE 2');
    expect(FORM_ANSWERED_GENERIC_OVERRIDE).not.toContain('RULE 3');
    expect(FORM_ANSWERED_GENERIC_OVERRIDE).not.toContain('`<artifact>`');
  });

  it('FORM_ANSWERED_SYSTEM_OVERRIDE only fires through composeChatUserRequestForAgent\'s transition gate', async () => {
    // Defense-in-depth check: a turn that is NOT a form-answer follow-up
    // (no `[form answers — …]` header in `currentPrompt`) must not
    // surface any of the OVERRIDE language, even when `message` carries
    // a transcript that mentions question-form. Otherwise we'd suppress
    // the legitimate turn-1 form ask.
    const transcript = '## user\n初始需求\n\n## assistant\n<question-form id="discovery">...</question-form>';
    const currentPrompt = '继续做点修改';

    const prompt = composeChatUserRequestForAgent(transcript, currentPrompt);
    expect(prompt).not.toContain('OVERRIDE — form already answered');
    expect(prompt).not.toContain('Treat RULE 1');
  });

  it('also drops the transcript on a non-form turn when skipTranscript is true', () => {
    // Without a form-answer transition, the function previously returned
    // `message` verbatim. With skipTranscript the body must come from
    // `currentPrompt` instead so a follow-up `agy -c` turn doesn't carry
    // the duplicate transcript.
    const transcript = '## user\n第一轮\n\n## assistant\n回答\n\n## user\n第二轮 follow-up';
    const currentPrompt = '第二轮 follow-up';

    const skipped = composeChatUserRequestForAgent(transcript, currentPrompt, {
      skipTranscript: true,
    });
    expect(skipped).toBe(currentPrompt);

    // Default behavior unchanged (backward compatibility for every
    // adapter that doesn't set resumesSessionViaCli).
    const kept = composeChatUserRequestForAgent(transcript, currentPrompt);
    expect(kept).toBe(transcript);
  });

  it('invokes Langfuse reporting once when the final message write is marked', () => {
    const run = {
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      status: 'succeeded',
      createdAt: 1,
      updatedAt: 2,
      events: [],
    };
    const report = vi.fn();
    const reporter = createFinalizedMessageTelemetryReporter({
      design: { runs: { get: vi.fn(() => run) } },
      db: 'db',
      dataDir: '/tmp/od-data',
      reportedRuns: new Set<string>(),
      getAppVersion: () => ({ version: '0.7.0', channel: 'beta', packaged: true }),
      report,
    });

    reporter(
      { ...terminalMessage, endedAt: 1234 },
      { telemetryFinalized: true },
    );
    reporter(
      { ...terminalMessage, endedAt: 1234 },
      { telemetryFinalized: true },
    );

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      db: 'db',
      dataDir: '/tmp/od-data',
      run,
      persistedRunStatus: 'succeeded',
      persistedEndedAt: 1234,
      appVersion: { version: '0.7.0', channel: 'beta', packaged: true },
    });
  });
});
