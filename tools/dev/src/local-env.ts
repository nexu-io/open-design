import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const DEFAULT_LOCAL_ENV_FILE_NAMES = [".env.development.local", ".env.local", ".env.development", ".env"] as const;
export const LOCAL_DEVELOPMENT_TELEMETRY_ENV = "local_development";
export const TELEMETRY_ENV_KEY = "OD_TELEMETRY_ENV";

export interface LoadWorkspaceLocalEnvResult {
  envPath: string | null;
  loaded: boolean;
  loadedFiles: string[];
  keys: string[];
  skippedFiles: string[];
}

export function loadWorkspaceLocalEnv(options: {
  args?: readonly string[];
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): LoadWorkspaceLocalEnvResult {
  const flags = parseLocalEnvFlags(options.args ?? []);
  if (flags.disabled || flags.help) return { envPath: null, loaded: false, loadedFiles: [], keys: [], skippedFiles: [] };

  const env = options.env ?? process.env;
  const envFileNames = flags.explicitFiles.length > 0 ? flags.explicitFiles : [...DEFAULT_LOCAL_ENV_FILE_NAMES];
  const explicit = flags.explicitFiles.length > 0;
  const loadedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const loadedKeys = new Set<string>();

  for (const fileName of envFileNames) {
    const envPath = resolveEnvFilePath(options.workspaceRoot, fileName);
    if (!isReadableFile(envPath)) {
      if (explicit) throw new Error(`env file not found: ${fileName}`);
      skippedFiles.push(fileName);
      continue;
    }

    const parsed = parseDotEnvLocal(readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (loadedKeys.has(key)) continue;
      env[key] = value;
      loadedKeys.add(key);
    }
    loadedFiles.push(fileName);
  }

  if (loadedFiles.length === 0) {
    return { envPath: null, loaded: false, loadedFiles, keys: [], skippedFiles };
  }

  if (env[TELEMETRY_ENV_KEY] == null || env[TELEMETRY_ENV_KEY]?.trim() === "") {
    env[TELEMETRY_ENV_KEY] = LOCAL_DEVELOPMENT_TELEMETRY_ENV;
    loadedKeys.add(TELEMETRY_ENV_KEY);
  }
  if (!flags.json) {
    options.log?.(`tools-dev env: loaded ${loadedFiles.join(", ")}`);
  }

  return {
    envPath: resolveEnvFilePath(options.workspaceRoot, loadedFiles[0]!),
    loaded: true,
    loadedFiles,
    keys: [...loadedKeys].sort(),
    skippedFiles,
  };
}

function parseLocalEnvFlags(args: readonly string[]): {
  disabled: boolean;
  explicitFiles: string[];
  help: boolean;
  json: boolean;
} {
  const explicitFiles: string[] = [];
  let disabled = false;
  let help = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") break;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h" || arg === "help") {
      help = true;
      continue;
    }
    if (arg === "--no-env-file") {
      disabled = true;
      continue;
    }
    if (arg === "--env-file") {
      const value = args[index + 1];
      if (value == null || value.startsWith("-")) throw new Error("--env-file requires a path");
      explicitFiles.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      const value = arg.slice("--env-file=".length);
      if (value.length === 0) throw new Error("--env-file requires a path");
      explicitFiles.push(value);
    }
  }

  return { disabled, explicitFiles, help, json };
}

function resolveEnvFilePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
}

function isReadableFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

export function parseDotEnvLocal(content: string): Record<string, string> {
  const parsed: Record<string, string> = Object.create(null);
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    const rawValue = normalized.slice(equalsIndex + 1).trim();
    parsed[key] = parseDotEnvValue(rawValue);
  }
  return parsed;
}

function parseDotEnvValue(rawValue: string): string {
  if (rawValue.startsWith("\"") || rawValue.startsWith("'")) {
    return parseQuotedValue(rawValue);
  }
  return stripInlineComment(rawValue).trim();
}

function parseQuotedValue(rawValue: string): string {
  const quote = rawValue[0]!;
  let escaped = false;
  let value = "";
  for (let i = 1; i < rawValue.length; i += 1) {
    const char = rawValue[i]!;
    if (escaped) {
      value += quote === "\"" ? decodeEscape(char) : char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) return value;
    value += char;
  }
  return value;
}

function decodeEscape(char: string): string {
  if (char === "n") return "\n";
  if (char === "r") return "\r";
  if (char === "t") return "\t";
  return char;
}

function stripInlineComment(value: string): string {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== "#") continue;
    if (i === 0 || /\s/.test(value[i - 1]!)) return value.slice(0, i);
  }
  return value;
}
