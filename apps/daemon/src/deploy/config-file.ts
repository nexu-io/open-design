import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const configFileLocks = new Map<string, Promise<void>>();

export async function withDeployConfigFileLock<T>(
  file: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = configFileLocks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  configFileLocks.set(file, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (configFileLocks.get(file) === tail) configFileLocks.delete(file);
  }
}

export async function writeDeployConfigFile(file: string, config: object): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await rename(tempFile, file);
  } catch (error) {
    await rm(tempFile, { force: true }).catch(() => undefined);
    throw error;
  }
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
}
