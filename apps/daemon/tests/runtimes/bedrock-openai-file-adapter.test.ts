import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BEDROCK_OPENAI_FILE_ADAPTER_PLUGIN_SOURCE,
  ensureBedrockOpenAiFileAdapterPlugin,
} from '../../src/runtimes/bedrock-openai-file-adapter.js';

describe('bedrock-openai-file-adapter', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('materializes the plugin under the data dir and returns its file URL', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'od-bedrock-adapter-'));
    dirs.push(dataDir);
    const url = ensureBedrockOpenAiFileAdapterPlugin(dataDir);
    expect(url.startsWith('file://')).toBe(true);
    const file = fileURLToPath(url);
    expect(path.dirname(file)).toBe(path.join(dataDir, 'opencode-plugins'));
    expect(readFileSync(file, 'utf8')).toBe(BEDROCK_OPENAI_FILE_ADAPTER_PLUGIN_SOURCE);
  });

  it('does not rewrite an up-to-date plugin file', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'od-bedrock-adapter-'));
    dirs.push(dataDir);
    const file = fileURLToPath(ensureBedrockOpenAiFileAdapterPlugin(dataDir));
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(file, past, past);
    ensureBedrockOpenAiFileAdapterPlugin(dataDir);
    expect(statSync(file).mtimeMs).toBe(past.getTime());
  });

  it('rewrites a stale plugin file', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'od-bedrock-adapter-'));
    dirs.push(dataDir);
    const file = fileURLToPath(ensureBedrockOpenAiFileAdapterPlugin(dataDir));
    writeFileSync(file, '// stale', 'utf8');
    ensureBedrockOpenAiFileAdapterPlugin(dataDir);
    expect(readFileSync(file, 'utf8')).toBe(BEDROCK_OPENAI_FILE_ADAPTER_PLUGIN_SOURCE);
  });

  it('ships a plugin that hooks the messages transform and only touches PDF tool attachments', () => {
    expect(BEDROCK_OPENAI_FILE_ADAPTER_PLUGIN_SOURCE).toContain('"experimental.chat.messages.transform"');
    expect(BEDROCK_OPENAI_FILE_ADAPTER_PLUGIN_SOURCE).toContain('"application/pdf"');
    expect(BEDROCK_OPENAI_FILE_ADAPTER_PLUGIN_SOURCE).toContain('export const BedrockOpenAIFileAdapter');
  });
});
