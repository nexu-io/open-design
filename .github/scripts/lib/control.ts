import { DIGEST_PATTERN, type Digest } from "./json.ts";

type Ensure = Readonly<{
  array(value: unknown, label: string): unknown[];
  digest(value: unknown, label: string): Digest;
  exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void;
  integer(value: unknown, label: string): number;
  never(message: string): never;
  record(value: unknown, label: string): Record<string, unknown>;
  that(condition: unknown, message: string): asserts condition;
  text(value: unknown, label: string): string;
}>;

export const ensure: Ensure = Object.freeze({
  array(value, label) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
    return value;
  },
  digest(value, label) {
    if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new Error(`${label} must be a sha256 digest`);
    return value as Digest;
  },
  exactKeys(value, allowed, label) {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(", ")}`);
  },
  integer(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
    return Number(value);
  },
  never(message) {
    throw new Error(message);
  },
  record(value, label) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
    return value as Record<string, unknown>;
  },
  that(condition, message) {
    if (!condition) throw new Error(message);
  },
  text(value, label) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
    return value;
  },
});

export const fail = ensure.never;

export function switchBy<Key extends string, Result>(
  key: Key,
  branches: Readonly<Record<Key, () => Result>>,
): Result {
  const branch = branches[key];
  ensure.that(branch != null, `unsupported switch value: ${key}`);
  return branch();
}

export class Options {
  readonly #values: ReadonlyMap<string, string>;

  constructor(values: Readonly<Record<string, string>>) {
    this.#values = new Map(Object.entries(values));
  }

  get(name: string): string {
    return this.#values.get(name) ?? ensure.never(`--${name} is required`);
  }

  optional(name: string): string | undefined {
    return this.#values.get(name);
  }
}

type Command = Readonly<{
  options: readonly string[];
  run: (args: Options) => Promise<void> | void;
}>;

export function command(options: readonly string[], run: Command["run"]): Command {
  const sorted = [...options].sort();
  ensure.that(new Set(sorted).size === sorted.length, "command options must not contain duplicates");
  return Object.freeze({ options: Object.freeze(sorted), run });
}

export function commands<const Table extends Readonly<Record<string, Command>>>(
  table: Table,
  usage: () => string,
) {
  return Object.freeze({
    async run(argv: readonly string[]): Promise<void> {
      const [name, ...args] = argv;
      ensure.that(name != null && Object.hasOwn(table, name), `unknown command: ${name ?? ""}\n${usage()}`);
      const selected = table[name as keyof Table]!;
      ensure.that(args.length % 2 === 0, `${name} options must be --name value pairs`);
      const values: Record<string, string> = {};
      for (let index = 0; index < args.length; index += 2) {
        const rawKey = args[index]!;
        const key = rawKey.replace(/^--/u, "");
        ensure.that(rawKey === `--${key}` && selected.options.includes(key), `${name} does not support ${rawKey}`);
        ensure.that(values[key] == null, `${name} received duplicate option ${rawKey}`);
        const value = args[index + 1];
        ensure.that(value != null && !value.startsWith("--"), `${rawKey} requires a value`);
        values[key] = value;
      }
      await selected.run(new Options(values));
    },
  });
}
