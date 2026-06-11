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
}

// Flags accepted by virtually every subcommand (the library/diagnostics/config
// handlers all parse these). Offered after `--` on any command.
export const GLOBAL_FLAGS = ['--help', '--json', '--daemon-url'] as const;

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
      'create', 'delete', 'editors', 'import', 'import-folder', 'info',
      'list', 'open-in',
    ],
  },
  automation: {
    subcommands: [
      'ingest', 'proposal', 'proposals', 'source', 'sources', 'template',
      'templates',
    ],
  },
  automations: {
    subcommands: [
      'ingest', 'proposal', 'proposals', 'source', 'sources', 'template',
      'templates',
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
  daemon: { subcommands: ['db', 'start', 'status', 'stop', 'vacuum', 'verify'] },
  atoms: { subcommands: ['info', 'list', 'show'] },
  skills: { subcommands: [] },
  'design-systems': {
    subcommands: [
      'rename', 'import-local', 'import-github', 'import-shadcn',
      'rebuild-token-contract',
    ],
  },
  craft: { subcommands: [] },
  diagnostics: { subcommands: [] },
  status: { subcommands: [] },
  version: { subcommands: [] },
  doctor: { subcommands: [] },
  config: { subcommands: ['get', 'set', 'list', 'unset'] },
  completion: { subcommands: [...SUPPORTED_SHELLS] },
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

function collectCandidates(words: string[], current: string): string[] {
  // 1. Flag completion takes precedence regardless of position.
  if (current.startsWith('-')) {
    return [...GLOBAL_FLAGS];
  }

  // Only the command path matters for positional completion; ignore any flags
  // the user already typed (e.g. `od --json <TAB>` still completes commands).
  const positionals = words.filter((w) => !w.startsWith('-'));

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

  // 3. Exactly the command typed -> its subcommands + global flags.
  if (positionals.length === 1) {
    return [...spec.subcommands, ...GLOBAL_FLAGS];
  }

  // 4. Deeper paths -> global flags only.
  return [...GLOBAL_FLAGS];
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
    set -l tokens (commandline -opc)
    set -l cur (commandline -ct)
    # Drop the leading 'od' from the token list.
    set -e tokens[1]
    od completion __complete --current "$cur" -- $tokens 2>/dev/null
end
complete -c od -f -a '(__od_complete)'
`;
