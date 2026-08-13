import { readFile } from 'node:fs/promises';

import { resolveClosureStorePaths } from '@open-design/closure/store';

export async function readPackagedClosureBinding(input: {
  channel: string;
  label: string;
  namespace: string;
  root: string;
}): Promise<Record<string, unknown>> {
  const bindingPath = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.root,
  }).bindingPath;
  const source = await readFile(bindingPath, 'utf8');
  const value = JSON.parse(source.replace(/^\uFEFF/u, '')) as unknown;
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${input.label} Closure binding is invalid: ${bindingPath}`);
  }
  return value as Record<string, unknown>;
}
