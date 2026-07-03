// @ts-nocheck
/** @module cli/core/flags
 * Whitelist-driven flag parser: core primitive for subcommands. parseFlags
 * enforces strict unknown-flag rejection so hallucinated flags fail fast.
 * Also: positional arg extraction, type coercion (string→boolean/number).
 * Foundation kernel: imports no sibling subdirectory.
 */

/**
 * Generic list-command flag whitelists shared by the library AND system
 * domains — that cross-domain use is why they live in core despite the
 * LIBRARY_ name. Used by `od library …`, `od skills …`, `od craft …`,
 * `od design-systems …`, and system domain subcommands.
 */
export const LIBRARY_STRING_FLAGS = new Set(['daemon-url', 'query', 'tag']);

/**
 * Generic list-command boolean flag whitelist (--help, --json) shared by
 * library and system domains.
 */
export const LIBRARY_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);

/**
 * Whitelist-enforced flag parser: returns a plain object of parsed flags.
 * Unknown --flags throw an error so misspelled flags fail fast; flag values
 * are provided via `--key=value` or `--key value` (for string flags).
 * Boolean flags take no value; positionals pass through silently (callers
 * that handle positional args re-scan argv themselves).
 * @param {Array<string>} argv - Raw argv slice (typically args[1..])
 * @param {object} opts - { string: Set<string>, boolean: Set<string> }
 * @returns {object} Parsed flags object: { key1: value1, key2: true, ... }
 */
export function parseFlags(argv, opts = {}) {
  const stringFlags = opts.string instanceof Set ? opts.string : new Set();
  const booleanFlags = opts.boolean instanceof Set ? opts.boolean : new Set();
  const knownFlags = new Set([...stringFlags, ...booleanFlags]);
  // Positionals collected silently; callers that take `<id>` style
  // positional args (e.g. `od plugin info <id>`) re-scan `argv`
  // themselves to pick them up. Strict positional rejection here
  // would break those commands, so we only enforce strict-flag
  // semantics for things that *are* prefixed with `--`.
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) {
      // Positional — let the caller decide what to do with it.
      continue;
    }
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (knownFlags.size > 0 && !knownFlags.has(key)) {
      throw new Error(
        `unknown flag: --${key}. Run with --help for the list of accepted flags.`,
      );
    }
    if (eq >= 0) {
      out[key] = a.slice(eq + 1);
      continue;
    }
    if (booleanFlags.has(key)) {
      out[key] = true;
      continue;
    }
    if (stringFlags.has(key)) {
      const next = argv[i + 1];
      if (next == null) {
        throw new Error(`flag --${key} requires a value`);
      }
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

/**
 * Extracts positional (non-flag) arguments from argv. Skips over string-flag
 * values (e.g., if --query is in stringFlags, the value after --query is not
 * a positional). Returns a list of positionals in order.
 * @param {Array<string>} argv - Raw argv slice
 * @param {Set<string>} stringFlags - Set of flag names that consume the next value
 * @returns {Array<string>} Positional arguments
 */
export function positionalArgs(argv, stringFlags = new Set()) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (!a.startsWith('--')) {
      out.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (eq < 0 && stringFlags.has(key)) i++;
  }
  return out;
}

/**
 * Coerces a string flag value to its native type: 'true'/'false' →
 * boolean, numeric strings → number, otherwise returns the raw string.
 * Used by the config and plugin domains to convert `--flag=value` strings
 * into application-native types.
 * @param {string} raw - Raw string value from flag
 * @returns {boolean|number|string} Coerced value
 */
export function coerceCliValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}
