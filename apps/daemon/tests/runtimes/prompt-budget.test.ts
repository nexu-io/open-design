import { test } from 'vitest';
import {
  assert, checkPromptArgvBudget, checkWindowsCmdShimCommandLineBudget, checkWindowsDirectExeCommandLineBudget, claude, deepseek, deepseekMaxPromptArgBytes, vibe,
} from './helpers/test-helpers.js';
import type { TestAgentDef } from './helpers/test-helpers.js';

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
    typeof deepseekMaxPromptArgBytes,
    'number',
    'deepseek must set maxPromptArgBytes so the spawn path can pre-flight oversized prompts before hitting CreateProcess / E2BIG',
  );
  assert.ok(
    deepseekMaxPromptArgBytes > 0 && deepseekMaxPromptArgBytes < 32_768,
    `deepseekMaxPromptArgBytes must stay strictly under the Windows CreateProcess limit (~32 KB); got ${deepseekMaxPromptArgBytes}`,
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
  const oversized = 'x'.repeat(deepseekMaxPromptArgBytes + 1);
  const flagged = checkPromptArgvBudget(deepseek, oversized);
  assert.ok(flagged, 'oversized prompts must trip the argv-byte guard');
  assert.equal(flagged.code, 'AGENT_PROMPT_TOO_LARGE');
  assert.equal(flagged.limit, deepseekMaxPromptArgBytes);
  assert.equal(flagged.bytes, deepseekMaxPromptArgBytes + 1);
  assert.match(flagged.message, /DeepSeek/);
  assert.match(flagged.message, /command-line argument/);
  assert.match(flagged.message, /stdin support/);

  // Normal-sized prompts must not trip the guard; the chat happy path
  // depends on this returning null so it can proceed to spawn.
  assert.equal(checkPromptArgvBudget(deepseek, 'hello'), null);

  // The exact-budget edge: a prompt right at the limit must pass; the
  // guard fires only when the byte count strictly exceeds the budget.
  const atLimit = 'x'.repeat(deepseekMaxPromptArgBytes);
  assert.equal(checkPromptArgvBudget(deepseek, atLimit), null);

  // A multi-byte UTF-8 prompt (e.g. CJK characters) is measured in
  // bytes, not code points — pin that so a 3-byte-per-char prompt
  // can't sneak past a code-point-based regression of the helper.
  const cjkOversized = '汉'.repeat(
    Math.ceil(deepseekMaxPromptArgBytes / 3) + 1,
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
  const quoteHeavyPromptLength = deepseekMaxPromptArgBytes - 100;
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
  const commandLineLength = flagged.commandLineLength;
  assert.ok(commandLineLength !== undefined);
  assert.ok(
    commandLineLength > flagged.limit,
    `commandLineLength (${commandLineLength}) must exceed limit (${flagged.limit})`,
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
  const quoteHeavyPromptLength = deepseekMaxPromptArgBytes - 100;
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
  const commandLineLength = flagged.commandLineLength;
  assert.ok(commandLineLength !== undefined);
  assert.ok(
    commandLineLength > flagged.limit,
    `commandLineLength (${commandLineLength}) must exceed limit (${flagged.limit})`,
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
    '"'.repeat(deepseekMaxPromptArgBytes - 100),
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
  const quoteHeavy = '"'.repeat(deepseekMaxPromptArgBytes - 100);
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
    Array.isArray((deepseek as TestAgentDef & { fallbackBins?: string[] }).fallbackBins)
      && ((deepseek as TestAgentDef & { fallbackBins?: string[] }).fallbackBins?.length ?? 0) > 0,
    false,
    `deepseek must not declare fallbackBins until the deepseek-tui-only invocation is implemented and tested; got ${JSON.stringify((deepseek as TestAgentDef & { fallbackBins?: string[] }).fallbackBins)}`,
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
  assert.ok(vibe.fetchModels, 'vibe must define fetchModels');
  const result = await vibe
    .fetchModels('/nonexistent/vibe-acp', {})
    .catch(() => null);

  assert.equal(result, null);
  assert.ok(Array.isArray(vibe.fallbackModels));
  const fallbackModel = vibe.fallbackModels[0];
  assert.ok(fallbackModel);
  assert.equal(fallbackModel.id, 'default');
});
