import type { RuntimeAgentDef, RuntimePromptBudgetError } from './types.js';

export function checkPromptArgvBudget(
  def: RuntimeAgentDef | null | undefined,
  composed: unknown,
): RuntimePromptBudgetError | null {
  if (!def || typeof def.maxPromptArgBytes !== 'number') return null;
  const bytes = Buffer.byteLength(
    typeof composed === 'string' ? composed : '',
    'utf8',
  );
  if (bytes <= def.maxPromptArgBytes) return null;
  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message:
      `${def.name} requires the prompt as a command-line argument and this run's composed prompt exceeds the safe size (${bytes} > ${def.maxPromptArgBytes} bytes). ` +
      'Reduce the selected skills/design-system context, shorten the conversation, or pick an adapter with stdin support.',
    bytes,
    limit: def.maxPromptArgBytes,
  };
}

// Mirror of packages/platform's `quoteWindowsCommandArg`, kept local so
// `checkWindowsCmdShimCommandLineBudget` can run on macOS/Linux against
// a fake `.cmd` path in tests without forking on `process.platform`.
// Must stay byte-for-byte identical to the platform copy — the helper's
// whole point is to compute the exact `cmd.exe /d /s /c "<inner>"` line
// the spawn path will produce on Windows. The `%` → `"^%"` substitution
// neutralizes cmd.exe's percent-expansion for prompts that ride argv
// (DeepSeek TUI today): `%name%` pairs would otherwise be expanded from
// the daemon environment before the child reads them, leaking secrets
// like `%DEEPSEEK_API_KEY%` whenever the prompt mentions an env-var name.
function quoteForWindowsCmdShim(value: unknown): string {
  const str = String(value ?? '');
  if (!/[\s"&<>|^%]/.test(str)) return str;
  const escaped = str.replace(/"/g, '""').replace(/%/g, '"^%"');
  return `"${escaped}"`;
}

// Mirror of libuv's `quote_cmd_arg` (process-stdio.c), the exact rule
// Node uses on Windows when it composes a CreateProcess command line for
// a direct executable spawn (not a `.cmd` / `.bat` shim, which goes
// through `quoteForWindowsCmdShim` above). Each embedded `"` becomes
// `\"`, every backslash that ends up adjacent to a quote (or to the
// closing wrap quote) gets doubled, and an arg with whitespace or a
// quote is wrapped in outer `"..."`. Kept local so the budget check
// works on macOS/Linux test hosts against a fake `C:\…\foo.exe` path.
function quoteForWindowsDirectExe(value: unknown): string {
  const str = String(value ?? '');
  // libuv emits a literal `""` for an empty argv entry so it survives
  // CommandLineToArgvW round-tripping; mirror that.
  if (str.length === 0) return '""';
  // Fast path: no whitespace and no quote — pass through unchanged. This
  // matches libuv's `wcspbrk(source, L" \t\"")` early return.
  if (!/[\s"]/.test(str)) return str;
  // No quote, no backslash: simple wrap, no per-char escaping needed.
  if (!/[\\"]/.test(str)) return `"${str}"`;
  // Slow path: walk the string, counting consecutive backslashes so we
  // can double them whenever they precede a `"` or the closing wrap
  // quote. Following the documented Windows convention:
  //   - 2n  backslashes + `"`  →  emit `\\` × 2n  + `\"`
  //   - 2n+1 backslashes + `"` →  emit `\\` × (2n+1) + `\"`
  //   - n backslashes not before `"`  →  emit `\\` × n unchanged
  //   - trailing backslashes (before the closing wrap quote)  →  doubled
  let result = '"';
  let backslashes = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') {
      backslashes++;
    } else if (ch === '"') {
      result += '\\'.repeat(2 * backslashes + 1) + '"';
      backslashes = 0;
    } else {
      result += '\\'.repeat(backslashes) + ch;
      backslashes = 0;
    }
  }
  result += '\\'.repeat(2 * backslashes) + '"';
  return result;
}

// Windows' CreateProcess caps `lpCommandLine` at 32_767 chars. Going
// through a `.cmd` / `.bat` shim adds a `cmd.exe /d /s /c "<inner>"`
// wrapper, and `quoteForWindowsCmdShim` doubles every embedded `"` plus
// wraps any whitespace/special-char arg in outer quotes — so a prompt
// well under `maxPromptArgBytes` can still expand past the kernel cap
// once it's run through the shim. Leave headroom for any per-CLI flag
// the adapter might tack on at exec time and for cmd.exe's own framing.
const WINDOWS_CREATE_PROCESS_LIMIT = 32_767;
const WINDOWS_CREATE_PROCESS_HEADROOM = 256;

// Post-buildArgs guard for argv-bound adapters whose binary resolves to
// a Windows `.cmd` / `.bat` shim. Computes the exact command line shape
// `createCommandInvocation` (in packages/platform) hands to `spawn` —
// `cmd.exe /d /s /c "<quoted command + quoted args>"` — and refuses the
// run when that line would exceed the CreateProcess limit (less a small
// headroom). Returns the same `AGENT_PROMPT_TOO_LARGE` shape as
// `checkPromptArgvBudget` so the SSE error path in `/api/chat` doesn't
// have to special-case it.
//
// No-op when:
//   - the adapter doesn't declare `maxPromptArgBytes` (stdin adapters
//     never go through this path);
//   - the resolved binary isn't a `.cmd` / `.bat` (POSIX hosts and
//     direct `.exe` resolutions on Windows skip the cmd.exe wrap);
//   - the assembled line fits comfortably under the kernel cap.
//
// Pure: takes `resolvedBin` explicitly so a test on macOS can pass a
// fake `C:\\…\\deepseek.cmd` path and exercise the same math the daemon
// would run on Windows.
export function checkWindowsCmdShimCommandLineBudget(
  def: RuntimeAgentDef | null | undefined,
  resolvedBin: unknown,
  args: unknown,
): RuntimePromptBudgetError | null {
  if (!def || typeof def.maxPromptArgBytes !== 'number') return null;
  if (typeof resolvedBin !== 'string' || !/\.(bat|cmd)$/i.test(resolvedBin))
    return null;
  const argList = Array.isArray(args) ? args : [];
  const inner = [resolvedBin, ...argList].map(quoteForWindowsCmdShim).join(' ');
  // `cmd.exe /d /s /c "<inner>"` — same shape as buildCmdShimInvocation
  // in packages/platform; the leading 'cmd.exe ' + '/d /s /c ' framing
  // plus the two outer quote chars rounds out the full command line.
  const commandLineLength = 'cmd.exe /d /s /c '.length + inner.length + 2;
  const safeLimit =
    WINDOWS_CREATE_PROCESS_LIMIT - WINDOWS_CREATE_PROCESS_HEADROOM;
  if (commandLineLength <= safeLimit) return null;
  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message:
      `${def.name} on Windows runs through a .cmd shim and this run's prompt would expand past the CreateProcess command-line limit ` +
      `after cmd.exe quote-doubling (${commandLineLength} > ${safeLimit} chars). ` +
      'Reduce quote-heavy content in the selected skills/design-system context, shorten the conversation, or pick an adapter with stdin support.',
    commandLineLength,
    limit: safeLimit,
  };
}

// Heuristic: does `resolvedBin` look like a Windows path? Used by the
// direct-exe guard so a test on a POSIX host can drive a fake
// `C:\…\foo.exe` path through the same math the daemon would run on
// Windows, while still skipping POSIX-shaped paths (which never go
// through CreateProcess).
function looksLikeWindowsPath(p: unknown): boolean {
  if (typeof p !== 'string' || p.length === 0) return false;
  // Drive-letter (`C:\…`, `C:/…`) or UNC (`\\server\share\…`).
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

// Companion to `checkWindowsCmdShimCommandLineBudget` for argv-bound
// adapters whose binary resolves directly to a Windows executable
// (a cargo-installed `deepseek.exe`, a hand-built release, or any other
// non-shim install path). `createCommandInvocation` does *not* wrap the
// call in `cmd.exe /d /s /c "<inner>"` for those — but Node/libuv still
// composes a CreateProcess `lpCommandLine` by walking each argv entry
// through `quote_cmd_arg`, which doubles backslashes adjacent to quotes
// and escapes every embedded `"` as `\"`. A quote-heavy prompt that fits
// under the raw `maxPromptArgBytes` budget can therefore still expand
// past the kernel's 32_767-char `lpCommandLine` cap on a direct `.exe`
// spawn, surfacing as a generic `spawn ENAMETOOLONG` instead of the
// adapter-named `AGENT_PROMPT_TOO_LARGE` the budget guard exists to
// emit. Returns the same error shape as the cmd-shim guard so the SSE
// error path in `/api/chat` doesn't have to special-case it.
//
// No-op when:
//   - the adapter doesn't declare `maxPromptArgBytes` (stdin adapters
//     never go through this path);
//   - the resolved binary is a `.cmd` / `.bat` shim — that's handled by
//     `checkWindowsCmdShimCommandLineBudget` so we don't double-emit;
//   - the resolved binary is not a Windows path (no CreateProcess
//     command-line shape to budget);
//   - the assembled command line fits under the safe limit.
//
// Pure: takes `resolvedBin` and `args` explicitly so a test on macOS can
// pass a fake `C:\…\deepseek.exe` and exercise the same math the daemon
// would run on Windows. The libuv quoting math lives in
// `quoteForWindowsDirectExe` above.
export function checkWindowsDirectExeCommandLineBudget(
  def: RuntimeAgentDef | null | undefined,
  resolvedBin: unknown,
  args: unknown,
): RuntimePromptBudgetError | null {
  if (!def || typeof def.maxPromptArgBytes !== 'number') return null;
  if (typeof resolvedBin !== 'string' || resolvedBin.length === 0) return null;
  // The cmd-shim guard owns `.bat` / `.cmd`; skip those here so a single
  // oversized prompt doesn't trip both guards.
  if (/\.(bat|cmd)$/i.test(resolvedBin)) return null;
  // Only fire for Windows-shaped resolved binaries. On POSIX-shaped
  // paths, `execvp` accepts each argv entry as a separate buffer —
  // there's no command-line concatenation step that could expand past a
  // kernel cap, so we have nothing to guard.
  if (!looksLikeWindowsPath(resolvedBin)) return null;
  const argList = Array.isArray(args) ? args : [];
  // `[command, ...args].map(quote).join(' ')` is the exact shape libuv
  // builds before handing it to CreateProcess.
  const commandLineLength = [resolvedBin, ...argList]
    .map(quoteForWindowsDirectExe)
    .join(' ').length;
  const safeLimit =
    WINDOWS_CREATE_PROCESS_LIMIT - WINDOWS_CREATE_PROCESS_HEADROOM;
  if (commandLineLength <= safeLimit) return null;
  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message:
      `${def.name} on Windows builds a CreateProcess command line and this run's prompt would expand past the limit ` +
      `after libuv quote-escaping (${commandLineLength} > ${safeLimit} chars). ` +
      'Reduce quote-heavy content in the selected skills/design-system context, shorten the conversation, or pick an adapter with stdin support.',
    commandLineLength,
    limit: safeLimit,
  };
}
