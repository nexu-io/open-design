// The Thursday patch cut's pre-flight guard, driven end to end.
//
// The scenario these tests are built around is real. On 2026-09-10 the
// scheduled cut-patch-release run logged
//
//   Cutting patch v0.22.3 (branch release/v0.22.3); gating on stable v0.22.0
//
// while release/v0.22.2 existed, had not shipped, and was still taking
// backports that morning. The guard checked v0.22.0 — the base of the minor
// line — found it published, and cut v0.22.3 on top of an unshipped release.
// Nothing ever looked at v0.22.2. Because the release assistant follows the
// highest release branch, it then switched to the empty 0.22.3 line and
// announced acceptance for it.
//
// So: the release a patch cut stacks on is the PREVIOUS release branch, not the
// minor base. Both modes of the script run for real here — `git ls-remote`
// against a real local remote, and a real `gh` subprocess resolved off PATH.

import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const scriptPath = join(workspaceRoot, ".github", "scripts", "release", "resolve-patch-cut.ts");

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function scratchDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `patchguard-${prefix}-`));
  scratch.push(dir);
  return dir;
}

/** A real git remote carrying exactly these `release/vX.Y.Z` branches. */
async function remoteWithBranches(branches: readonly string[]): Promise<string> {
  const dir = await scratchDir("remote");
  const git = (...args: string[]) => execFileAsync("git", args, { cwd: dir });
  await git("init", "--quiet", "--initial-branch=main");
  await git("config", "user.email", "patchguard@example.invalid");
  await git("config", "user.name", "patchguard");
  await git("commit", "--quiet", "--allow-empty", "-m", "root");
  for (const version of branches) await git("branch", `release/v${version}`);
  return dir;
}

type ReleaseState = { isDraft: boolean; isPrerelease: boolean };

/**
 * A `gh` on PATH. It answers `gh release view` the way the real one does:
 * `--jq '(.isDraft or .isPrerelease) | not'` over the release's JSON, and a
 * non-zero exit for a tag that has no release at all. Every invocation is
 * appended to a log so a test can prove the lookup was skipped.
 */
async function ghOnPath(releases: Record<string, ReleaseState>, failure?: string): Promise<{ bin: string; log: string }> {
  const dir = await scratchDir("bin");
  const log = join(dir, "gh-calls.log");
  const fixture = join(dir, "releases.json");
  await writeFile(fixture, JSON.stringify(releases), "utf8");
  // Exists from the start so "gh was never called" reads as an empty log rather
  // than a missing file.
  await writeFile(log, "", "utf8");
  const impl = join(dir, "gh-impl.mjs");
  await writeFile(
    impl,
    [
      'import { appendFileSync, readFileSync } from "node:fs";',
      "const argv = process.argv.slice(2);",
      `appendFileSync(${JSON.stringify(log)}, argv.join(" ") + "\\n", "utf8");`,
      'if (argv[0] !== "release" || argv[1] !== "view") { console.error("unsupported gh call"); process.exit(2); }',
      `const releases = JSON.parse(readFileSync(${JSON.stringify(fixture)}, "utf8"));`,
      `if (${JSON.stringify(failure ?? "")}) { console.error(${JSON.stringify(failure ?? "")}); process.exit(1); }`,
      "const release = releases[argv[2]];",
      'if (release == null) { console.error("release not found"); process.exit(1); }',
      'const jq = argv[argv.indexOf("--jq") + 1];',
      'if (jq !== "(.isDraft or .isPrerelease) | not") { console.error(`unsupported --jq ${jq}`); process.exit(2); }',
      'process.stdout.write(String(!(release.isDraft || release.isPrerelease)) + "\\n");',
    ].join("\n"),
    "utf8",
  );
  const gh = join(dir, "gh");
  await writeFile(gh, `#!/bin/sh\nexec node ${JSON.stringify(impl)} "$@"\n`, "utf8");
  await chmod(gh, 0o755);
  return { bin: dir, log };
}

type RunResult = { outputs: Record<string, string>; stdout: string; stderr: string; status: number };

async function run(
  mode: "resolve" | "gate",
  options: { env?: Record<string, string>; pathPrefix?: string } = {},
): Promise<RunResult> {
  const dir = await scratchDir("out");
  const outputFile = join(dir, "github-output");
  await writeFile(outputFile, "", "utf8");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GITHUB_OUTPUT: outputFile,
    ...options.env,
  };
  if (options.pathPrefix != null) env.PATH = `${options.pathPrefix}:${process.env.PATH ?? ""}`;

  let stdout = "";
  let stderr = "";
  let status = 0;
  try {
    const result = await execFileAsync("node", ["--experimental-strip-types", scriptPath, mode], {
      cwd: workspaceRoot,
      encoding: "utf8",
      env,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
    status = failure.code ?? 1;
  }

  const outputs: Record<string, string> = {};
  for (const line of (await readFile(outputFile, "utf8")).split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) outputs[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return { outputs, stdout, stderr, status };
}

/** The whole pre-flight, in the order cut-patch-release.yml runs it. */
async function preflight(options: {
  branches: readonly string[];
  releases: Record<string, ReleaseState>;
  inputVersion?: string;
  force?: string;
}): Promise<{ version: string; gateVersion: string; published: string; cut: boolean; ghCalls: string[] }> {
  const remote = await remoteWithBranches(options.branches);
  const gh = await ghOnPath(options.releases);

  const resolved = await run("resolve", {
    env: { RELEASE_REMOTE: remote, INPUT_VERSION: options.inputVersion ?? "" },
  });
  expect(resolved.status, resolved.stderr).toBe(0);

  const gated = await run("gate", {
    env: {
      GATE_TAG: resolved.outputs.gate_tag ?? "",
      FORCE: options.force ?? "false",
      RELEASE_REPO: "nexu-io/open-design",
    },
    pathPrefix: gh.bin,
  });
  expect(gated.status, gated.stderr).toBe(0);

  const published = gated.outputs.published ?? "";
  const log = await readFile(gh.log, "utf8");
  return {
    version: resolved.outputs.version ?? "",
    gateVersion: resolved.outputs.gate_version ?? "",
    published,
    // The workflow gates every branch-cutting step on `published == 'true'`.
    cut: published === "true",
    ghCalls: log.split("\n").filter((line) => line.length > 0),
  };
}

describe("cut-patch-release pre-flight", () => {
  it("[P1] refuses to cut a patch on top of an unshipped patch", async () => {
    // 2026-09-10, exactly as it happened: 0.22.0 and 0.22.1 had shipped, 0.22.2
    // was cut and still unshipped, and the schedule wanted 0.22.3.
    const result = await preflight({
      branches: ["0.5.1", "0.6.1", "0.20.3", "0.22.0", "0.22.1", "0.22.2"],
      releases: {
        "open-design-v0.22.0": { isDraft: false, isPrerelease: false },
        "open-design-v0.22.1": { isDraft: false, isPrerelease: false },
      },
    });

    // Asserted as one object so a regression shows the whole consequence —
    // which release was checked, what it answered, and whether a branch was cut.
    expect({
      version: result.version,
      gateVersion: result.gateVersion,
      published: result.published,
      cut: result.cut,
    }).toEqual({ version: "0.22.3", gateVersion: "0.22.2", published: "false", cut: false });
  });

  it("[P1] cuts the next patch once the previous one has shipped", async () => {
    // The guard must not become a permanent stop sign: the steady-state week,
    // where the release it stacks on is published, still cuts.
    const result = await preflight({
      branches: ["0.20.3", "0.22.0", "0.22.1"],
      releases: {
        "open-design-v0.22.0": { isDraft: false, isPrerelease: false },
        "open-design-v0.22.1": { isDraft: false, isPrerelease: false },
      },
    });

    expect({
      version: result.version,
      gateVersion: result.gateVersion,
      published: result.published,
      cut: result.cut,
    }).toEqual({ version: "0.22.2", gateVersion: "0.22.1", published: "true", cut: true });
  });

  it("[P1] gates the first patch of a line on that line's minor, not the older line", async () => {
    // What the old MINOR_BASE comment was protecting: cutting 0.15.1 must check
    // open-design-v0.15.0, never the 0.14.x line it just left. Still true, now
    // because 0.15.0 is the previous release branch.
    const result = await preflight({
      branches: ["0.14.0", "0.14.1", "0.15.0"],
      releases: { "open-design-v0.14.1": { isDraft: false, isPrerelease: false } },
    });

    expect(result.version).toBe("0.15.1");
    expect(result.gateVersion).toBe("0.15.0");
    expect(result.published).toBe("false");
    expect(result.cut).toBe(false);
  });

  it("[P2] ignores abandoned lower release branches when picking the gate target", async () => {
    // release/v0.5.1, release/v0.6.1 and release/v0.20.3 were cut and never
    // published. They sit below the live line, so "the previous release branch"
    // never lands on them and they cannot wedge the guard shut.
    const result = await preflight({
      branches: ["0.5.1", "0.6.1", "0.20.3", "0.22.0"],
      releases: { "open-design-v0.22.0": { isDraft: false, isPrerelease: false } },
    });

    expect(result.version).toBe("0.22.1");
    expect(result.gateVersion).toBe("0.22.0");
    expect(result.cut).toBe(true);
  });

  it("[P2] treats a draft or prerelease GitHub Release as not shipped", async () => {
    const draft = await preflight({
      branches: ["0.22.0", "0.22.1"],
      releases: { "open-design-v0.22.1": { isDraft: true, isPrerelease: false } },
    });
    expect(draft.cut).toBe(false);

    const prerelease = await preflight({
      branches: ["0.22.0", "0.22.1"],
      releases: { "open-design-v0.22.1": { isDraft: false, isPrerelease: true } },
    });
    expect(prerelease.cut).toBe(false);

    const missing = await preflight({ branches: ["0.22.0", "0.22.1"], releases: {} });
    expect(missing.cut).toBe(false);
  });

  it("[P2] still runs the guard for a manual version on another line", async () => {
    // A manual `version=` does not bypass the guard — only `force` does. Pinning
    // today's behavior, which differs from cut-release.yml (that one skips its
    // guard for every non-schedule event).
    const result = await preflight({
      branches: ["0.22.0", "0.22.1", "0.22.2"],
      inputVersion: "0.22.9",
      releases: { "open-design-v0.22.0": { isDraft: false, isPrerelease: false } },
    });

    expect(result.version).toBe("0.22.9");
    expect(result.gateVersion).toBe("0.22.2");
    expect(result.cut).toBe(false);
    expect(result.ghCalls).toHaveLength(1);
  });

  it.each([
    "HTTP 401: Bad credentials",
    "HTTP 403: API rate limit exceeded",
    "HTTP 503: Service Unavailable",
    "dial tcp: network is unreachable",
    "release not found\nHTTP 401: Bad credentials",
  ])("[P1] fails the gate on a lookup error: %s", async (failure) => {
    const gh = await ghOnPath({}, failure);
    const result = await run("gate", {
      env: { GATE_TAG: "open-design-v0.22.2", FORCE: "false" },
      pathPrefix: gh.bin,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(failure);
    expect(result.outputs.published).toBeUndefined();
  });

  it("[P2] lets force cut without consulting GitHub at all", async () => {
    const result = await preflight({
      branches: ["0.22.0", "0.22.1", "0.22.2"],
      releases: {},
      force: "true",
    });

    expect(result.version).toBe("0.22.3");
    expect(result.cut).toBe(true);
    expect(result.ghCalls).toEqual([]);
  });

  it("[P2] gates a back-fill below every branch on the newest release instead of nothing", async () => {
    // A manual version under every existing branch has no release beneath it.
    // The guard must still land on a real release rather than fall open.
    const result = await preflight({
      branches: ["0.22.0", "0.22.1"],
      inputVersion: "0.20.9",
      releases: { "open-design-v0.22.0": { isDraft: false, isPrerelease: false } },
    });

    expect(result.version).toBe("0.20.9");
    expect(result.gateVersion).toBe("0.22.1");
    expect(result.cut).toBe(false);
  });

  it("[P2] fails rather than cuts when a manual version has no release branch to gate on", async () => {
    const remote = await remoteWithBranches([]);
    const result = await run("resolve", { env: { RELEASE_REMOTE: remote, INPUT_VERSION: "0.22.3" } });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("No release/vX.Y.Z branch found to gate the patch cut on.");
    expect(result.outputs.gate_tag).toBeUndefined();
  });

  it("[P2] rejects a manual version that is not plain x.y.z", async () => {
    const remote = await remoteWithBranches(["0.22.0"]);
    const result = await run("resolve", {
      env: { RELEASE_REMOTE: remote, INPUT_VERSION: "0.22.1; touch /tmp/patchguard-pwned" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected x.y.z, digits only");
    expect(result.outputs.version).toBeUndefined();
  });

  it("[P2] fails loudly when there is no release branch to base a patch on", async () => {
    const remote = await remoteWithBranches([]);
    const result = await run("resolve", { env: { RELEASE_REMOTE: remote, INPUT_VERSION: "" } });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("No release/vX.Y.Z branch found");
  });
});

describe("cut-patch-release workflow wiring", () => {
  it("[P2] runs the extracted pre-flight instead of inline gate shell", async () => {
    const [workflow, script] = await Promise.all([
      readFile(join(workspaceRoot, ".github", "workflows", "cut-patch-release.yml"), "utf8"),
      readFile(scriptPath, "utf8"),
    ]);

    expect(workflow).toContain(
      "run: node --experimental-strip-types .github/scripts/release/resolve-patch-cut.ts resolve",
    );
    expect(workflow).toContain(
      "run: node --experimental-strip-types .github/scripts/release/resolve-patch-cut.ts gate",
    );
    expect(workflow).toContain("GATE_TAG: ${{ steps.ver.outputs.gate_tag }}");
    // The publish test itself stays gh's, not ours.
    expect(script).toContain('"(.isDraft or .isPrerelease) | not"');
    // No second copy of the version/gate math left behind in YAML.
    expect(workflow).not.toContain("MINOR_BASE");
    expect(workflow).not.toContain("git ls-remote --heads origin 'release/v*'");
  });
});

// A guard against the scratch helper quietly not working: if the stub `gh` were
// unreachable the suite above would read "not published" everywhere and look
// like a passing, permanently-closed gate.
describe("test harness", () => {
  it("[P2] resolves the stub gh off PATH", async () => {
    const gh = await ghOnPath({ "open-design-v1.0.0": { isDraft: false, isPrerelease: false } });
    const result = await run("gate", {
      env: { GATE_TAG: "open-design-v1.0.0", FORCE: "false" },
      pathPrefix: gh.bin,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.published).toBe("true");
    expect((await readFile(gh.log, "utf8")).trim()).toContain("release view open-design-v1.0.0");
  });
});
