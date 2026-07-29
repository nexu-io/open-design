// Browser-sourcemap post-build step for packaged builds.
//
// Why this exists
// ---------------
// `apps/web/next.config.ts` sets `productionBrowserSourceMaps: true`, so
// every `next build` invoked from tools-pack also produces `.js.map` files
// alongside the minified chunks. That gives us two requirements:
//
//   1. Send the maps to PostHog so the Error tracking page can symbolicate
//      stack frames (otherwise users see `fO / fz / s4` instead of real
//      function names + file:line).
//   2. Make sure no `.map` ever ends up inside a shipped installer (`.dmg`,
//      `.nsis`, `.AppImage`). Sourcemaps publish the original TypeScript
//      source to anyone who can read the bundle, which is a security &
//      competitive-disclosure problem.
//
// `processWebSourcemaps` does both:
//
//   - With `POSTHOG_CLI_API_KEY` + `POSTHOG_CLI_PROJECT_ID` (CI on
//     release-{beta,stable,preview}): run `@posthog/cli sourcemap inject`
//     to bake chunk IDs into the JS/map pair, then `sourcemap upload` to
//     ship the maps to PostHog. Best-effort — if upload fails (rate limit,
//     network blip), the strip step below still runs.
//
//   - Without those env vars (local `pnpm tools-pack mac build` by a
//     contributor, fork PR builds): skip both inject and upload, just strip.
//
// Either way, the final step ALWAYS removes every `.map` under the
// browser chunks directory. Stripping is a hard requirement; only the
// upload is conditional.
//
// Scope
// -----
// Only the packaged (mac/win/linux Electron) path is covered here. The OSS
// `od` CLI distribution path serves `apps/web/out/_next/static/chunks/`
// directly and is not currently used by any release artifact; it can be
// added later if the OSS audience reports symbolication needs.

import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { createPackageManagerInvocation } from "@open-design/platform";

import type { ToolPackConfig } from "./config.js";
import { execFileAsync } from "./mac/commands.js";

const POSTHOG_CLI_VERSION = "0.7.11";
const RELEASE_NAME = "open-design-web";

export interface WebSourcemapOptions {
  /**
   * Optional release version to associate with the uploaded chunks. Falls
   * back to `config.appVersion` when omitted; if neither is set the CLI
   * derives one from git, which is fine but less precise than passing a
   * real semver/nightly identifier from the release workflow.
   */
  releaseVersion?: string;
}

interface SourcemapCliEnv {
  apiKey: string;
  projectId: string;
  host?: string;
}

function resolveBrowserChunksDir(workspaceRoot: string): string {
  // Both `output: 'standalone'` (mac/win) and the implicit server output
  // (linux) write browser chunks to `.next/static`. Static-export mode
  // (`apps/web/out/_next/static`) is not used by any release artifact.
  return join(workspaceRoot, "apps", "web", ".next", "static");
}

async function findMapFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null) break;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      // Directory might not exist on this branch of the tree; skip silently.
      continue;
    }
    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".map")) {
        out.push(entryPath);
      }
    }
  }
  return out;
}

async function deleteMapFiles(dir: string): Promise<number> {
  const maps = await findMapFiles(dir);
  for (const mapPath of maps) {
    await rm(mapPath, { force: true });
  }
  return maps.length;
}

function readUploadEnv(config: ToolPackConfig): SourcemapCliEnv | null {
  if (config.posthogCliApiKey == null || config.posthogCliApiKey.length === 0) return null;
  if (config.posthogCliProjectId == null || config.posthogCliProjectId.length === 0) return null;
  return {
    apiKey: config.posthogCliApiKey,
    projectId: config.posthogCliProjectId,
    // Deliberately uses `posthogCliHost` (management host, us.posthog.com)
    // rather than `posthogHost` (ingest host, us.i.posthog.com). When the
    // CLI host is unset the @posthog/cli defaults to the US app host on
    // its own, which is correct for the official project.
    host: config.posthogCliHost,
  };
}

function log(line: string): void {
  process.stderr.write(`[web-sourcemaps] ${line}\n`);
}

async function runPnpm(
  config: ToolPackConfig,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<void> {
  // `createPackageManagerInvocation` is the same primitive every platform's
  // local `runPnpm` helper goes through, so the linux containerized build
  // (which sets `OD_TOOLS_PACK_PNPM_BIN` to the standalone pnpm binary it
  // bootstrapped) picks up the right command here too.
  const invocation = createPackageManagerInvocation(args, process.env);
  await execFileAsync(invocation.command, invocation.args, {
    cwd: config.workspaceRoot,
    env: { ...process.env, ...extraEnv },
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

export async function processWebSourcemaps(
  config: ToolPackConfig,
  options: WebSourcemapOptions = {},
): Promise<void> {
  const chunksDir = resolveBrowserChunksDir(config.workspaceRoot);
  if (!existsSync(chunksDir)) {
    log(`browser chunks dir not found at ${chunksDir}; skipping`);
    return;
  }

  const initialMaps = await findMapFiles(chunksDir);
  if (initialMaps.length === 0) {
    log(`no .map files under ${chunksDir}; nothing to do`);
    return;
  }
  log(`found ${initialMaps.length} .map file(s) under ${chunksDir}`);

  const uploadEnv = readUploadEnv(config);
  const releaseVersion = options.releaseVersion ?? config.appVersion;

  if (uploadEnv != null) {
    const cliEnv: NodeJS.ProcessEnv = {
      ...process.env,
      POSTHOG_CLI_API_KEY: uploadEnv.apiKey,
      POSTHOG_CLI_PROJECT_ID: uploadEnv.projectId,
      ...(uploadEnv.host ? { POSTHOG_CLI_HOST: uploadEnv.host } : {}),
    };
    const releaseArgs = [
      "--release-name",
      RELEASE_NAME,
      ...(releaseVersion ? ["--release-version", releaseVersion] : []),
    ];
    // inject must succeed first so the chunk ID baked into .js matches the
    // .map's metadata; the resulting .js change is just a trailing
    // `//# chunkId=...` comment so it's safe to retry the build with the
    // same source if anything below fails.
    try {
      await runPnpm(
        config,
        [
          "dlx",
          `@posthog/cli@${POSTHOG_CLI_VERSION}`,
          "sourcemap",
          "inject",
          "--directory",
          chunksDir,
          ...releaseArgs,
        ],
        cliEnv,
      );
    } catch (error) {
      log(`inject failed: ${(error as Error).message}; continuing to strip`);
    }
    // upload is best-effort — `--no-fail` keeps non-zero exits inside the
    // CLI from killing the release. If this fails the user simply sees
    // unsymbolicated stacks in PostHog, which is no worse than today.
    try {
      const hostFlag = uploadEnv.host ? ["--host", uploadEnv.host] : [];
      await runPnpm(
        config,
        [
          "dlx",
          `@posthog/cli@${POSTHOG_CLI_VERSION}`,
          ...hostFlag,
          "--no-fail",
          "sourcemap",
          "upload",
          "--directory",
          chunksDir,
          ...releaseArgs,
        ],
        cliEnv,
      );
    } catch (error) {
      log(`upload failed: ${(error as Error).message}; continuing to strip`);
    }
  } else {
    log("POSTHOG_CLI_API_KEY/POSTHOG_CLI_PROJECT_ID missing; skipping upload");
  }

  // Hard requirement: never let a .map slip into the shipped installer.
  // This runs even if the CLI's own `--delete-after` succeeded — duplicate
  // delete is a no-op, and the explicit pass also catches files the CLI
  // skipped (anything that wasn't paired with a matching .js, or .map
  // files added by future tooling we haven't audited yet).
  const stripped = await deleteMapFiles(chunksDir);
  log(`stripped ${stripped} .map file(s) before packaging`);
}
