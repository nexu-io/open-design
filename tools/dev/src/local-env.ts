import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const LOCAL_ENV_FILE_NAME = ".env.local";
export const LOCAL_DEVELOPMENT_TELEMETRY_ENV = "local_development";
export const TELEMETRY_ENV_KEY = "OD_TELEMETRY_ENV";

export interface LoadWorkspaceLocalEnvResult {
  envPath: string;
  loaded: boolean;
  keys: string[];
}

export function loadWorkspaceLocalEnv(options: {
  workspaceRoot: string;
  env?: NodeJS.ProcessEnv;
}): LoadWorkspaceLocalEnvResult {
  const env = options.env ?? process.env;
  const envPath = path.join(options.workspaceRoot, LOCAL_ENV_FILE_NAME);
  if (!existsSync(envPath)) return { envPath, loaded: false, keys: [] };

  const parsed = parseDotEnvLocal(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    env[key] = value;
  }
  if (env[TELEMETRY_ENV_KEY] == null || env[TELEMETRY_ENV_KEY]?.trim() === "") {
    env[TELEMETRY_ENV_KEY] = LOCAL_DEVELOPMENT_TELEMETRY_ENV;
  }
  return { envPath, loaded: true, keys: Object.keys(parsed).sort() };
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
