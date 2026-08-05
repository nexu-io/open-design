export type CliFlagValue = string | boolean;
export type CliFlags = Record<string, CliFlagValue>;

export interface CliFlagOptions {
  string?: ReadonlySet<string>;
  boolean?: ReadonlySet<string>;
}

export function parseFlags(
  argv: readonly string[],
  opts: CliFlagOptions = {},
): CliFlags {
  const stringFlags = opts.string instanceof Set ? opts.string : new Set<string>();
  const booleanFlags = opts.boolean instanceof Set ? opts.boolean : new Set<string>();
  const knownFlags = new Set([...stringFlags, ...booleanFlags]);
  // Positionals are collected silently; callers that take positional args
  // rescan argv themselves. Strictness applies only to --prefixed values.
  const out: CliFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value || !value.startsWith('--')) continue;
    const equals = value.indexOf('=');
    const key = equals >= 0 ? value.slice(2, equals) : value.slice(2);
    if (knownFlags.size > 0 && !knownFlags.has(key)) {
      throw new Error(
        `unknown flag: --${key}. Run with --help for the list of accepted flags.`,
      );
    }
    if (equals >= 0) {
      out[key] = value.slice(equals + 1);
      continue;
    }
    if (booleanFlags.has(key)) {
      out[key] = true;
      continue;
    }
    if (stringFlags.has(key)) {
      const next = argv[i + 1];
      if (next == null) throw new Error(`flag --${key} requires a value`);
      out[key] = next;
      i++;
      continue;
    }
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function positionalArgs(
  argv: readonly string[],
  stringFlags: ReadonlySet<string> = new Set<string>(),
): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value) continue;
    if (!value.startsWith('--')) {
      out.push(value);
      continue;
    }
    const equals = value.indexOf('=');
    const key = equals >= 0 ? value.slice(2, equals) : value.slice(2);
    if (equals < 0 && stringFlags.has(key)) i++;
  }
  return out;
}

export function collectCliPositionals(
  argv: readonly string[],
  stringFlags: ReadonlySet<string> = new Set<string>(),
): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value == null) continue;
    if (value === '--') {
      out.push(...argv.slice(i + 1));
      break;
    }
    if (value.startsWith('--')) {
      const equals = value.indexOf('=');
      const key = equals >= 0 ? value.slice(2, equals) : value.slice(2);
      if (equals < 0 && stringFlags.has(key)) i++;
      continue;
    }
    out.push(value);
  }
  return out;
}
