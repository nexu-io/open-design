/** Parse only literal arguments, never evaluate commands or expand variables. */
function literalArgs(command: string): string[] | null {
  const args: string[] = [];
  let word = '';
  let quote = '';
  let started = false;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i]!;
    if (quote === "'") {
      if (c === "'") quote = ''; else word += c;
      continue;
    }
    if (c === '$' || c === '`' || c === '\n' || c === '\r') return null;
    if (c === '\\') {
      const next = command[++i];
      if (!next || next === '\n' || next === '\r') return null;
      if (quote === '"' && !['\\', '"', '$', '`'].includes(next)) return null;
      word += next; started = true; continue;
    }
    if (quote === '"') {
      if (c === '"') quote = ''; else word += c;
      continue;
    }
    if (';&|<>()*?[]{}'.includes(c)) return null;
    if (c === "'" || c === '"') { quote = c; started = true; continue; }
    if (/\s/.test(c)) {
      if (started) { args.push(word); word = ''; started = false; }
    } else { word += c; started = true; }
  }
  if (quote) return null;
  if (started) args.push(word);
  return args;
}

/** Evidence for one complete cat, optionally in a native shell wrapper.
 * Pipelines, ranges, scripts, multiple files and substitutions stay unconfirmed.
 */
export function singleSkillShellRead(command: unknown): string | undefined {
  if (typeof command !== 'string' || command.length > 16_384) return undefined;
  let args = literalArgs(command);
  if (!args) return undefined;
  if (/^(?:\/bin\/|\/usr\/bin\/)?(?:zsh|bash|sh)$/.test(args[0] ?? '')) {
    if (args.length !== 3 || !['-lc', '-c'].includes(args[1]!)) return undefined;
    args = literalArgs(args[2]!);
  }
  if (!args || !['cat', '/bin/cat', '/usr/bin/cat'].includes(args[0] ?? '')) return undefined;
  const paths = args[1] === '--' ? args.slice(2) : args.slice(1);
  return paths.length === 1 && paths[0]!.startsWith('/') ? paths[0] : undefined;
}
