import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RuntimeAgentDef } from './types.js';

export type PreparedPromptFile = {
  path: string;
  cleanup: () => Promise<void>;
};

export async function preparePromptFileForAgent(
  def: RuntimeAgentDef | null | undefined,
  prompt: string,
  label: string,
): Promise<PreparedPromptFile | null> {
  if (!def?.promptViaFile) return null;

  const safeLabel = label.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 80) || 'prompt';
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `od-${def.id}-${safeLabel}-`));
  const filePath = path.join(dir, 'prompt.md');
  await fs.writeFile(filePath, prompt, { encoding: 'utf8', mode: 0o600 });

  return {
    path: filePath,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
