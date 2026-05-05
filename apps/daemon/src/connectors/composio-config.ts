import fs from 'node:fs';
import path from 'node:path';

export interface ComposioConfig {
  apiKey: string;
}

export interface PublicComposioConfig {
  configured: boolean;
  apiKeyTail: string;
}

let configFilePath = path.join(process.cwd(), '.od', 'connectors', 'composio-config.json');

export function configureComposioConfigStore(dataDir: string): void {
  configFilePath = path.join(dataDir, 'connectors', 'composio-config.json');
}

export function readComposioConfig(): ComposioConfig {
  const raw = readRawConfig();
  return normalizeComposioConfig(raw);
}

export function readPublicComposioConfig(): PublicComposioConfig {
  const config = readComposioConfig();
  return {
    configured: Boolean(config.apiKey),
    apiKeyTail: config.apiKey ? config.apiKey.slice(-4) : '',
  };
}

export function writeComposioConfig(input: unknown): PublicComposioConfig {
  const prior = readComposioConfig();
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const hasApiKey = Object.prototype.hasOwnProperty.call(record, 'apiKey');
  const apiKeyInput = normalizeOptionalString(record.apiKey) ?? '';
  const next = normalizeComposioConfig({
    apiKey: hasApiKey ? apiKeyInput : prior.apiKey,
  });
  writeRawConfig(next);
  return readPublicComposioConfig();
}

function readRawConfig(): unknown {
  try {
    return JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as unknown;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeRawConfig(config: ComposioConfig): void {
  fs.mkdirSync(path.dirname(configFilePath), { recursive: true, mode: 0o700 });
  const tempPath = `${configFilePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, configFilePath);
  fs.chmodSync(configFilePath, 0o600);
}

function normalizeComposioConfig(value: unknown): ComposioConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    apiKey: normalizeOptionalString(raw.apiKey) ?? '',
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
