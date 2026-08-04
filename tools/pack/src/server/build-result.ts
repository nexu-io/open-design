import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type { ServerBuildResult } from "./build.js";

/**
 * Persist the final server build result independently from command stdout.
 *
 * Package and Web builds intentionally inherit stdout for live operator logs,
 * so machine consumers need a separate file that contains only the final JSON.
 */
export async function writeServerBuildResultJson(
  outputPath: string,
  result: ServerBuildResult,
): Promise<void> {
  const destination = resolve(outputPath);
  const outputDirectory = dirname(destination);
  const temporaryPath = join(
    outputDirectory,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await mkdir(outputDirectory, { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(result, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}
