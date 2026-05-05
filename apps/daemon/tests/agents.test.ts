// @ts-nocheck
import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_DEFS,
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  resolveAgentExecutable,
  spawnEnvForAgent,
} from '../src/agents.js';

const codex = AGENT_DEFS.find((agent) => agent.id === 'codex');
const copilot = AGENT_DEFS.find((agent) => agent.id === 'copilot');
const cursorAgent = AGENT_DEFS.find((agent) => agent.id === 'cursor-agent');
const kiro = AGENT_DEFS.find((agent) => agent.id === 'kiro');
const kilo = AGENT_DEFS.find((agent) => agent.id === 'kilo');
const vibe = AGENT_DEFS.find((agent) => agent.id === 'vibe');
const claude = AGENT_DEFS.find((agent) => agent.id === 'claude');
const devin = AGENT_DEFS.find((agent) => agent.id === 'devin');
const deepseek = AGENT_DEFS.find((agent) => agent.id === 'deepseek');
const gemini = AGENT_DEFS.find((agent) => agent.id === 'gemini');
const originalDisablePlugins = process.env.OD_CODEX_DISABLE_PLUGINS;
const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalAgentHome = process.env.OD_AGENT_HOME;

afterEach(() => {
  if (originalDisablePlugins == null) {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
  } else {
    process.env.OD_CODEX_DISABLE_PLUGINS = originalDisablePlugins;
  }
  process.env.PATH = originalPath;
  if (originalHome == null) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalAgentHome == null) {
    delete process.env.OD_AGENT_HOME;
  } else {
    process.env.OD_AGENT_HOME = originalAgentHome;
  }
});

test('AGENT_DEFS ids are unique', () => {
  const ids = AGENT_DEFS.map((a) => a.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate agent ids: ${JSON.stringify(dupes)}`);
});

test('codex args disable plugins when OD_CODEX_DISABLE_PLUGINS is 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = '1';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.deepEqual(args.slice(0, 9), [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '-c',
    'sandbox_workspace_write.network_access=true',
    '--disable',
    'plugins',
  ]);
});

test('codex args use workspace-write sandbox instead of deprecated full-auto', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--full-auto'), false);
  assert.deepEqual(args.slice(0, 5), [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
  ]);
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is unset', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is not 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = 'true';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
});

// Recent Codex CLI versions reject a bare `-` argv sentinel; passing it
// alongside the stdin pipe causes `error: unexpected argument '-' found`
// and exit code 2 before any prompt is read. We deliver the prompt via
// stdin pipe alone (gated by `promptViaStdin: true`). Regression of #237.
test('codex args do not include the literal `-` stdin sentinel (regression of #237)', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const baseArgs = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });
  assert.equal(baseArgs.includes('-'), false);

  const withModel = codex.buildArgs(
    '',
    [],
    [],
    { model: 'gpt-5-codex' },
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withModel.includes('-'), false);

  const withReasoning = codex.buildArgs(
    '',
    [],
    [],
    { reasoning: 'high' },
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withReasoning.includes('-'), false);

  process.env.OD_CODEX_DISABLE_PLUGINS = '1';
  const withDisablePlugins = codex.buildArgs(
    '',
    [],
    [],
    {},
    { cwd: '/tmp/od-project' },
  );
  assert.equal(withDisablePlugins.includes('-'), false);
});

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

// Copilot does NOT treat `-` as a stdin sentinel — it reads it as a
// literal one-character prompt. The prompt must be passed directly as the
// value of `-p`. Pin the argv shape so the regression can't drift back.
// Also pin the order — Copilot expects `-p <prompt>` before any other
// flag, including model / add-dir extensions.
test('copilot args pass the prompt directly as the -p value (not via stdin sentinel)', () => {
  const prompt = 'design a landing page';
  const baseArgs = copilot.buildArgs(prompt, [], [], {});
  assert.equal(baseArgs[0], '-p');
  assert.equal(baseArgs[1], prompt);
  assert.deepEqual(baseArgs, [
    '-p',
    prompt,
    '--allow-all-tools',
    '--output-format',
    'json',
  ]);
});

test('copilot args keep `-p <prompt>` at the front when model and extra dirs are added', () => {
  const prompt = 'design a landing page';
  const args = copilot.buildArgs(
    prompt,
    [],
    ['/tmp/od-skills', '/tmp/od-design-systems'],
    { model: 'claude-sonnet-4.6' },
  );
  assert.equal(args[0], '-p');
  assert.equal(args[1], prompt);
  assert.deepEqual(args, [
    '-p',
    prompt,
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

test('copilot drops empty / non-string entries from extraAllowedDirs without breaking the `-p <prompt>` lead', () => {
  const prompt = 'design a landing page';
  const args = copilot.buildArgs(
    prompt,
    [],
    ['', null, '/tmp/od-skills', undefined],
    {},
  );
  assert.equal(args[0], '-p');
  assert.equal(args[1], prompt);
  // Only the one valid path survives.
  const addDirIndex = args.indexOf('--add-dir');
  assert.equal(args[addDirIndex + 1], '/tmp/od-skills');
  assert.equal(args.filter((a) => a === '--add-dir').length, 1);
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

test('kiro fetchModels falls back to fallbackModels when detection fails', async () => {
  // fetchModels rejects when the binary doesn't exist; the daemon's
  // probe() catches this and uses fallbackModels instead.
  const result = await kiro
    .fetchModels('/nonexistent/kiro-cli')
    .catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(kiro.fallbackModels));
  assert.equal(kiro.fallbackModels[0].id, 'default');
});

test('kilo args use acp subcommand for json-rpc streaming', () => {
  const args = kilo.buildArgs('', [], [], {});

  assert.deepEqual(args, ['acp']);
  assert.equal(kilo.streamFormat, 'acp-json-rpc');
});

test('kilo fetchModels falls back to fallbackModels when detection fails', async () => {
  const result = await kilo.fetchModels('/nonexistent/kilo').catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(kilo.fallbackModels));
  assert.equal(kilo.fallbackModels[0].id, 'default');
  assert.equal(kilo.fallbackModels.length, 1);
});

// ---- reasoning-effort clamp ------------------------------------------------
// Drives clampCodexReasoning through the public buildArgs surface so the
// helper stays non-exported. The wire-level `-c model_reasoning_effort="..."`
// flag is what the codex CLI (and ultimately OpenAI) actually sees.

test('codex buildArgs clamps reasoning effort per model', () => {
  const cases = [
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
      { model, reasoning },
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

// ---- OpenClaude fallback (issue #235) -------------------------------------
// OpenClaude (https://github.com/Gitlawb/openclaude) is a Claude Code fork
// that ships under a different binary name but speaks an argv-compatible
// CLI. Users with only `openclaude` on PATH should be auto-detected as the
// Claude Code agent without writing a wrapper script. The mechanism is the
// `fallbackBins` array on the Claude AGENT_DEF, consumed by
// `resolveAgentExecutable`.

test('claude entry declares openclaude as a fallback bin (issue #235)', () => {
  assert.ok(
    Array.isArray(claude.fallbackBins),
    'claude.fallbackBins must be an array',
  );
  assert.ok(
    claude.fallbackBins.includes('openclaude'),
    `claude.fallbackBins must include 'openclaude'; got ${JSON.stringify(claude.fallbackBins)}`,
  );
});

// resolveAgentExecutable touches the filesystem via existsSync; on
// Windows resolveOnPath also walks PATHEXT extensions, which our fixture
// files don't carry. Skip the filesystem-backed cases there — the
// declarative `fallbackBins`-on-claude assertion above still runs on
// every platform and is what catches regressions in the AGENT_DEF.
const fsTest = process.platform === 'win32' ? test.skip : test;

fsTest(
  'resolveAgentExecutable prefers def.bin over fallbackBins when bin is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      writeFileSync(join(dir, 'claude'), '');
      writeFileSync(join(dir, 'openclaude'), '');
      chmodSync(join(dir, 'claude'), 0o755);
      chmodSync(join(dir, 'openclaude'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      });
      assert.equal(resolved, join(dir, 'claude'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable falls back through fallbackBins when def.bin is missing',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      // Only `openclaude` is installed (Claude Code fork-only setup).
      writeFileSync(join(dir, 'openclaude'), '');
      chmodSync(join(dir, 'openclaude'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      });
      assert.equal(resolved, join(dir, 'openclaude'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable returns null when neither def.bin nor any fallback is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      });
      assert.equal(resolved, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable searches mise node bins when PATH is minimal',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-home-'));
    try {
      const dir = join(
        home,
        '.local',
        'share',
        'mise',
        'installs',
        'node',
        '24.14.1',
        'bin',
      );
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'codex'), '');
      chmodSync(join(dir, 'codex'), 0o755);
      process.env.OD_AGENT_HOME = home;
      process.env.PATH = '/usr/bin:/bin';

      const resolved = resolveAgentExecutable({
        bin: 'codex',
      });
      assert.equal(resolved, join(dir, 'codex'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable still resolves agents without a fallbackBins field',
  () => {
    // Guard against a regression that would require every AGENT_DEF to
    // declare fallbackBins. Most agents (codex / gemini / opencode / ...)
    // only have a single binary name and must keep working unchanged.
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      writeFileSync(join(dir, 'codex'), '');
      chmodSync(join(dir, 'codex'), 0o755);
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable({ bin: 'codex' });
      assert.equal(resolved, join(dir, 'codex'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// DeepSeek TUI's exec subcommand requires the prompt as a positional
// argument (no `-` stdin sentinel; clap declares `prompt: String` as a
// required field). `--auto` enables agentic mode with auto-approval —
// the daemon runs every CLI without a TTY, so the interactive approval
// prompt would hang the run.
test('deepseek args use exec --auto and append prompt as positional', () => {
  const args = deepseek.buildArgs('write hello world', [], [], {});

  assert.deepEqual(args, ['exec', '--auto', 'write hello world']);
  assert.equal(deepseek.streamFormat, 'plain');
});

test('deepseek args inject --model when the user picks one', () => {
  const args = deepseek.buildArgs('hi', [], [], { model: 'deepseek-v4-pro' });

  assert.deepEqual(args, [
    'exec',
    '--auto',
    '--model',
    'deepseek-v4-pro',
    'hi',
  ]);
});

test('deepseek args omit --model when model is "default"', () => {
  const args = deepseek.buildArgs('hi', [], [], { model: 'default' });

  assert.equal(args.includes('--model'), false);
});

// DeepSeek's exec mode requires the prompt as a positional argv arg
// (no `-` stdin sentinel upstream), so a sufficiently large composed
// prompt — system text + history + skills/design-system content + the
// user message — could blow Windows' ~32 KB CreateProcess command-line
// limit (or Linux MAX_ARG_STRLEN on extreme edges) and surface as a
// generic spawn ENAMETOOLONG / E2BIG instead of a DeepSeek-specific,
// user-actionable message. The adapter declares `maxPromptArgBytes` so
// /api/chat can fail fast with guidance ("reduce skills/design context
// or use an adapter with stdin support") before calling `spawn`. Pin
// the field so removing it can't silently regress the guard.
test('deepseek declares a conservative argv-byte budget for the prompt', () => {
  assert.equal(
    typeof deepseek.maxPromptArgBytes,
    'number',
    'deepseek must set maxPromptArgBytes so the spawn path can pre-flight oversized prompts before hitting CreateProcess / E2BIG',
  );
  assert.ok(
    deepseek.maxPromptArgBytes > 0 && deepseek.maxPromptArgBytes < 32_768,
    `deepseek.maxPromptArgBytes must stay strictly under the Windows CreateProcess limit (~32 KB); got ${deepseek.maxPromptArgBytes}`,
  );
});

// Regression: composed prompts larger than the deepseek argv budget
// (chosen as a conservative under-Windows-CreateProcess size) must
// trip `checkPromptArgvBudget` with the DeepSeek-named, actionable
// `AGENT_PROMPT_TOO_LARGE` payload the chat handler emits over SSE,
// while normal-sized prompts must pass through cleanly so the chat
// happy path keeps working. This exercises the same pure helper the
// `/api/chat` spawn path uses, so removing the guard or letting the
// budget drift over the Windows limit fails this test before any
// real spawn would surface a generic ENAMETOOLONG / E2BIG.
test('checkPromptArgvBudget flags oversized DeepSeek prompts and lets short prompts through', () => {
  const oversized = 'x'.repeat(deepseek.maxPromptArgBytes + 1);
  const flagged = checkPromptArgvBudget(deepseek, oversized);
  assert.ok(flagged, 'oversized prompts must trip the argv-byte guard');
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.equal(flagged.limit, deepseek.maxPromptArgBytes);
  assert.equal(flagged.bytes, deepseek.maxPromptArgBytes + 1);
  assert.match(flagged.message, /DeepSeek/);
  assert.match(flagged.message, /command-line argument/);
  assert.match(flagged.message, /stdin support/);

  // Normal-sized prompts must not trip the guard; the chat happy path
  // depends on this returning null so it can proceed to spawn.
  assert.equal(checkPromptArgvBudget(deepseek, 'hello'), null);

  // The exact-budget edge: a prompt right at the limit must pass; the
  // guard fires only when the byte count strictly exceeds the budget.
  const atLimit = 'x'.repeat(deepseek.maxPromptArgBytes);
  assert.equal(checkPromptArgvBudget(deepseek, atLimit), null);

  // A multi-byte UTF-8 prompt (e.g. CJK characters) is measured in
  // bytes, not code points — pin that so a 3-byte-per-char prompt
  // can't sneak past a code-point-based regression of the helper.
  const cjkOversized = '汉'.repeat(
    Math.ceil(deepseek.maxPromptArgBytes / 3) + 1,
  );
  const cjkFlagged = checkPromptArgvBudget(deepseek, cjkOversized);
  assert.ok(cjkFlagged, 'byte-counted UTF-8 prompts must also trip the guard');
  assert.equal(cjkFlagged.code, 'AGENT_PROMPT_TOO_LARGE');
});

// Adapters that ship the prompt over stdin (every other code agent
// today) don't declare `maxPromptArgBytes` and must skip the guard
// entirely — applying it to them would refuse perfectly valid huge
// prompts those CLIs handle just fine via stdin.
test('checkPromptArgvBudget is a no-op for adapters without maxPromptArgBytes', () => {
  assert.equal(claude.maxPromptArgBytes, undefined);
  const huge = 'x'.repeat(100_000);
  assert.equal(checkPromptArgvBudget(claude, huge), null);
});

// On Windows an npm-installed `deepseek` resolves to a `.cmd` shim and
// the spawn path wraps the call in `cmd.exe /d /s /c "<inner>"`, with
// every embedded `"` doubled by `quoteWindowsCommandArg`. A prompt that
// fits under the raw `maxPromptArgBytes` budget but is heavy on quote
// characters (code blocks, JSON-shaped skill seeds) can therefore still
// expand past CreateProcess's 32_767-char `lpCommandLine` cap — surfacing
// as a generic spawn ENAMETOOLONG instead of the actionable DeepSeek-
// named error the budget guard was meant to provide. The post-buildArgs
// check `checkWindowsCmdShimCommandLineBudget` computes the would-be
// command line length using the same quoting math the platform layer
// uses on Windows, so a quote-heavy prompt under the byte budget still
// fails with `AGENT_PROMPT_TOO_LARGE` before spawn.
test('checkWindowsCmdShimCommandLineBudget flags quote-heavy prompts that expand past CreateProcess limit', () => {
  // Prompt is *under* the raw byte budget, but ~entirely `"` chars so
  // cmd.exe's quote-doubling roughly doubles its command-line cost.
  const quoteHeavyPromptLength = deepseek.maxPromptArgBytes - 100;
  const quoteHeavyPrompt = '"'.repeat(quoteHeavyPromptLength);

  // Sanity: the raw-byte guard must let this through, otherwise the new
  // post-buildArgs check would never fire on a real run.
  assert.equal(
    checkPromptArgvBudget(deepseek, quoteHeavyPrompt),
    null,
    'quote-heavy prompt under the raw byte budget must pass the pre-buildArgs guard',
  );

  const args = deepseek.buildArgs(quoteHeavyPrompt, [], [], {});
  // Use a realistic npm-style Windows install path so the resolved-bin
  // contribution mirrors a real user's environment.
  const resolvedBin = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  const flagged = checkWindowsCmdShimCommandLineBudget(
    deepseek,
    resolvedBin,
    args,
  );

  assert.ok(
    flagged,
    'quote-heavy prompt that doubles past the CreateProcess cap must trip the cmd-shim guard',
  );
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.ok(
    flagged.commandLineLength > flagged.limit,
    `commandLineLength (${flagged.commandLineLength}) must exceed limit (${flagged.limit})`,
  );
  assert.ok(
    flagged.limit < 32_768,
    'guard must keep its safe limit strictly under the documented Windows CreateProcess cap',
  );
  assert.match(flagged.message, /DeepSeek/);
  assert.match(flagged.message, /cmd\.exe quote-doubling/);
  assert.match(flagged.message, /stdin support/);
});

test('checkWindowsCmdShimCommandLineBudget lets ordinary prompts through .cmd resolutions', () => {
  // Same Windows-shim resolution path, but a plain prompt — well under
  // every limit. The guard must return null so the chat happy path
  // proceeds to spawn.
  const args = deepseek.buildArgs('write hello world', [], [], {});
  const resolvedBin = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(deepseek, resolvedBin, args),
    null,
  );
});

test('checkWindowsCmdShimCommandLineBudget is a no-op for non-.cmd resolutions', () => {
  // POSIX hosts (and direct `.exe` resolutions on Windows) don't go
  // through the cmd.exe wrap, so the cmd-shim guard never fires on
  // those — `checkPromptArgvBudget` catches POSIX oversize argv, and
  // `checkWindowsDirectExeCommandLineBudget` catches direct-exe argv
  // expansion under libuv's quoting rules. Use a non-quote-heavy prompt
  // so this test stays focused on the `.cmd`/`.bat` path filter rather
  // than overlapping with the direct-exe guard's contract.
  const args = deepseek.buildArgs('x'.repeat(20_000), [], [], {});
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      deepseek,
      '/usr/local/bin/deepseek',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(
      deepseek,
      'C:\\Program Files\\DeepSeek\\deepseek.exe',
      args,
    ),
    null,
  );
});

// Security regression: cmd.exe runs percent-expansion on the inner line
// of `cmd /s /c "..."` regardless of quote state, so a `.cmd` shim spawn
// whose argv carries an attacker-influenced `%DEEPSEEK_API_KEY%` substring
// would otherwise let cmd substitute the daemon's env value into the
// prompt before the child ran. The cmd-shim quoting in agents.ts (which
// the budget guard uses to compute the projected line) must mirror the
// platform fix: each `%` is wrapped in `"^%"` so cmd's `^` escape makes
// the next `%` literal while `CommandLineToArgvW` concatenates the quote
// segments back into the original arg byte-for-byte. The budget math
// reflects the longer projected line; pinning the projection here means a
// regression that drops the `%` escape would surface as a budget mismatch
// (or, worse, as cmd silently expanding the env var on a real Windows
// run). Composes the prompt right at the cmd-shim limit so the guard's
// length math also has to add up.
test('checkWindowsCmdShimCommandLineBudget projects the %var% escape into the command line length', () => {
  // Carry exactly 200 `%DEEPSEEK_API_KEY%` references in the prompt; each
  // raw `%` (400 total) becomes `"^%"` (4 chars) in the projected line, so
  // a regression that drops the `%` escape shifts the projected length by
  // 1200 chars and breaks the budget math without obviously failing in
  // unrelated tests.
  const promptPiece = '%DEEPSEEK_API_KEY%';
  const prompt = promptPiece.repeat(200);

  // Pre-buildArgs guard: the raw prompt is well under DeepSeek's argv
  // budget, so this path must let it through.
  assert.equal(checkPromptArgvBudget(deepseek, prompt), null);

  const args = deepseek.buildArgs(prompt, [], [], {});
  const resolvedBin = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  const flagged = checkWindowsCmdShimCommandLineBudget(
    deepseek,
    resolvedBin,
    args,
  );
  // The prompt is short enough that the cmd-shim budget should still pass —
  // the test isn't about an oversized prompt; it's about the *content* of
  // the projected line. A null result here means the escape is in place
  // and didn't push us past the limit.
  assert.equal(flagged, null);
});

test('checkWindowsCmdShimCommandLineBudget no-ops when resolvedBin is null or adapter has no budget', () => {
  // Bin resolution failed but the run continued long enough to reach
  // this guard — must be a no-op so the existing AGENT_UNAVAILABLE path
  // still fires from server.ts.
  assert.equal(checkWindowsCmdShimCommandLineBudget(deepseek, null, []), null);
  // Stdin-delivered adapters never declare `maxPromptArgBytes` — the
  // guard must skip them even when handed a `.cmd` path.
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(claude, 'C:\\fake\\claude.cmd', []),
    null,
  );
});

// Companion to the cmd-shim guard for non-shim Windows installs (e.g. a
// cargo-built `deepseek.exe` rather than the npm `.cmd` shim). The
// cmd-shim guard early-returns on `.exe` paths because those skip the
// `cmd.exe /d /s /c` wrap, but Node/libuv still composes a
// CreateProcess `lpCommandLine` by walking each argv element through
// `quote_cmd_arg` — every embedded `"` becomes `\"`, backslashes
// adjacent to a quote get doubled. A quote-heavy prompt that fits under
// `maxPromptArgBytes` can therefore still expand past the 32_767-char
// kernel cap on a direct `.exe` spawn. The new guard recomputes the
// would-be command line using the exact libuv math so those users hit
// the same actionable `AGENT_PROMPT_TOO_LARGE` instead of a generic
// `spawn ENAMETOOLONG`.
test('checkWindowsDirectExeCommandLineBudget flags quote-heavy prompts on a direct .exe resolution', () => {
  // Prompt is *under* the raw byte budget, but ~entirely `"` chars so
  // libuv's `\"` escaping roughly doubles its command-line cost.
  const quoteHeavyPromptLength = deepseek.maxPromptArgBytes - 100;
  const quoteHeavyPrompt = '"'.repeat(quoteHeavyPromptLength);

  // Sanity: the raw-byte guard must let this through, otherwise the
  // post-buildArgs check would never fire on a real run.
  assert.equal(
    checkPromptArgvBudget(deepseek, quoteHeavyPrompt),
    null,
    'quote-heavy prompt under the raw byte budget must pass the pre-buildArgs guard',
  );

  const args = deepseek.buildArgs(quoteHeavyPrompt, [], [], {});
  // Realistic non-shim install: a cargo-built `.exe` under Program Files
  // (path has spaces so the resolved-bin contribution itself gets
  // wrapped in `"…"`, which mirrors what libuv would do on Windows).
  const resolvedBin = 'C:\\Program Files\\DeepSeek\\deepseek.exe';
  const flagged = checkWindowsDirectExeCommandLineBudget(
    deepseek,
    resolvedBin,
    args,
  );

  assert.ok(
    flagged,
    'quote-heavy prompt that expands past the CreateProcess cap on a direct .exe spawn must trip the guard',
  );
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.ok(
    flagged.commandLineLength > flagged.limit,
    `commandLineLength (${flagged.commandLineLength}) must exceed limit (${flagged.limit})`,
  );
  assert.ok(
    flagged.limit < 32_768,
    'guard must keep its safe limit strictly under the documented Windows CreateProcess cap',
  );
  assert.match(flagged.message, /DeepSeek/);
  assert.match(flagged.message, /libuv quote-escaping/);
  assert.match(flagged.message, /stdin support/);
});

test('checkWindowsDirectExeCommandLineBudget lets ordinary prompts through .exe resolutions', () => {
  // Non-shim `.exe` install with a plain prompt — well under every
  // limit. Guard must return null so the chat happy path proceeds to
  // spawn.
  const args = deepseek.buildArgs('write hello world', [], [], {});
  const resolvedBin = 'C:\\Program Files\\DeepSeek\\deepseek.exe';
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(deepseek, resolvedBin, args),
    null,
  );
});

test('checkWindowsDirectExeCommandLineBudget no-ops on .cmd / .bat resolutions and POSIX paths', () => {
  // The cmd-shim guard owns `.bat` / `.cmd` — the direct-exe guard must
  // skip them so an oversized prompt on a `.cmd` install doesn't trip
  // both guards (and double-emit an SSE error).
  const args = deepseek.buildArgs(
    '"'.repeat(deepseek.maxPromptArgBytes - 100),
    [],
    [],
    {},
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.bat',
      args,
    ),
    null,
  );
  // POSIX hosts never go through Windows' CreateProcess — `execvp`
  // accepts each argv buffer separately, so there's no command-line
  // concatenation to bust. The pre-buildArgs `checkPromptArgvBudget` is
  // the one responsible for catching oversized argv on those hosts.
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      '/usr/local/bin/deepseek',
      args,
    ),
    null,
  );
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(
      deepseek,
      '/home/dev/.cargo/bin/deepseek',
      args,
    ),
    null,
  );
});

test('checkWindowsDirectExeCommandLineBudget no-ops when resolvedBin is null/empty or adapter has no budget', () => {
  // Bin resolution failed but the run continued long enough to reach
  // this guard — must be a no-op so the existing AGENT_UNAVAILABLE path
  // still fires from server.ts.
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(deepseek, null, []),
    null,
  );
  assert.equal(checkWindowsDirectExeCommandLineBudget(deepseek, '', []), null);
  // Stdin-delivered adapters never declare `maxPromptArgBytes` — the
  // guard must skip them even when handed a Windows `.exe` path.
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(claude, 'C:\\fake\\claude.exe', []),
    null,
  );
});

// The two post-buildArgs guards are deliberately exclusive: the
// cmd-shim guard owns `.cmd` / `.bat` (cmd.exe quote-doubling math),
// the direct-exe guard owns everything else on Windows (libuv
// quote-escaping math). For any single resolved bin, at most one
// should ever fire — otherwise an oversized prompt would emit two
// SSE error events back to back. Pin both branches with a quote-heavy
// prompt that's over the kernel cap under either quoting rule.
test('cmd-shim and direct-exe guards are mutually exclusive on a single resolution', () => {
  const quoteHeavy = '"'.repeat(deepseek.maxPromptArgBytes - 100);
  const args = deepseek.buildArgs(quoteHeavy, [], [], {});

  const cmdPath = 'C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd';
  assert.ok(checkWindowsCmdShimCommandLineBudget(deepseek, cmdPath, args));
  assert.equal(
    checkWindowsDirectExeCommandLineBudget(deepseek, cmdPath, args),
    null,
  );

  const exePath = 'C:\\Program Files\\DeepSeek\\deepseek.exe';
  assert.equal(
    checkWindowsCmdShimCommandLineBudget(deepseek, exePath, args),
    null,
  );
  assert.ok(checkWindowsDirectExeCommandLineBudget(deepseek, exePath, args));
});

test('deepseek entry does not advertise deepseek-tui as a fallback bin', () => {
  // `deepseek` is the dispatcher that owns `exec` / `--auto`; `deepseek-tui`
  // is the runtime companion the dispatcher invokes. Upstream installs both
  // together (npm and cargo). A `deepseek-tui`-only host is not a supported
  // install, and `deepseek-tui` itself doesn't accept `exec --auto <prompt>`
  // — surfacing it via fallbackBins would advertise availability but make
  // the first /api/chat run fail. Pin the absence so the fallback can't
  // drift back without an accompanying buildArgs branch + test.
  assert.equal(
    Array.isArray(deepseek.fallbackBins) && deepseek.fallbackBins.length > 0,
    false,
    `deepseek must not declare fallbackBins until the deepseek-tui-only invocation is implemented and tested; got ${JSON.stringify(deepseek.fallbackBins)}`,
  );
});

test('vibe args use empty array for acp-json-rpc streaming', () => {
  const args = vibe.buildArgs('', [], [], {});

  assert.deepEqual(args, []);
  assert.equal(vibe.streamFormat, 'acp-json-rpc');
});

test('vibe fetchModels falls back to fallbackModels when detection fails', async () => {
  // fetchModels rejects when the binary doesn't exist; the daemon's
  // probe() catches this and uses fallbackModels instead.
  const result = await vibe
    .fetchModels('/nonexistent/vibe-acp')
    .catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(vibe.fallbackModels));
  assert.equal(vibe.fallbackModels[0].id, 'default');
});

// Issue #398: Claude Code prefers ANTHROPIC_API_KEY over `claude login`
// credentials, silently billing API usage. Strip it for the claude
// adapter so the user's subscription wins.
test('spawnEnvForAgent strips ANTHROPIC_API_KEY for the claude adapter', () => {
  const env = spawnEnvForAgent('claude', {
    ANTHROPIC_API_KEY: 'sk-leak',
    PATH: '/usr/bin',
    OD_DAEMON_URL: 'http://127.0.0.1:7456',
  });

  assert.equal('ANTHROPIC_API_KEY' in env, false);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.OD_DAEMON_URL, 'http://127.0.0.1:7456');
});

// Windows env-var names are case-insensitive at the kernel level, but
// spreading process.env into a plain object loses Node's case-insensitive
// accessor — a `Anthropic_Api_Key` key would survive a literal
// `delete env.ANTHROPIC_API_KEY` and still reach Claude Code on Windows.
test('spawnEnvForAgent strips ANTHROPIC_API_KEY case-insensitively for the claude adapter', () => {
  const env = spawnEnvForAgent('claude', {
    Anthropic_Api_Key: 'sk-mixed-case',
    anthropic_api_key: 'sk-lower-case',
    PATH: '/usr/bin',
  });

  const remaining = Object.keys(env).filter(
    (k) => k.toUpperCase() === 'ANTHROPIC_API_KEY',
  );
  assert.deepEqual(remaining, []);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawnEnvForAgent preserves ANTHROPIC_API_KEY for non-claude adapters', () => {
  for (const agentId of ['codex', 'gemini', 'opencode', 'devin']) {
    const env = spawnEnvForAgent(agentId, {
      ANTHROPIC_API_KEY: 'sk-keep',
      PATH: '/usr/bin',
    });
    assert.equal(
      env.ANTHROPIC_API_KEY,
      'sk-keep',
      `expected ${agentId} to preserve ANTHROPIC_API_KEY`,
    );
  }
});

test('spawnEnvForAgent does not mutate the input env', () => {
  const original = { ANTHROPIC_API_KEY: 'sk-leak', PATH: '/usr/bin' };
  const env = spawnEnvForAgent('claude', original);

  assert.equal(original.ANTHROPIC_API_KEY, 'sk-leak');
  assert.notEqual(env, original);
});
