// ---------------------------------------------------------------------------
// `od completion` — shell autocompletion for bash / zsh / fish.
//
// `od` is a keyword-dispatched CLI with ~27 top-level subcommands, many of
// which have their own second level (`od config get`, `od plugin install`,
// `od run watch`, …). Typing those from memory is the friction this removes.
//
// Design (mirrors app-version.ts: pure logic here, thin wrapper in cli.ts):
//
//   - COMMAND_SPEC is the single source of truth — top-level commands, their
//     known subcommands, and the global flags every command accepts.
//   - generateCompletionScript(shell) emits a small static script the user
//     sources once. That script shells back out to `od completion __complete`
//     on every <TAB>, so completions never drift from the CLI: there is no
//     second list of commands baked into the shell script to keep in sync.
//   - computeCompletions({ words, current }) is that runtime resolver. It is
//     pure and synchronous (no daemon round-trip), so <TAB> stays instant and
//     works even when the daemon is not running.
//
// Zero dependencies — stdlib string work only, per CONTRIBUTING ("no new
// top-level dependencies").
// ---------------------------------------------------------------------------

export const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'] as const;
export type Shell = (typeof SUPPORTED_SHELLS)[number];

export function isSupportedShell(value: string): value is Shell {
  return (SUPPORTED_SHELLS as readonly string[]).includes(value);
}

/**
 * Static description of the command tree, used to drive completion.
 *
 * `subcommands` lists the known second-level keywords for a command (empty
 * when a command takes only positionals/flags). This is intentionally a
 * hand-maintained, conservative list: it covers the stable, documented
 * subcommands and is safe to extend as the CLI grows. Completion degrades
 * gracefully — an unknown command simply offers the global flags.
 */
export interface CommandSpec {
  /** Second-level keywords, e.g. config -> [get, set, list, unset]. */
  subcommands: string[];
  /**
   * Flags this command actually accepts. When omitted the command inherits
   * GLOBAL_FLAGS. Set it when a command only handles a subset — e.g.
   * `completion` parses --help but not --json/--daemon-url, so advertising the
   * full global set would suggest flags that error when used.
   */
  flags?: readonly string[];
}

// Flags accepted by virtually every subcommand (the library/diagnostics/config
// handlers all parse these). Offered after `--` on any command.
export const GLOBAL_FLAGS = ['--help', '--json', '--daemon-url'] as const;

// Global flags that consume the following token as their value (so it must not
// be mistaken for a command/subcommand during completion). `--help`/`--json`
// are booleans and take no value. Mirrors the CLI router, which skips the
// value token for string flags like `--daemon-url <url>`.
const VALUE_FLAGS = new Set(['--daemon-url']);

// Top-level commands and their known subcommands. Kept in sync with the
// SUBCOMMAND_MAP in cli.ts; aliases (e.g. `automations`) are included so a
// user who types either gets completion.
export const COMMAND_SPEC: Record<string, CommandSpec> = {
  artifacts: { subcommands: [] },
  media: { subcommands: ['generate', 'wait'] },
  mcp: { subcommands: ['install'] },
  research: { subcommands: ['search'] },
  plugin: {
    subcommands: [
      'apply', 'candidates', 'canon', 'diff', 'doctor', 'events', 'export',
      'info', 'install', 'list', 'login', 'manifest', 'open-design-pr', 'pack',
      'publish', 'publish-repo', 'replay', 'run', 'scaffold', 'search',
      'simulate', 'snapshots', 'sources', 'stats', 'trust', 'uninstall',
      'upgrade', 'validate', 'verify', 'whoami', 'yank',
    ],
  },
  ui: { subcommands: ['list', 'show', 'respond', 'revoke', 'prefill'] },
  marketplace: {
    subcommands: [
      'add', 'doctor', 'info', 'list', 'login', 'plugins', 'refresh',
      'remove', 'search', 'trust',
    ],
  },
  share: { subcommands: ['url'] },
  project: {
    subcommands: [
      'create', 'delete', 'editors', 'handoff', 'import', 'import-folder',
      'info', 'list', 'open-in',
    ],
  },
  // runAutomation dispatches the routine lifecycle verbs plus the
  // ingest/proposal(s)/source(s)/template(s) families.
  automation: {
    subcommands: [
      'create', 'crystallize-run', 'delete', 'get', 'ingest', 'list', 'pause',
      'proposal', 'proposals', 'resume', 'run', 'runs', 'source', 'sources',
      'template', 'templates', 'update',
    ],
  },
  automations: {
    subcommands: [
      'create', 'crystallize-run', 'delete', 'get', 'ingest', 'list', 'pause',
      'proposal', 'proposals', 'resume', 'run', 'runs', 'source', 'sources',
      'template', 'templates', 'update',
    ],
  },
  memory: { subcommands: ['tree'] },
  run: { subcommands: ['cancel', 'info', 'list', 'redesign', 'start', 'watch'] },
  files: { subcommands: ['delete', 'diff', 'list', 'read', 'upload', 'write'] },
  templates: { subcommands: ['delete', 'list', 'save'] },
  conversation: {
    subcommands: ['db', 'info', 'list', 'new', 'start', 'status', 'stop'],
  },
  chat: { subcommands: ['new'] },
  // runDaemon dispatches start/status/stop/db only. `vacuum`/`verify` live
  // under `od daemon db`, not at the top level, so they are NOT listed here.
  daemon: { subcommands: ['db', 'start', 'status', 'stop'] },
  atoms: { subcommands: ['info', 'list', 'show'] },
  // skills/craft go through runLibraryList, which accepts list/show.
  skills: { subcommands: ['list', 'show'] },
  'design-systems': {
    // Explicit verbs plus the runLibraryList fallback (list/show).
    subcommands: [
      'rename', 'import-local', 'import-github', 'import-shadcn',
      'rebuild-token-contract', 'list', 'show',
    ],
  },
  craft: { subcommands: ['list', 'show'] },
  diagnostics: { subcommands: [] },
  status: { subcommands: [] },
  version: { subcommands: [] },
  doctor: { subcommands: [] },
  config: { subcommands: ['get', 'set', 'list', 'unset'] },
  // `od completion` only parses --help; --json/--daemon-url are not accepted
  // (they fall through runCompletion's shell check and error). Restrict the
  // offered flags so completion never suggests a flag that would fail.
  completion: { subcommands: [...SUPPORTED_SHELLS], flags: ['--help'] },
};

/** Sorted list of all top-level command names. */
export function topLevelCommands(): string[] {
  return Object.keys(COMMAND_SPEC).sort();
}

export interface CompletionRequest {
  /**
   * The argv *after* `od`, as the shell sees it, excluding the token currently
   * being typed. E.g. for `od config <TAB>` -> [], for `od config g<TAB>` ->
   * ['config'].
   */
  words: string[];
  /** The partial token under the cursor (may be ''). */
  current: string;
}

/**
 * Parse the args passed to the hidden `od completion __complete` resolver into
 * a {@link CompletionRequest}. The wire form is:
 *
 *   --current <partial> -- <word> <word> ...
 *
 * Scans left-to-right so `--current`'s value is consumed before we look for the
 * `--` words separator. A naive `indexOf('--')` breaks when the partial token
 * is literally `--` (e.g. `od completion --<TAB>`): the `--current` value would
 * be mistaken for the separator, dropping the prefix filter.
 *
 * @param args argv after the `__complete` keyword.
 */
export function parseCompleteArgs(args: string[]): CompletionRequest {
  let current = '';
  let words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (tok === '--current') {
      current = args[i + 1] ?? '';
      i++; // consume the value, whatever it is (including '--')
      continue;
    }
    if (tok === '--') {
      words = args.slice(i + 1);
      break;
    }
  }
  return { words, current };
}

/**
 * Resolve the candidate completions for a partially-typed `od` command line.
 *
 * Rules, in order:
 *   1. If the current token starts with '-', offer global flags.
 *   2. If no command word is present yet, offer all top-level commands.
 *   3. If exactly the command word is present, offer its subcommands (plus
 *      global flags), or just global flags when it has none.
 *   4. Deeper than that, offer global flags only (positionals are
 *      command-specific and not enumerable without a daemon round-trip).
 *
 * Results are filtered by `current` (prefix match) and de-duplicated, sorted.
 */
export function computeCompletions(req: CompletionRequest): string[] {
  const { words, current } = req;
  const candidates = collectCandidates(words, current);
  const filtered = current
    ? candidates.filter((c) => c.startsWith(current))
    : candidates;
  return [...new Set(filtered)].sort();
}

// Flags to offer for the command currently on the line. Honors a command's
// `flags` override (e.g. `completion` only accepts --help) and falls back to
// GLOBAL_FLAGS for everything else, including an unknown/absent command.
function flagsForCommand(words: string[]): readonly string[] {
  const command = collectPositionals(words)[0];
  const spec = command ? COMMAND_SPEC[command] : undefined;
  return spec?.flags ?? GLOBAL_FLAGS;
}

function collectCandidates(words: string[], current: string): string[] {
  // 1. Flag completion takes precedence regardless of position. Offer the flag
  // set the command on the line actually accepts, not the global default.
  if (current.startsWith('-')) {
    return [...flagsForCommand(words)];
  }

  // Only the command path matters for positional completion; ignore any flags
  // the user already typed (e.g. `od --json <TAB>` still completes commands).
  const positionals = collectPositionals(words);

  // 2. No command yet -> top-level commands.
  if (positionals.length === 0) {
    return topLevelCommands();
  }

  const command = positionals[0];
  const spec = command ? COMMAND_SPEC[command] : undefined;

  // Unknown command (typo or not-yet-specced) -> nothing positional to add;
  // fall back to global flags so <TAB> is never empty-handed.
  if (!spec) {
    return [...GLOBAL_FLAGS];
  }

  // 3. Exactly the command typed -> its subcommands + the flags it accepts.
  if (positionals.length === 1) {
    return [...spec.subcommands, ...(spec.flags ?? GLOBAL_FLAGS)];
  }

  // 4. Deeper paths -> the command's accepted flags.
  return [...(spec.flags ?? GLOBAL_FLAGS)];
}

/**
 * Extract the positional command path from already-typed words, skipping flags
 * and — crucially — the value token consumed by a value-taking flag. Without
 * this, `--daemon-url http://host` would leave `http://host` as a fake first
 * positional and suppress top-level command completion. `--daemon-url=<url>` is
 * a single token and is dropped by the leading-dash check.
 */
function collectPositionals(words: string[]): string[] {
  const positionals: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    if (word.startsWith('-')) {
      // `--flag value` form: consume the next token as the flag's value so it
      // is not treated as a positional. The `--flag=value` form carries its
      // value inline, so nothing extra is consumed.
      if (VALUE_FLAGS.has(word) && i + 1 < words.length) {
        i++;
      }
      continue;
    }
    positionals.push(word);
  }
  return positionals;
}

/**
 * Emit the shell-specific completion script. The script delegates to
 * `od completion __complete` at runtime so it never carries a stale copy of
 * the command list.
 */
export function generateCompletionScript(shell: Shell): string {
  switch (shell) {
    case 'bash':
      return BASH_SCRIPT;
    case 'zsh':
      return ZSH_SCRIPT;
    case 'fish':
      return FISH_SCRIPT;
  }
}

// `_od_complete` passes the already-typed words and the current partial token
// to `od completion __complete`, which prints one candidate per line.
const BASH_SCRIPT = `# od bash completion
# Install: od completion bash >> ~/.bashrc   (then restart your shell)
_od_complete() {
  local cur words cword
  cur="\${COMP_WORDS[COMP_CWORD]}"
  # Words after 'od', excluding the token under the cursor.
  words=("\${COMP_WORDS[@]:1:COMP_CWORD-1}")
  local IFS=$'\\n'
  local completions
  completions="$(od completion __complete --current "\${cur}" -- "\${words[@]}" 2>/dev/null)"
  COMPREPLY=( $(compgen -W "\${completions}" -- "\${cur}") )
}
complete -F _od_complete od
`;

const ZSH_SCRIPT = `# od zsh completion
# Install: od completion zsh > "\${fpath[1]}/_od"   (then restart your shell)
#   or:    od completion zsh >> ~/.zshrc
_od() {
  local -a completions
  local cur="\${words[CURRENT]}"
  local -a prior=("\${words[2,CURRENT-1]}")
  completions=(\${(f)"$(od completion __complete --current "\${cur}" -- "\${prior[@]}" 2>/dev/null)"})
  compadd -- \${completions}
}
compdef _od od
`;

const FISH_SCRIPT = `# od fish completion
# Install: od completion fish > ~/.config/fish/completions/od.fish
function __od_complete
    # -xpc tokenizes the command line up to but EXCLUDING the token currently
    # being typed, matching the resolver contract (words must not include the
    # in-progress token). Using -opc would pass e.g. \`co\` as both a word and
    # as --current, so \`od co<TAB>\` would treat \`co\` as an unknown command.
    set -l tokens (commandline -xpc)
    set -l cur (commandline -ct)
    # Drop the leading 'od' from the token list.
    set -e tokens[1]
    od completion __complete --current "$cur" -- $tokens 2>/dev/null
end
complete -c od -f -a '(__od_complete)'
`;
