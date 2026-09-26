import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const PLUGIN_COMPATIBILITY_GENERATION = 1;
const COMPOSITION_GENERATION = 1;

function serializeComposition(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const visiting = new Set<object>();
  const serializable = (item: unknown): boolean => {
    if (item === null || item === undefined || typeof item === 'string' || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || visiting.has(item)) return false;
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) return false;
    if (Object.getOwnPropertySymbols(item).length > 0) return false;
    visiting.add(item);
    const valid = Object.values(Object.getOwnPropertyDescriptors(item)).every(
      (descriptor) => !descriptor.get && !descriptor.set && serializable(descriptor.value),
    );
    visiting.delete(item);
    return valid;
  };
  return serializable(value) ? JSON.stringify(value) : null;
}

export function resolveCompatibilityGeneration(
  launcher: string | undefined,
  composition: unknown,
  processStartedAt = performance.timeOrigin,
): string | null {
  const serialized = serializeComposition(composition);
  if (!launcher || serialized === null) return null;
  try {
    const executable = realpathSync(launcher);
    let directory = path.dirname(executable);
    while (true) {
      let manifest: unknown;
      const manifestPath = path.join(directory, 'package.json');
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch (error) {
        if (!(error instanceof Error)) throw error;
      }
      if (manifest && typeof manifest === 'object' && 'name' in manifest &&
          manifest.name === '@deepseek-ai/dsh' && 'version' in manifest &&
          typeof manifest.version === 'string' && manifest.version.length > 0) {
        const executableBytes = readFileSync(executable);
        const identityFiles = [statSync(executable), statSync(manifestPath)];
        if (identityFiles.some((file) => Math.max(file.ctimeMs, file.mtimeMs) > processStartedAt)) return null;
        return createHash('sha256')
          .update(JSON.stringify({
            protocol: 1,
            plugin: PLUGIN_COMPATIBILITY_GENERATION,
            composition: COMPOSITION_GENERATION,
            executable,
            runtime: manifest.version,
          }))
          .update(executableBytes)
          .update(serialized)
          .digest('hex');
      }
      const parent = path.dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}
