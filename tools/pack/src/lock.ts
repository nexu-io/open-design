import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const LOCK_POLL_MS = 100;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDirectoryLock<T>(
  lockRoot: string,
  lockName: string,
  callback: () => Promise<T>,
): Promise<T> {
  await mkdir(lockRoot, { recursive: true });
  const lockPath = join(lockRoot, `${lockName}.lock`);
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        const owner = await readFile(join(lockPath, "owner.json"), "utf8").catch(() => null);
        throw new Error(`timed out waiting for lock ${lockPath}${owner == null ? "" : ` owned by ${owner}`}`);
      }
      await sleep(LOCK_POLL_MS);
    }
  }

  try {
    await writeFile(
      join(lockPath, "owner.json"),
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
    return await callback();
  } finally {
    await rm(lockPath, { force: true, recursive: true });
  }
}
