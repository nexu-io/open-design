import { execFile as execFileCallback } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  parseReleaseBaseVersion,
  type ReleaseBaseVersionTuple,
} from "@open-design/release";

const execFile = promisify(execFileCallback);
const stableTagPattern = /^open-design-v(\d+\.\d+\.\d+)$/;

export type ParsedStableTagVersion = {
  parsed: ReleaseBaseVersionTuple;
  value: string;
};

type Fail = (message: string) => never;

export function readStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readNumberField(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

export function extractStableVersionFromTag(tag: string): ParsedStableTagVersion | null {
  const match = stableTagPattern.exec(tag);
  if (match?.[1] == null) return null;
  const parsed = parseReleaseBaseVersion(match[1]);
  return parsed == null ? null : { parsed, value: match[1] };
}

export async function readShellVersion(fail: Fail): Promise<string> {
  const packageJsonPath = join(process.cwd(), "shells", "electron", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };

  if (typeof packageJson.version !== "string") {
    fail(`missing version in ${packageJsonPath}`);
  }
  if (parseReleaseBaseVersion(packageJson.version) == null) {
    fail(`shells/electron/package.json version must be a stable x.y.z base version; got ${packageJson.version}`);
  }
  return packageJson.version;
}

export async function fetchGitTags(pattern: string): Promise<string[]> {
  const { stdout } = await execFile("git", ["tag", "--list", pattern]);
  return stdout
    .split("\n")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function fetchOptionalHttpsText(
  url: string,
  options: {
    feedLabel: string;
    missingStatuses?: readonly number[];
  },
  redirectCount = 0,
): Promise<string | null> {
  const missingStatuses = options.missingStatuses ?? [404];
  return new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      reject(new Error(`expected HTTPS URL for ${options.feedLabel} feed lookup: ${parsed.protocol}`));
      return;
    }

    const request = httpsGet(
      parsed,
      { headers: { "Cache-Control": "no-cache" } },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (missingStatuses.includes(statusCode)) {
          response.resume();
          resolvePromise(null);
          return;
        }

        const location = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && typeof location === "string") {
          response.resume();
          if (redirectCount >= 3) {
            reject(new Error(`too many redirects while reading ${options.feedLabel} feed`));
            return;
          }
          fetchOptionalHttpsText(new URL(location, parsed).toString(), options, redirectCount + 1)
            .then(resolvePromise, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`${options.feedLabel} feed request failed with HTTP ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
      },
    );

    request.setTimeout(10_000, () => {
      request.destroy(new Error(`timed out while reading ${options.feedLabel} feed`));
    });
    request.on("error", reject);
  });
}

export async function fetchOptionalHttpsTextWithRetries(
  url: string,
  options: {
    feedLabel: string;
    logPrefix: string;
    missingStatuses?: readonly number[];
  },
): Promise<string | null> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchOptionalHttpsText(url, options);
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delayMs = 1_000 * attempt;
      console.warn(
        `[${options.logPrefix}] metadata request failed (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

export function validateHttpsUrl(value: string, name: string, fail: Fail): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be an HTTPS URL; got ${value}`);
  }
  if (parsed.protocol !== "https:") {
    fail(`${name} must be an HTTPS URL; got ${value}`);
  }
}

export function setGitHubOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}
