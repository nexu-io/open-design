import { test } from 'vitest';
import {
  assert, claude, codex, copilot, cursorAgent, deepseek, devin, detectAgents, gemini, join, kilo, kiro, mkdtempSync, opencode, pi, qoder, rmSync, spawnEnvForAgent, tmpdir, vibe, writeFileSync, chmodSync,
} from './helpers/test-helpers.js';
import type { TestAgentDef } from './helpers/test-helpers.js';

test('cursor-agent args deliver prompts via stdin without passing a literal dash prompt', () => {
  const args = cursorAgent.buildArgs(
    '',
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.deepEqual(args, [
    '--print',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--force',
    '--trust',
    '--workspace',
    '/tmp/od-project',
  ]);
});

test('opencode args deliver prompts via stdin without passing a literal dash prompt', () => {
  const prompt = 'design a dashboard';
  const baseArgs = opencode.buildArgs(prompt, [], [], {});
  assert.equal(opencode.promptViaStdin, true);
  assert.equal(baseArgs.includes('-'), false);
  assert.equal(baseArgs.includes(prompt), false);
  assert.deepEqual(baseArgs, [
    'run',
    '--format',
    'json',
    '--dangerously-skip-permissions',
  ]);

  const withModel = opencode.buildArgs(
    prompt,
    [],
    [],
    { model: 'anthropic/claude-sonnet-4-5' },
  );
  assert.deepEqual(withModel, [
    'run',
    '--format',
    'json',
    '--dangerously-skip-permissions',
    '--model',
    'anthropic/claude-sonnet-4-5',
  ]);
});

// Copilot reads the prompt from stdin when `-p` is omitted entirely
// (upstream copilot-cli issue #1046, confirmed working as
// `echo "..." | copilot --model <id>`). The earlier `-p -` attempt
// was a dead end because Copilot takes `-` as a literal one-character
// prompt; omitting `-p` is a separate code path that does delegate to
// stdin under a non-TTY pipe. Pin `promptViaStdin: true` and the
// stdin-only argv shape so a future refactor can't silently bring
// `-p <prompt>` back and reintroduce the Windows ENAMETOOLONG
// regression (issue #705).
test('copilot delivers the prompt via stdin (no -p, no prompt body in argv)', () => {
  const prompt = 'design a landing page';
  const baseArgs = copilot.buildArgs(prompt, [], [], {});
  assert.equal(copilot.promptViaStdin, true);
  assert.ok(
    !baseArgs.includes('-p'),
    'copilot argv must not include -p; the prompt rides stdin',
  );
  assert.ok(
    !baseArgs.includes(prompt),
    'copilot argv must not include the prompt body; it rides stdin',
  );
  assert.deepEqual(baseArgs, [
    '--allow-all-tools',
    '--output-format',
    'json',
  ]);
});

test('copilot args append model and extra dirs after the base flags without reintroducing -p', () => {
  const prompt = 'design a landing page';
  const args = copilot.buildArgs(
    prompt,
    [],
    ['/tmp/od-skills', '/tmp/od-design-systems'],
    { model: 'claude-sonnet-4.6' },
  );
  assert.ok(!args.includes('-p'));
  assert.ok(!args.includes(prompt));
  assert.deepEqual(args, [
    '--allow-all-tools',
    '--output-format',
    'json',
    '--model',
    'claude-sonnet-4.6',
    '--add-dir',
    '/tmp/od-skills',
    '--add-dir',
    '/tmp/od-design-systems',
  ]);
});

test('copilot drops empty / non-string entries from extraAllowedDirs without reintroducing -p', () => {
  const prompt = 'design a landing page';
  const args = copilot.buildArgs(
    prompt,
    [],
    ['', null, '/tmp/od-skills', undefined] as unknown as string[],
    {},
  );
  assert.ok(!args.includes('-p'));
  // Only the one valid path survives.
  const addDirIndex = args.indexOf('--add-dir');
  assert.equal(args[addDirIndex + 1], '/tmp/od-skills');
  assert.equal(args.filter((a) => a === '--add-dir').length, 1);
});

// Mirror of the Claude Code 200_000-char synthetic-prompt guard: even
// when the composed prompt is large enough to blow the Windows
// CreateProcess command-line cap (~32 KB direct, ~8 KB through a `.cmd`
// shim), no argv entry must ever carry the prompt body. This is the
// structural assertion that the issue #705 fix can't quietly regress.
test('copilot flags promptViaStdin and never embeds the prompt in argv', () => {
  assert.equal(copilot.promptViaStdin, true);

  const longPrompt = 'x'.repeat(200_000);
  const args = copilot.buildArgs(longPrompt, [], [], {});

  assert.ok(Array.isArray(args), 'copilot.buildArgs must return argv');
  assert.equal(
    args.includes(longPrompt),
    false,
    'prompt must not appear in argv',
  );
  for (const arg of args) {
    assert.ok(
      typeof arg === 'string' && arg.length < 1000,
      `no argv entry should carry the prompt body (saw length ${arg.length})`,
    );
  }
});

test('kiro args use acp subcommand for json-rpc streaming', () => {
  const args = kiro.buildArgs('', [], [], {});

  assert.deepEqual(args, ['acp']);
  assert.equal(kiro.streamFormat, 'acp-json-rpc');
});

test('devin args use acp subcommand for json-rpc streaming', () => {
  const args = devin.buildArgs('', [], [], {});

  assert.deepEqual(args, [
    '--permission-mode',
    'dangerous',
    '--respect-workspace-trust',
    'false',
    'acp',
  ]);
  assert.equal(devin.streamFormat, 'acp-json-rpc');
});

test('pi args use rpc mode without --no-session and append model/thinking options', () => {
  const baseArgs = pi.buildArgs('', [], [], {}, {});

  assert.deepEqual(baseArgs, ['--mode', 'rpc']);
  assert.ok(!baseArgs.includes('--no-session'), 'pi must not pass --no-session');
  assert.equal(pi.promptViaStdin, true);
  assert.equal(pi.streamFormat, 'pi-rpc');
  assert.equal(pi.supportsImagePaths, true);

  const withModel = pi.buildArgs('', [], [], { model: 'anthropic/claude-sonnet-4-5' }, {});
  assert.deepEqual(withModel, [
    '--mode',
    'rpc',
    '--model',
    'anthropic/claude-sonnet-4-5',
  ]);

  const withThinking = pi.buildArgs('', [], [], { reasoning: 'high' }, {});
  assert.deepEqual(withThinking, [
    '--mode',
    'rpc',
    '--thinking',
    'high',
  ]);
});

test('pi args forward extraAllowedDirs as --append-system-prompt flags', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills', '/tmp/design-systems'],
    {},
    {},
  );

  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--append-system-prompt',
    '/tmp/skills',
    '--append-system-prompt',
    '/tmp/design-systems',
  ]);
});

test('pi args filter relative paths from extraAllowedDirs', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills', 'relative/path', '/tmp/design-systems'],
    {},
    {},
  );

  // Relative paths should be filtered out.
  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--append-system-prompt',
    '/tmp/skills',
    '--append-system-prompt',
    '/tmp/design-systems',
  ]);
});

test('pi args combine model, thinking, and extraAllowedDirs', () => {
  const args = pi.buildArgs(
    '',
    [],
    ['/tmp/skills'],
    { model: 'openai/gpt-5', reasoning: 'medium' },
    {},
  );

  assert.deepEqual(args, [
    '--mode',
    'rpc',
    '--model',
    'openai/gpt-5',
    '--thinking',
    'medium',
    '--append-system-prompt',
    '/tmp/skills',
  ]);
});

test('gemini args avoid version-fragile trust flags', () => {
  const args = gemini.buildArgs('', [], [], {});

  assert.deepEqual(args, ['--output-format', 'stream-json', '--yolo']);
  assert.equal(args.includes('--skip-trust'), false);
  assert.deepEqual(gemini.env, { GEMINI_CLI_TRUST_WORKSPACE: 'true' });
});

test('gemini args preserve custom model selection', () => {
  const args = gemini.buildArgs('', [], [], { model: 'gemini-2.5-pro' });

  assert.deepEqual(args, [
    '--output-format',
    'stream-json',
    '--yolo',
    '--model',
    'gemini-2.5-pro',
  ]);
});

test('gemini picker exposes the Gemini 3 previews and 2.5 family in priority order', () => {
  // Pin the picker contents and ordering so the Settings UI cannot be
  // silently reshaped by a future edit to AGENT_DEFS. Gemini also accepts
  // arbitrary custom ids, which makes it especially easy for a regression
  // here to slip through manual QA. Issue #981.
  assert.deepEqual(gemini.fallbackModels.map((m) => m.id), [
    'default',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ]);
});

test('qoder entry uses qodercli with stream-json stdin delivery and tier model hints', () => {
  assert.equal(qoder.name, 'Qoder CLI');
  assert.equal(qoder.bin, 'qodercli');
  assert.deepEqual(qoder.versionArgs, ['--version']);
  assert.equal(qoder.promptViaStdin, true);
  assert.equal(qoder.streamFormat, 'qoder-stream-json');
  assert.deepEqual(qoder.fallbackModels.map((m) => m.id), [
    'default',
    'lite',
    'efficient',
    'auto',
    'performance',
    'ultimate',
  ]);
});

test('qoder args use non-interactive print mode with cwd, model, and add-dir', () => {
  const args = qoder.buildArgs(
    'prompt must not appear in argv',
    ['/tmp/uploads/logo.png', '/tmp/uploads/hero concept.png'],
    [
      '/repo/skills',
      '',
      null as unknown as string,
      './relative-skills',
      'relative-design-systems',
      '/repo/design-systems',
    ],
    { model: 'performance' },
    { cwd: '/tmp/od-project' },
  );

  assert.deepEqual(args, [
    '-p',
    '--output-format',
    'stream-json',
    '--yolo',
    '-w',
    '/tmp/od-project',
    '--model',
    'performance',
    '--add-dir',
    '/repo/skills',
    '--add-dir',
    '/repo/design-systems',
    '--attachment',
    '/tmp/uploads/logo.png',
    '--attachment',
    '/tmp/uploads/hero concept.png',
  ]);
  assert.equal(args.includes('prompt must not appear in argv'), false);
  assert.equal(args.includes('./relative-skills'), false);
  assert.equal(args.includes('relative-design-systems'), false);
});

test('qoder args omit default model and cwd when absent', () => {
  const args = qoder.buildArgs('', [], [], { model: 'default' }, {});

  assert.deepEqual(args, [
    '-p',
    '--output-format',
    'stream-json',
    '--yolo',
  ]);
  assert.equal(args.includes('--model'), false);
  assert.equal(args.includes('-w'), false);
});

test('qoder args omit empty, non-string, and relative add-dir entries', () => {
  const args = qoder.buildArgs('', [], [
    '',
    null as unknown as string,
    undefined as unknown as string,
    42 as unknown as string,
    './skills',
    'design-systems',
  ]);

  assert.equal(args.includes('--add-dir'), false);
});

test('qoder args omit empty, non-string, and relative image attachment entries', () => {
  const args = qoder.buildArgs('', [
    '',
    null as unknown as string,
    undefined as unknown as string,
    42 as unknown as string,
    './uploads/logo.png',
    'uploads/hero.png',
    '/tmp/uploads/logo.png',
  ], []);

  assert.deepEqual(
    args.filter((arg) => arg === '--attachment').length,
    1,
  );
  assert.ok(args.includes('/tmp/uploads/logo.png'));
  assert.equal(args.includes('./uploads/logo.png'), false);
  assert.equal(args.includes('uploads/hero.png'), false);
});

test('qoder adapter inherits QODER_PERSONAL_ACCESS_TOKEN from daemon env', () => {
  const env = spawnEnvForAgent('qoder', {
    QODER_PERSONAL_ACCESS_TOKEN: 'qoder-pat',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal(env.QODER_PERSONAL_ACCESS_TOKEN, 'qoder-pat');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

test('qoder adapter does not define static secret env', () => {
  assert.equal(
    (qoder as TestAgentDef & { env?: Record<string, string> }).env?.QODER_PERSONAL_ACCESS_TOKEN,
    undefined,
  );
});

test('detectAgents keeps qoder unavailable with fallback metadata when qodercli is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-agents-empty-'));
  try {
    process.env.OD_AGENT_HOME = dir;
    process.env.PATH = dir;

    const agents = await detectAgents();
    const detected = agents.find((agent) => agent.id === 'qoder');

    assert.ok(detected);
    assert.equal(detected.available, false);
    assert.equal(detected.bin, 'qodercli');
    assert.deepEqual(detected.models.map((m: { id: string }) => m.id), [
      'default',
      'lite',
      'efficient',
      'auto',
      'performance',
      'ultimate',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('kiro fetchModels falls back to fallbackModels when detection fails', async () => {
  // fetchModels rejects when the binary doesn't exist; the daemon's
  // probe() catches this and uses fallbackModels instead.
  assert.ok(kiro.fetchModels, 'kiro must define fetchModels');
  const result = await kiro
    .fetchModels('/nonexistent/kiro-cli', {})
    .catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(kiro.fallbackModels));
  const fallbackModel = kiro.fallbackModels[0];
  assert.ok(fallbackModel);
  assert.equal(fallbackModel.id, 'default');
});

test('kilo args use acp subcommand for json-rpc streaming', () => {
  const args = kilo.buildArgs('', [], [], {});

  assert.deepEqual(args, ['acp']);
  assert.equal(kilo.streamFormat, 'acp-json-rpc');
});

test('kilo fetchModels falls back to fallbackModels when detection fails', async () => {
  assert.ok(kilo.fetchModels, 'kilo must define fetchModels');
  const result = await kilo.fetchModels('/nonexistent/kilo', {}).catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(kilo.fallbackModels));
  const fallbackModel = kilo.fallbackModels[0];
  assert.ok(fallbackModel);
  assert.equal(fallbackModel.id, 'default');
  assert.equal(kilo.fallbackModels.length, 1);
});

// ---- reasoning-effort clamp ------------------------------------------------
// Drives clampCodexReasoning through the public buildArgs surface so the
// helper stays non-exported. The wire-level `-c model_reasoning_effort="..."`
// flag is what the codex CLI (and ultimately OpenAI) actually sees.

test('codex buildArgs clamps reasoning effort per model', () => {
  const cases: Array<[string | undefined, string, string]> = [
    // [model, reasoning, expected wire-level effort]
    // gpt-5.5 family (and unknown / 'default' which we treat as 5.5):
    // minimal -> low, others pass through.
    [undefined, 'minimal', 'low'],
    ['default', 'minimal', 'low'],
    ['gpt-5.2', 'minimal', 'low'],
    ['gpt-5.3', 'minimal', 'low'],
    ['gpt-5.4', 'minimal', 'low'],
    ['gpt-5.5', 'minimal', 'low'],
    ['gpt-5.5', 'low', 'low'],
    ['gpt-5.5', 'medium', 'medium'],
    ['gpt-5.5', 'high', 'high'],
    ['vendor/gpt-5.5-foo', 'minimal', 'low'], // path-style id
    // gpt-5.1: xhigh isn't supported, others pass through.
    ['gpt-5.1', 'xhigh', 'high'],
    ['gpt-5.1', 'high', 'high'],
    // gpt-5.1-codex-mini: caps at medium / high only.
    ['gpt-5.1-codex-mini', 'minimal', 'medium'],
    ['gpt-5.1-codex-mini', 'low', 'medium'],
    ['gpt-5.1-codex-mini', 'medium', 'medium'],
    ['gpt-5.1-codex-mini', 'high', 'high'],
    ['gpt-5.1-codex-mini', 'xhigh', 'high'],
    // Unknown / future families: pass through; let the API surface its error
    // as the signal a new rule belongs in clampCodexReasoning.
    ['gpt-6', 'minimal', 'minimal'],
  ];
  for (const [model, reasoning, expected] of cases) {
    const args = codex.buildArgs(
      '',
      [],
      [],
      { ...(model === undefined ? {} : { model }), reasoning },
      { cwd: '/tmp/od-project' },
    );
    assert.ok(
      args.includes(`model_reasoning_effort="${expected}"`),
      `(model=${model ?? '<none>'}, reasoning=${reasoning}) → expected ${expected}; args=${JSON.stringify(args)}`,
    );
  }
});

test('codex buildArgs omits model_reasoning_effort when reasoning is "default"', () => {
  const args = codex.buildArgs(
    '',
    [],
    [],
    { reasoning: 'default' },
    { cwd: '/tmp/od-project' },
  );

  assert.equal(
    args.some(
      (a) => typeof a === 'string' && a.startsWith('model_reasoning_effort='),
    ),
    false,
  );
});

test('claude flags promptViaStdin and never embeds the prompt in argv', () => {
  // Long composed prompts (system prompt + design system + skill body +
  // user message) routinely exceed Linux MAX_ARG_STRLEN (~128 KB) and the
  // Windows CreateProcess command-line cap (~32 KB direct, ~8 KB via .cmd
  // shim). The fix is to deliver the prompt on stdin instead of argv —
  // these assertions guard that contract.
  assert.equal(claude.promptViaStdin, true);

  const longPrompt = 'x'.repeat(200_000);
  const args = claude.buildArgs(
    longPrompt,
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );

  assert.ok(Array.isArray(args), 'claude.buildArgs must return argv');
  assert.equal(
    args.includes(longPrompt),
    false,
    'prompt must not appear in argv',
  );
  for (const arg of args) {
    assert.ok(
      typeof arg === 'string' && arg.length < 1000,
      `no argv entry should carry the prompt body (saw length ${arg.length})`,
    );
  }
  // `-p` (print mode) must still be present; without it claude drops into
  // an interactive REPL that the daemon has no TTY for.
  assert.ok(args.includes('-p'), 'claude argv must include -p');
});

// ---- Claude Code --add-dir capability (issue #430) -------------------------
// Skill seeds (`skills/<id>/assets/template.html`) and design-system specs
// (`design-systems/<id>/DESIGN.md`) live outside the project cwd. Without
// `--add-dir`, Claude Code's directory access policy blocks reads on any
// path outside the working directory. Bug was that we probed global `claude
// --help` for `--add-dir` but that flag only appears in `claude -p --help`.

test('claude buildArgs passes --add-dir when dirs are supplied (issue #430, probing-failed baseline)', () => {
  // This is the default state before any capability probe runs: agentCapabilities
  // has no entry -> buildArgs gets `caps = {}` -> caps.addDir is undefined ->
  // undefined !== false -> true. This is also the "probing threw" case: timeout,
  // binary not found, non-zero exit code from --help. Dirs are always passed
  // unless capability probing explicitly detected --help and found no --add-dir.
  const args = claude.buildArgs(
    '',
    [],
    ['/repo/skills', '/repo/design-systems'],
    {},
  );

  const addDirIndex = args.indexOf('--add-dir');
  assert.ok(addDirIndex >= 0, '--add-dir must be present by default (safe baseline)');
  assert.equal(args[addDirIndex + 1], '/repo/skills');
  assert.equal(args[addDirIndex + 2], '/repo/design-systems');
  // Check flag ordering: --add-dir comes before --permission-mode
  const permModeIndex = args.indexOf('--permission-mode');
  assert.ok(
    addDirIndex < permModeIndex,
    `--add-dir (index ${addDirIndex}) should appear before --permission-mode (index ${permModeIndex})`,
  );
});

test('claude buildArgs drops empty / null dirs but keeps valid ones (issue #430 edge case)', () => {
  const args = claude.buildArgs('', [], ['', null, '/repo/skills', undefined] as unknown as string[], {});

  const addDirIndex = args.indexOf('--add-dir');
  assert.ok(addDirIndex >= 0, '--add-dir should survive filter');
  // Only the one valid path survives after --add-dir.
  assert.equal(args[addDirIndex + 1], '/repo/skills');
  // Should NOT have multiple --add-dir flags (one flag, N arguments).
  assert.equal(args.filter((a) => a === '--add-dir').length, 1);
  // Should NOT have null / undefined / '' sneaking into argv.
  assert.equal(args.includes(''), false);
  assert.equal(args.includes(null as unknown as string), false);
  assert.equal(args.includes(undefined as unknown as string), false);
});

test('claude helpArgs probes the -p subcommand where --add-dir lives (issue #430 root cause)', () => {
  assert.deepEqual(
    claude.helpArgs,
    ['-p', '--help'],
    `claude.helpArgs must be ['-p', '--help'], not just ['--help'], because --add-dir lives under the -p subcommand. Probing global help never finds it! Got: ${JSON.stringify(claude.helpArgs)}`,
  );
});

// server.ts:4615 branches on `def.promptInputFormat` to decide how to write
// the composed prompt to a stdin-fed child: 'stream-json' writes one JSONL
// `user` message and keeps stdin open, anything else writes the raw prompt
// and ends stdin. Because server.ts opens with `// @ts-nocheck`, a typo on
// that property (e.g. an undefined `runtimeAdapter.promptInputFormat()`)
// passes typecheck but throws `ReferenceError` at runtime for every chat
// run that goes through the stdin-write path — i.e. every agent below.
// Pin the field shape so a future regression of that contract fails here
// instead of in production.
test('promptInputFormat is a string property (or undefined) on every promptViaStdin agent', () => {
  const stdinAgents = [
    { name: 'claude', def: claude, expected: 'stream-json' },
    { name: 'codex', def: codex, expected: undefined },
    { name: 'copilot', def: copilot, expected: undefined },
    { name: 'cursor-agent', def: cursorAgent, expected: undefined },
    { name: 'gemini', def: gemini, expected: undefined },
    { name: 'opencode', def: opencode, expected: undefined },
    { name: 'pi', def: pi, expected: undefined },
    { name: 'qoder', def: qoder, expected: undefined },
  ];
  for (const { name, def, expected } of stdinAgents) {
    assert.equal(
      def.promptViaStdin,
      true,
      `${name} must keep promptViaStdin: true`,
    );
    assert.equal(
      typeof def.promptInputFormat,
      typeof expected,
      `${name}.promptInputFormat must be a ${typeof expected}, not a function — server.ts reads it as a property, not a method call`,
    );
    assert.equal(
      def.promptInputFormat,
      expected,
      `${name}.promptInputFormat must equal ${JSON.stringify(expected)}`,
    );
  }
});
