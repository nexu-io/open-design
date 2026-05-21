import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  formatM4RemoteEvidenceDetail,
  m4EvidenceLogMarker,
  m4PlatformGateLabels,
  m4RemoteEvidenceLogMarker,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
  m5ReleaseBetaDefaultLabel,
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
  m6ElectronDepsLabel,
  m6ElectronGuidanceLabel,
  m6ElectronResourcesLabel,
  m6ElectronRuntimeLabel,
  m6ElectronTestsLabel,
} from "./tauri-migration-policy.ts";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const continueScript = join(scriptsRoot, "continue-tauri-migration.ts");
const statusScript = join(scriptsRoot, "tauri-migration-status.ts");
const linuxArtifactName = "open-design-ci-linux-tauri-e2e-report";
const winArtifactName = "open-design-ci-win-tauri-e2e-report";
const verifiedRemoteEvidence = [
  m4RemoteEvidenceLogMarker,
  formatM4RemoteEvidenceDetail("origin", "codex/electron-to-tauri-migration", "1".repeat(40)),
] as const;

test("migration doc continuation command blocks keep verified handoff paths", async () => {
  const source = await readFile(join(repoRoot, "docs/electron-to-tauri-migration.md"), "utf8");
  const continuationBlocks = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)]
    .map((match) => match[1] ?? "")
    .filter((block) => block.includes("scripts/continue-tauri-migration.ts"));

  assert.ok(continuationBlocks.length > 0);
  for (const block of continuationBlocks) {
    assert.match(block, /--handoff-dir \/tmp\/open-design-tauri-migration-handoff/);
    assert.match(block, /--handoff-archive \/tmp\/open-design-tauri-migration-handoff\.tar\.gz/);
    assert.match(block, /--remote origin/);
    assert.match(block, /--report-dir \/tmp\/open-design-tauri-m4-reports/);
  }
  assert.match(source, /continuation runner writes the same template-complete draft PR body/);
  assert.match(source, /dry-run.*reports the body path without creating the file/i);
});

test("migration doc platform gate table includes verifier-required uninstall evidence", async () => {
  const source = await readFile(join(repoRoot, "docs/electron-to-tauri-migration.md"), "utf8");
  const m4ScheduleRow = source.split(/\r?\n/).find((line) => line.startsWith("| M4 Platform package smoke |"));
  const windowsRow = source.split(/\r?\n/).find((line) => line.startsWith("| Windows NSIS smoke |"));
  const linuxRow = source.split(/\r?\n/).find((line) => line.startsWith("| Linux AppImage smoke |"));

  assert.ok(m4ScheduleRow);
  assert.match(m4ScheduleRow, /uninstall\/removal evidence/);

  assert.match(source, /Windows NSIS and Linux AppImage\/headless Tauri packaging, lifecycle, and uninstall paths have native CI evidence/);

  assert.ok(windowsRow);
  assert.match(windowsRow, /tools-pack win uninstall/);
  assert.match(windowsRow, /--remove-product-user-data/);
  assert.match(windowsRow, /uninstall residue/);
  assert.match(windowsRow, /registry residue/);

  assert.ok(linuxRow);
  assert.match(linuxRow, /tools-pack linux uninstall/);
  assert.match(linuxRow, /AppImage, desktop file, and icon/);
  assert.match(linuxRow, /skipped-process-running/);

  assert.match(source, /M4 closes from two native CI report artifacts, not from three manually gathered snippets/);
  assert.match(source, /open-design-ci-win-tauri-e2e-report/);
  assert.match(source, /Windows NSIS M4 evidence/);
  assert.match(source, /open-design-ci-linux-tauri-e2e-report/);
  assert.match(source, /Linux AppImage\/headless M4 evidence/);
  assert.match(source, /summary\.headless\.install/);
  assert.match(source, /summary\.headless\.start/);
  assert.match(source, /summary\.headless\.stop/);
});

test("tauri-migration-status reports the current M4 blocker state", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as {
    defaults: { releaseBeta: string; toolsDev: string; toolsPack: string };
    groups: Array<{ checked: number; name: string; total: number }>;
    m4Evidence: { problems: string[] };
    nextActions: string[];
    phase: string;
  };

  assert.equal(parsed.phase, "M4");
  assert.deepEqual(parsed.defaults, { releaseBeta: "electron", toolsDev: "electron", toolsPack: "electron" });
  assert.deepEqual(
    parsed.groups.map(({ checked, name, total }) => ({ checked, name, total })),
    [
      { checked: 0, name: "M4", total: 3 },
      { checked: 0, name: "M5", total: 5 },
      { checked: 0, name: "M6", total: 5 },
    ],
  );
  assert.match(parsed.nextActions.join("\n"), /verify-tauri-migration-handoff/);
  assert.match(parsed.nextActions.join("\n"), /packaged handoff archive/);
  assert.match(parsed.nextActions.join("\n"), /push-tauri-migration-handoff/);
  assert.match(parsed.nextActions.join("\n"), /advance-tauri-migration-m4-m5/);
  assert.deepEqual(parsed.m4Evidence.problems, []);
});

test("tauri-migration-status advances to M5 after verified M4 checkboxes", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [...m4PlatformGateLabels],
    defaults: "electron",
    extraDocLines: [m4EvidenceLogMarker, ...verifiedRemoteEvidence],
  });

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as { phase: string; nextActions: string[] };

  assert.equal(parsed.phase, "M5");
  assert.match(parsed.nextActions.join("\n"), /apply-tauri-migration-m5/);
});

test("tauri-migration-status stays in M4 when remote head evidence is stale for current HEAD", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [...m4PlatformGateLabels],
    defaults: "electron",
    extraDocLines: [m4EvidenceLogMarker, ...verifiedRemoteEvidence],
  });
  const head = await initGitFixture(fixture);

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as {
    m4Evidence: {
      nativeEvidence: boolean;
      platformGatesChecked: boolean;
      problems: string[];
      remoteEvidence: boolean;
    };
    nextActions: string[];
    phase: string;
  };

  assert.equal(parsed.phase, "M4");
  assert.equal(parsed.m4Evidence.platformGatesChecked, true);
  assert.equal(parsed.m4Evidence.nativeEvidence, true);
  assert.equal(parsed.m4Evidence.remoteEvidence, false);
  assert.deepEqual(parsed.m4Evidence.problems, [
    `missing pushed remote branch-head evidence marker/detail for current HEAD ${head}`,
  ]);
  assert.doesNotMatch(parsed.nextActions.join("\n"), /apply-tauri-migration-m5/);
});

test("tauri-migration-status reports complete after M6 without requiring pre-M5 evidence for the final cleanup head", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [
      ...m4PlatformGateLabels,
      m5ToolsDevDefaultLabel,
      m5ToolsPackDefaultLabel,
      m5ReleaseBetaDefaultLabel,
      m5ElectronFallbackLabel,
      m5PrimaryDocsLabel,
      m6ElectronDepsLabel,
      m6ElectronRuntimeLabel,
      m6ElectronResourcesLabel,
      m6ElectronTestsLabel,
      m6ElectronGuidanceLabel,
    ],
    defaults: "tauri",
    extraDocLines: [m4EvidenceLogMarker, ...verifiedRemoteEvidence],
  });
  await initGitFixture(fixture);
  const automationDir = join(fixture, "automations");
  await mkdir(automationDir, { recursive: true });

  const result = await runStatus(fixture, "--automation-dir", automationDir);
  const parsed = JSON.parse(result.stdout) as {
    heartbeat?: unknown;
    m4Evidence: {
      problems: string[];
      remoteEvidence: boolean;
    };
    nextActions: string[];
    phase: string;
  };

  assert.equal(parsed.phase, "complete");
  assert.equal(parsed.m4Evidence.remoteEvidence, true);
  assert.deepEqual(parsed.m4Evidence.problems, []);
  assert.equal(parsed.heartbeat, undefined);
  assert.match(parsed.nextActions.join("\n"), /No migration phase actions remain/);
});

test("tauri-migration-status stays in M4 when remote head evidence is missing", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [...m4PlatformGateLabels],
    defaults: "electron",
    extraDocLines: [m4EvidenceLogMarker],
  });

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as {
    m4Evidence: {
      nativeEvidence: boolean;
      platformGatesChecked: boolean;
      problems: string[];
      remoteEvidence: boolean;
    };
    nextActions: string[];
    phase: string;
  };

  assert.equal(parsed.phase, "M4");
  assert.equal(parsed.m4Evidence.platformGatesChecked, true);
  assert.equal(parsed.m4Evidence.nativeEvidence, true);
  assert.equal(parsed.m4Evidence.remoteEvidence, false);
  assert.deepEqual(parsed.m4Evidence.problems, ["missing pushed remote branch-head evidence marker/detail"]);
  assert.doesNotMatch(parsed.nextActions.join("\n"), /apply-tauri-migration-m5/);
  assert.match(parsed.nextActions.join("\n"), /M4 platform checkboxes are closed but evidence markers are incomplete/);
  assert.match(parsed.nextActions.join("\n"), /missing pushed remote branch-head evidence marker\/detail/);
});

test("tauri-migration-status stays in M4 when remote head evidence has no branch detail", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [...m4PlatformGateLabels],
    defaults: "electron",
    extraDocLines: [m4EvidenceLogMarker, m4RemoteEvidenceLogMarker],
  });

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as {
    m4Evidence: {
      nativeEvidence: boolean;
      platformGatesChecked: boolean;
      problems: string[];
      remoteEvidence: boolean;
    };
    nextActions: string[];
    phase: string;
  };

  assert.equal(parsed.phase, "M4");
  assert.equal(parsed.m4Evidence.platformGatesChecked, true);
  assert.equal(parsed.m4Evidence.nativeEvidence, true);
  assert.equal(parsed.m4Evidence.remoteEvidence, false);
  assert.deepEqual(parsed.m4Evidence.problems, ["missing pushed remote branch-head evidence marker/detail"]);
  assert.doesNotMatch(parsed.nextActions.join("\n"), /apply-tauri-migration-m5/);
});

test("tauri-migration-status explains missing M4 evidence markers when checkboxes are closed", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [...m4PlatformGateLabels],
    defaults: "electron",
  });

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as {
    m4Evidence: {
      nativeEvidence: boolean;
      platformGatesChecked: boolean;
      problems: string[];
      remoteEvidence: boolean;
    };
    nextActions: string[];
    phase: string;
  };

  assert.equal(parsed.phase, "M4");
  assert.equal(parsed.m4Evidence.platformGatesChecked, true);
  assert.equal(parsed.m4Evidence.nativeEvidence, false);
  assert.equal(parsed.m4Evidence.remoteEvidence, false);
  assert.deepEqual(parsed.m4Evidence.problems, [
    "missing native Windows/Linux verifier evidence marker",
    "missing pushed remote branch-head evidence marker/detail",
  ]);
  assert.match(parsed.nextActions.join("\n"), /missing native Windows\/Linux verifier evidence marker/);
  assert.match(parsed.nextActions.join("\n"), /missing pushed remote branch-head evidence marker\/detail/);
  assert.match(parsed.nextActions.join("\n"), /continue-tauri-migration\.ts --wait-reports --advance/);
});

test("tauri-migration-status reports current handoff artifacts", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  const bundleSha256 = await writeHandoffFixture(handoffDir, { branchHead: head });

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as {
    handoff: {
      branchHead: string;
      bundleSha256: string;
      current: boolean;
      note: string;
      present: boolean;
      problems: string[];
    };
    nextActions: string[];
  };

  assert.equal(parsed.handoff.present, true);
  assert.equal(parsed.handoff.current, true);
  assert.equal(parsed.handoff.branchHead, head);
  assert.equal(parsed.handoff.bundleSha256, bundleSha256);
  assert.equal(parsed.handoff.note, join(handoffDir, "open-design-tauri-migration-handoff.md"));
  assert.deepEqual(parsed.handoff.problems, []);
  assert.match(parsed.nextActions.join("\n"), /Package the current verified handoff directory/);
});

test("tauri-migration-status rejects stale handoff notes without remote-bound advance commands", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head, staleNote: true });

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as {
    handoff: {
      current: boolean;
      problems: string[];
    };
  };

  assert.equal(parsed.handoff.current, false);
  assert.match(parsed.handoff.problems.join("\n"), /handoff note direct M4 advance command is missing --remote origin or --remote "\$\{REMOTE:-origin\}"/);
});

test("tauri-migration-status rejects stale handoff notes with fixed report paths", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head, fixedReportNote: true });

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as {
    handoff: {
      current: boolean;
      problems: string[];
    };
  };

  assert.equal(parsed.handoff.current, false);
  assert.match(parsed.handoff.problems.join("\n"), /handoff note report download command is missing TAURI_M4_REPORT_DIR report path fallback/);
  assert.match(parsed.handoff.problems.join("\n"), /handoff note direct M4 advance command is missing TAURI_M4_REPORT_DIR report path fallback/);
});

test("tauri-migration-status reports current packaged handoff archives", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath, archiveSha256 } = await writeHandoffArchive(handoffDir);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as {
    handoffArchive: {
      archive: string;
      checksum: string;
      commandScript: string;
      commandScriptChecksum: string;
      commandScriptSha256: string;
      current: boolean;
      problems: string[];
      sha256: string;
    };
    nextActions: string[];
  };

  assert.equal(parsed.handoffArchive.archive, archivePath);
  assert.equal(parsed.handoffArchive.checksum, `${archivePath}.sha256`);
  assert.equal(parsed.handoffArchive.commandScript, `${archivePath}.commands.sh`);
  assert.equal(parsed.handoffArchive.commandScriptChecksum, `${archivePath}.commands.sh.sha256`);
  assert.equal(parsed.handoffArchive.current, true);
  assert.match(parsed.handoffArchive.commandScriptSha256, /^[0-9a-f]{64}$/);
  assert.equal(parsed.handoffArchive.sha256, archiveSha256);
  assert.deepEqual(parsed.handoffArchive.problems, []);
  assert.match(parsed.nextActions.join("\n"), /command script/);
  assert.match(parsed.nextActions.join("\n"), new RegExp(`Expected remote head: codex\\/electron-to-tauri-migration @ ${head}`));
  assert.match(parsed.nextActions.join("\n"), new RegExp(`Archive SHA-256: ${archiveSha256}`));
  assert.match(parsed.nextActions.join("\n"), new RegExp(`Command script SHA-256: ${parsed.handoffArchive.commandScriptSha256}`));
  assert.match(parsed.nextActions.join("\n"), new RegExp(`${escapeRegExp(`${archivePath}.commands.sh`)} ${escapeRegExp(archivePath)}`));
  assert.match(parsed.nextActions.join("\n"), new RegExp(`continue-tauri-migration\\.ts .*--handoff-archive ${escapeRegExp(archivePath)} .*--dry-run`));
  assert.match(parsed.nextActions.join("\n"), /push-tauri-migration-handoff\.ts --archive/);
  assert.match(parsed.nextActions.join("\n"), /attempt native CI dispatch/);
  assert.match(parsed.nextActions.join("\n"), /draft PR fallback printed by the command sidecar/);
});

test("tauri-migration-status prints continuation guidance for a custom handoff archive", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const customArchivePath = join(fixture, "transfer archive", "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffArchive(handoffDir, customArchivePath);
  const remotePath = join(fixture, "empty remote.git");
  await git(fixture, "init", "--bare", remotePath);
  const reportDir = join(fixture, "reports with space");

  const result = await runStatus(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--handoff-archive",
    customArchivePath,
    "--remote",
    remotePath,
    "--report-dir",
    reportDir,
  );
  const parsed = JSON.parse(result.stdout) as {
    handoffArchive: { archive: string; current: boolean };
    nextActions: string[];
  };
  const nextActions = parsed.nextActions.join("\n");

  assert.equal(parsed.handoffArchive.current, true);
  assert.equal(parsed.handoffArchive.archive, customArchivePath);
  assert.match(nextActions, new RegExp(`continue-tauri-migration\\.ts .*--handoff-archive '${escapeRegExp(customArchivePath)}'`));
  assert.match(nextActions, new RegExp(`--remote '${escapeRegExp(remotePath)}'`));
  assert.match(nextActions, new RegExp(`--report-dir '${escapeRegExp(reportDir)}'`));
  assert.match(nextActions, new RegExp(`'${escapeRegExp(`${customArchivePath}.commands.sh`)}' '${escapeRegExp(customArchivePath)}'`));
  assert.match(nextActions, /draft PR fallback printed by the command sidecar/);
  assert.match(
    nextActions,
    new RegExp(
      `push-tauri-migration-handoff\\.ts --archive '${escapeRegExp(customArchivePath)}' --remote '${escapeRegExp(remotePath)}' --workflow "\\$\\{GITHUB_WORKFLOW:-ci\\.yml\\}" --report-dir '${escapeRegExp(reportDir)}' --pr-body-path "\\$\\{TAURI_PR_BODY_PATH:-\\.tmp/tauri-migration-pr-body\\.md\\}"`,
    ),
  );
  assert.match(nextActions, /--dry-run/);
  assert.doesNotMatch(nextActions, new RegExp(escapeRegExp(`${handoffDir}.tar.gz`)));
});

test("tauri-migration-status honors remote overrides in handoff push guidance", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath);
  const parsed = JSON.parse(result.stdout) as { nextActions: string[] };
  const nextActions = parsed.nextActions.join("\n");

  assert.match(nextActions, new RegExp(`push-tauri-migration-handoff\\.ts --archive .* --remote ${escapeRegExp(remotePath)}`));
  assert.doesNotMatch(nextActions, /push-tauri-migration-handoff\.ts --archive .* --remote origin/);
});

test("tauri-migration-status rejects non-relocatable handoff bundle paths", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  await writeHandoffFixture(handoffDir, { branchHead: head, bundlePath });

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as {
    handoff: { current: boolean; problems: string[] };
    handoffArchive: { current: boolean; problems: string[] };
  };

  assert.equal(parsed.handoff.current, false);
  assert.match(parsed.handoff.problems.join("\n"), /manifest bundlePath must be relative and relocatable/);
  assert.equal(parsed.handoffArchive.current === true, false);
});

test("tauri-migration-status rejects archived non-relocatable bundle paths", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  await writeHandoffFixture(handoffDir, { branchHead: head, bundlePath });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  await writeHandoffFixture(handoffDir, { branchHead: head });

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--handoff-archive", archivePath);
  const parsed = JSON.parse(result.stdout) as { handoff: { current: boolean }; handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoff.current, true);
  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /archived manifest bundlePath must be relative and relocatable/);
});

test("tauri-migration-status rejects packaged handoff archives without command scripts", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  await rm(`${archivePath}.commands.sh`);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script unavailable/);
});

test("tauri-migration-status rejects packaged handoff archives without command script checksum sidecars", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  await rm(`${archivePath}.commands.sh.sha256`);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script checksum sidecar unavailable/);
});

test("tauri-migration-status rejects packaged handoff archives with archive checksum filename mismatches", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath, archiveSha256 } = await writeHandoffArchive(handoffDir);
  await writeFile(`${archivePath}.sha256`, `${archiveSha256}  stale-handoff.tar.gz\n`, "utf8");

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /checksum sidecar filename mismatch/);
});

test("tauri-migration-status rejects packaged handoff archives with stale command checksum validation", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(commandScriptPath, commandScript.replace("read_checksum() {\n  :\n}\n", ""), "utf8");
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing checksum target-name validation/);
});

test("tauri-migration-status rejects command sidecars without the generated marker", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(commandScriptPath, commandScript.replace("# generated by scripts/package-tauri-migration-handoff.ts\n", ""), "utf8");
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing generated command sidecar marker/);
});

test("tauri-migration-status rejects packaged handoff archives without tracked worktree guards", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript.replace(/ensure_tracked_clean\(\)[\s\S]*?^ensure_tracked_clean$/m, ""),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing tracked worktree guard/);
});

test("tauri-migration-status rejects packaged handoff archives without bundle SHA validation", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript.replace("bundle_sha=\n", "").replace('actual_bundle_sha="$(hash_file "$bundle")"\n', ""),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing extracted bundle SHA-256 validation/);
});

test("tauri-migration-status rejects packaged handoff archives without bundle branch-head validation", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript
      .replace('bundle_head="$(git rev-parse --verify "$temp_ref^{commit}")"\n', "")
      .replace("bundle branch head mismatch\n", ""),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing bundle branch-head validation/);
});

test("tauri-migration-status rejects packaged handoff archives without bundle preflight validation", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript
      .replace('git bundle verify "$bundle"\n', "")
      .replace('bundle_heads="$(git bundle list-heads "$bundle")"\n', "")
      .replace("bundle does not contain expected branch head\n", ""),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing bundle preflight validation/);
});

test("tauri-migration-status rejects packaged handoff archives without checked-out branch restoration", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript.replace('restore_branch=""\n', "").replace('restore_branch="$branch"\n', "").replace('git checkout "$restore_branch"\n', ""),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing checked-out branch restoration/);
});

test("tauri-migration-status rejects packaged handoff archives without configurable GitHub CLI dispatch", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript
      .replace('gh_bin="${GH_BIN:-gh}"\n', "")
      .replace('command -v "$gh_bin"', "command -v gh")
      .replace('"$gh_bin" workflow run "$workflow" --ref "$branch"', 'gh workflow run "$workflow" --ref "$branch"')
      .replace("$gh_bin pr create --draft", "gh pr create --draft"),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing configurable GitHub CLI dispatch/);
});

test("tauri-migration-status rejects packaged handoff archives without manifest field validation", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript.replace("handoff manifest bundlePath must be relative and relocatable\n", ""),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing handoff manifest field validation/);
});

test("tauri-migration-status rejects command sidecars without native CI wait-and-advance dispatch", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(commandScriptPath, commandScript.replace("TAURI_NATIVE_CI_WAIT", "TAURI_NATIVE_CI_SKIP_WAIT"), "utf8");
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing native CI wait-and-advance dispatch/);
});

test("tauri-migration-status rejects command sidecars without source archive status guidance", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(commandScriptPath, commandScript.replace('--handoff-archive "$archive"', ""), "utf8");
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing source archive status guidance/);
});

test("tauri-migration-status rejects command sidecars without relocatable rerun guidance", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript.replace('print_shell_command "GITHUB_RUN_ID=<github-run-id>" "$script_path" "$archive"', 'printf \'%s\' "./$(basename "$0")"'),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing relocatable rerun guidance/);
});

test("tauri-migration-status rejects command sidecars without quoted receiver commands", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(
    commandScriptPath,
    commandScript.replace('print_shell_command "$gh_bin" workflow run "$workflow" --ref "$branch"', 'printf "%s\\n" "$gh_bin workflow run $workflow --ref $branch"'),
    "utf8",
  );
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script is missing quoted receiver command guidance/);
});

test("tauri-migration-status rejects command sidecars with invalid bash syntax", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScript = await readFile(commandScriptPath, "utf8");
  await writeFile(commandScriptPath, `${commandScript}\n# generated by scripts/package-tauri-migration-handoff.ts\nif\n`, "utf8");
  await writeCommandScriptChecksum(commandScriptPath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoffArchive: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoffArchive.current, false);
  assert.match(parsed.handoffArchive.problems.join("\n"), /command script syntax invalid/);
});

test("tauri-migration-status reports stale handoff artifacts", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const staleHead = "0".repeat(40);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: staleHead });
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath);
  const parsed = JSON.parse(result.stdout) as {
    handoff: { current: boolean; problems: string[] };
    remote: { expectedHead: string; problems: string[] };
  };

  assert.equal(parsed.handoff.current, false);
  assert.match(parsed.handoff.problems.join("\n"), new RegExp(`manifest branchHead is stale: expected ${head}, got ${staleHead}`));
  assert.equal(parsed.remote.expectedHead, head);
  assert.match(parsed.remote.problems.join("\n"), /remote branch not found/);
});

test("tauri-migration-status reports a remote branch matching the handoff", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const remotePath = await createRemoteFixture(fixture, head);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    remote: {
      current: boolean;
      expectedHead: string;
      head: string;
      present: boolean;
      problems: string[];
    };
  };

  assert.equal(parsed.remote.present, true);
  assert.equal(parsed.remote.current, true);
  assert.equal(parsed.remote.head, head);
  assert.equal(parsed.remote.expectedHead, head);
  assert.deepEqual(parsed.remote.problems, []);
  assert.match(parsed.nextActions.join("\n"), /already matches/);
  assert.match(parsed.nextActions.join("\n"), /\$\{GH_BIN:-gh\} workflow run ci\.yml --ref codex\/electron-to-tauri-migration/);
  assert.match(parsed.nextActions.join("\n"), new RegExp(`--expected-head ${head}`));
  assert.match(parsed.nextActions.join("\n"), new RegExp(`--root ${escapeRegExp(fixture)}`));
  assert.match(parsed.nextActions.join("\n"), /--wait/);
  assert.match(parsed.nextActions.join("\n"), /download-tauri-m4-reports/);
});

test("tauri-migration-status keeps custom report directory in remote-ready download guidance", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const remotePath = await createRemoteFixture(fixture, head);
  const reportDir = join(fixture, "reports with space");

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath, "--report-dir", reportDir);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    platformReports: { reportDir: string };
    remote: { current: boolean };
  };
  const nextActions = parsed.nextActions.join("\n");

  assert.equal(parsed.remote.current, true);
  assert.equal(parsed.platformReports.reportDir, reportDir);
  assert.match(nextActions, new RegExp(`--output-dir '${escapeRegExp(reportDir)}'`));
  assert.match(nextActions, new RegExp(`--root ${escapeRegExp(fixture)}`));
  assert.doesNotMatch(nextActions, /--output-dir \/tmp\/open-design-tauri-m4-reports/);
});

test("tauri-migration-status reports a missing remote branch", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    remote: { current: boolean; expectedHead: string; present: boolean; problems: string[]; remote: string };
  };

  assert.equal(parsed.remote.present, false);
  assert.equal(parsed.remote.current, false);
  assert.equal(parsed.remote.expectedHead, head);
  assert.match(parsed.remote.problems.join("\n"), /remote branch not found/);
  assert.match(parsed.nextActions.join("\n"), new RegExp(`--root ${escapeRegExp(fixture)}`));
  assert.match(parsed.nextActions.join("\n"), new RegExp(`Remote ${escapeRegExp(remotePath)}\\/codex\\/electron-to-tauri-migration must match ${head}`));
  assert.match(parsed.nextActions.join("\n"), /Do not run scripts\/advance-tauri-migration-m4-m5\.ts/);
  assert.doesNotMatch(parsed.nextActions.join("\n"), /Run the Windows and Linux Tauri package smoke jobs/);
});

test("tauri-migration-status reports verified platform reports", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const winReport = join(fixture, "win-report");
  const linuxReport = join(fixture, "linux-report");
  await writeWindowsReport(winReport);
  await writeLinuxReport(linuxReport);

  const result = await runStatus(fixture, "--win-report", winReport, "--linux-report", linuxReport);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    platformReports: {
      current: boolean;
      linuxReport: string;
      problems: string[];
      winReport: string;
    };
  };

  assert.equal(parsed.platformReports.current, true);
  assert.equal(parsed.platformReports.winReport, winReport);
  assert.equal(parsed.platformReports.linuxReport, linuxReport);
  assert.deepEqual(parsed.platformReports.problems, []);
  assert.match(parsed.nextActions.join("\n"), /using the verified report paths shown above/);
  assert.match(parsed.nextActions.join("\n"), /--expected-head <sha>/);
});

test("tauri-migration-status discovers reports from a report directory", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const reportDir = join(fixture, "reports");
  const winReport = join(reportDir, winArtifactName);
  const linuxReport = join(reportDir, linuxArtifactName);
  await writeWindowsReport(winReport);
  await writeLinuxReport(linuxReport);

  const result = await runStatus(fixture, "--report-dir", reportDir);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    platformReports: {
      current: boolean;
      linuxReport: string;
      problems: string[];
      winReport: string;
    };
  };

  assert.equal(parsed.platformReports.current, true);
  assert.equal(parsed.platformReports.winReport, winReport);
  assert.equal(parsed.platformReports.linuxReport, linuxReport);
  assert.deepEqual(parsed.platformReports.problems, []);
  assert.match(parsed.nextActions.join("\n"), /using the verified report paths shown above/);
  assert.match(parsed.nextActions.join("\n"), /--expected-head <sha>/);
});

test("tauri-migration-status honors TAURI_M4_REPORT_DIR env default", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const reportDir = join(fixture, "env reports");
  const winReport = join(reportDir, winArtifactName);
  const linuxReport = join(reportDir, linuxArtifactName);
  await writeWindowsReport(winReport);
  await writeLinuxReport(linuxReport);

  const result = await runStatusWithEnv(fixture, { TAURI_M4_REPORT_DIR: reportDir });
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    platformReports: {
      current: boolean;
      linuxReport: string;
      reportDir: string;
      winReport: string;
    };
  };
  const nextActions = parsed.nextActions.join("\n");

  assert.equal(parsed.platformReports.current, true);
  assert.equal(parsed.platformReports.reportDir, reportDir);
  assert.equal(parsed.platformReports.winReport, winReport);
  assert.equal(parsed.platformReports.linuxReport, linuxReport);
  assert.match(nextActions, new RegExp(`--report-dir '${escapeRegExp(reportDir)}'`));
  assert.doesNotMatch(nextActions, /--report-dir \/tmp\/open-design-tauri-m4-reports/);
});

test("tauri-migration-status keeps verified reports behind missing remote verification", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);
  const reportDir = join(fixture, "reports");
  await writeWindowsReport(join(reportDir, winArtifactName));
  await writeLinuxReport(join(reportDir, linuxArtifactName));

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath, "--report-dir", reportDir);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    platformReports: { current: boolean };
    remote: { current: boolean };
  };
  const nextActions = parsed.nextActions.join("\n");

  assert.equal(parsed.platformReports.current, true);
  assert.equal(parsed.remote.current, false);
  assert.match(nextActions, /Remote .* must match/);
  assert.match(nextActions, /Do not run scripts\/advance-tauri-migration-m4-m5\.ts/);
  assert.doesNotMatch(nextActions, /using the verified report paths shown above/);
});

test("tauri-migration-status reports missing platform report manifests without verifier stacks", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const reportDir = join(fixture, "reports");
  await mkdir(join(reportDir, winArtifactName), { recursive: true });
  await mkdir(join(reportDir, linuxArtifactName), { recursive: true });

  const result = await runStatus(fixture, "--report-dir", reportDir);
  const parsed = JSON.parse(result.stdout) as {
    platformReports: {
      current: boolean;
      problems: string[];
    };
  };

  assert.equal(parsed.platformReports.current, false);
  assert.match(parsed.platformReports.problems.join("\n"), /Windows report manifest missing:/);
  assert.match(parsed.platformReports.problems.join("\n"), /Linux report manifest missing:/);
  assert.doesNotMatch(parsed.platformReports.problems.join("\n"), /verify-tauri-platform-gates/);
  assert.doesNotMatch(parsed.platformReports.problems.join("\n"), /Node\.js/);
});

test("tauri-migration-status reports a missing platform report directory without verifier stacks", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const reportDir = join(fixture, "missing-reports");

  const result = await runStatus(fixture, "--report-dir", reportDir);
  const parsed = JSON.parse(result.stdout) as {
    platformReports: {
      current: boolean;
      problems: string[];
      reportDir: string;
    };
  };

  assert.equal(parsed.platformReports.current, false);
  assert.equal(parsed.platformReports.reportDir, reportDir);
  assert.deepEqual(parsed.platformReports.problems, [`platform report directory missing: ${reportDir}`]);
  assert.doesNotMatch(parsed.platformReports.problems.join("\n"), /verify-tauri-platform-gates/);
  assert.doesNotMatch(parsed.platformReports.problems.join("\n"), /Node\.js/);
});

test("tauri-migration-status reports the active follow-up heartbeat", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const automationDir = join(fixture, "automations");
  await writeHeartbeatAutomation(automationDir, "tauri-migration-follow-up", {
    status: "ACTIVE",
  });

  const result = await runStatus(fixture, "--automation-dir", automationDir);
  const parsed = JSON.parse(result.stdout) as {
    heartbeat: {
      current: boolean;
      expectedId: string;
      matches: Array<{ id: string; promptIncludesContinuation: boolean; status: string }>;
      problems: string[];
    };
    nextActions: string[];
  };

  assert.equal(parsed.heartbeat.current, true);
  assert.equal(parsed.heartbeat.expectedId, "tauri-migration-follow-up");
  assert.equal(parsed.heartbeat.matches.length, 1);
  assert.equal(parsed.heartbeat.matches[0]?.id, "tauri-migration-follow-up");
  assert.equal(parsed.heartbeat.matches[0]?.status, "ACTIVE");
  assert.equal(parsed.heartbeat.matches[0]?.promptIncludesContinuation, true);
  assert.deepEqual(parsed.heartbeat.problems, []);
  assert.doesNotMatch(parsed.nextActions.join("\n"), /Repair the Tauri migration follow-up heartbeat/);
});

test("tauri-migration-status flags missing or inactive follow-up heartbeats", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const automationDir = join(fixture, "automations");
  await writeHeartbeatAutomation(automationDir, "tauri-migration-follow-up", {
    prompt:
      "Continue the Electron to Tauri migration from docs/electron-to-tauri-migration.md, then run scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --remote origin --report-dir /tmp/open-design-tauri-m4-reports.",
    status: "PAUSED",
  });
  await writeHeartbeatAutomation(automationDir, "duplicate", {
    id: "duplicate",
    name: "Tauri migration follow-up",
  });

  const result = await runStatus(fixture, "--automation-dir", automationDir);
  const parsed = JSON.parse(result.stdout) as {
    heartbeat: {
      current: boolean;
      matches: Array<{ problems: string[] }>;
      problems: string[];
    };
    nextActions: string[];
  };

  assert.equal(parsed.heartbeat.current, false);
  assert.equal(parsed.heartbeat.matches.length, 2);
  assert.match(parsed.heartbeat.problems.join("\n"), /duplicate heartbeat automations/);
  assert.match(parsed.heartbeat.problems.join("\n"), /expected status ACTIVE, got PAUSED/);
  assert.match(parsed.heartbeat.problems.join("\n"), /current handoff archive\/report paths/);
  assert.match(parsed.heartbeat.problems.join("\n"), /continuation dry-run/);
  assert.match(parsed.nextActions.join("\n"), /Repair the Tauri migration follow-up heartbeat/);
});

test("tauri-migration-status reports incomplete platform report inputs", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const winReport = join(fixture, "win-report");
  await writeWindowsReport(winReport);

  const result = await runStatus(fixture, "--win-report", winReport);
  const parsed = JSON.parse(result.stdout) as { platformReports: { current: boolean; problems: string[] } };

  assert.equal(parsed.platformReports.current, false);
  assert.deepEqual(parsed.platformReports.problems, ["Linux report not provided"]);
});

test("continue-tauri-migration help documents GitHub CLI override", async () => {
  const result = await runContinue(repoRoot, "--help");

  assert.match(result.stdout, /--gh <path>/);
  assert.match(result.stdout, /env defaults: REMOTE, GITHUB_WORKFLOW, GH_BIN, TAURI_M4_REPORT_DIR, TAURI_PR_BODY_PATH/);
});

test("continue-tauri-migration honors REMOTE env default", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "env-remote.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      continueScript,
      "--root",
      fixture,
      "--handoff-dir",
      handoffDir,
      "--dry-run",
      "--skip-dispatch",
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, REMOTE: remotePath },
      maxBuffer: 1024 * 1024,
    },
  );

  assert.match(result.stdout, new RegExp(`--remote ${escapeRegExp(remotePath)}`));
  assert.match(result.stdout, /Dry-run push preflight succeeded/);
});

test("continue-tauri-migration dry-run stops after a stale handoff refresh plan", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--dry-run",
    "--skip-dispatch",
  );

  assert.match(result.stdout, /Continuing Tauri migration/);
  assert.match(result.stdout, /verify-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, new RegExp(`--cwd ${escapeRegExp(fixture)}`));
  assert.match(result.stdout, /package-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, new RegExp(`--root ${escapeRegExp(fixture)}`));
  assert.match(result.stdout, /Rerun the continuation dry-run after refreshing handoff artifacts/);
  assert.doesNotMatch(result.stdout, /push-tauri-migration-handoff\.ts/);
  assert.doesNotMatch(result.stdout, /Would push codex\/electron-to-tauri-migration/);
  assert.doesNotMatch(result.stdout, /download-tauri-m4-reports\.ts/);
});

test("continue-tauri-migration refreshes stale handoff artifacts to a custom archive path", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  const customArchivePath = join(fixture, "transfer", "custom-tauri-handoff.tar.gz");
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--handoff-archive",
    customArchivePath,
    "--remote",
    remotePath,
    "--dry-run",
    "--skip-dispatch",
  );

  assert.match(result.stdout, /verify-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, /package-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, new RegExp(`--root ${escapeRegExp(fixture)}`));
  assert.match(result.stdout, new RegExp(`--output ${escapeRegExp(customArchivePath)}`));
  assert.match(result.stdout, /Rerun the continuation dry-run after refreshing handoff artifacts/);
  assert.doesNotMatch(result.stdout, /push-tauri-migration-handoff\.ts/);
});

test("continue-tauri-migration refreshes and pushes stale handoff artifacts from the requested root", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  await initGitFixture(fixture);
  await git(fixture, "checkout", "-b", "codex/electron-to-tauri-migration");
  await writeFixtureFile(fixture, "docs/progress.md", "migration branch content\n");
  await git(fixture, "add", ".");
  await git(fixture, "commit", "-m", "fixture migration branch");
  const head = (await git(fixture, "rev-parse", "HEAD")).stdout.trim();
  const handoffDir = join(fixture, "handoff");
  const customArchivePath = join(fixture, "transfer", "custom-tauri-handoff.tar.gz");
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--handoff-archive",
    customArchivePath,
    "--remote",
    remotePath,
    "--skip-dispatch",
  );

  assert.match(result.stdout, /Refreshed verified handoff artifacts/);
  assert.match(result.stdout, /Pushed codex\/electron-to-tauri-migration/);
  assert.match(result.stdout, new RegExp(`--expected-head ${head}`));
  const remoteHead = (
    await git(fixture, "ls-remote", "--heads", remotePath, "refs/heads/codex/electron-to-tauri-migration")
  ).stdout.trim();
  assert.equal(remoteHead, `${head}\trefs/heads/codex/electron-to-tauri-migration`);
  assert.ok((await stat(customArchivePath)).size > 0);
  assert.match(await readFile(`${customArchivePath}.commands.sh`, "utf8"), /generated by scripts\/package-tauri-migration-handoff\.ts/);
});

test("continue-tauri-migration forwards branch overrides when refreshing handoff artifacts", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(
    fixture,
    "--branch",
    "codex/custom-tauri-migration",
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--dry-run",
    "--skip-dispatch",
  );

  assert.match(result.stdout, /verify-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, /--branch codex\/custom-tauri-migration/);
  assert.match(result.stdout, /Rerun the continuation dry-run after refreshing handoff artifacts/);
  assert.doesNotMatch(result.stdout, /push-tauri-migration-handoff\.ts/);
});

test("continue-tauri-migration dry-run plans a branch push from current handoff status", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath, archiveSha256 } = await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--dry-run",
    "--skip-dispatch",
  );

  assert.match(result.stdout, /Continuing Tauri migration/);
  assert.doesNotMatch(result.stdout, /verify-tauri-migration-handoff\.ts/);
  assert.doesNotMatch(result.stdout, /package-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, /push-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, /Would push codex\/electron-to-tauri-migration/);
  assert.match(result.stdout, /Dry-run push preflight succeeded/);
  assert.match(result.stdout, /If this host lacks repository write access/);
  assert.match(result.stdout, new RegExp(`Expected remote head: codex\\/electron-to-tauri-migration @ ${head}`));
  assert.match(result.stdout, new RegExp(`Archive SHA-256: ${archiveSha256}`));
  assert.match(result.stdout, /Command script SHA-256: [0-9a-f]{64}/);
  assert.match(result.stdout, new RegExp(escapeRegExp(archivePath)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.sha256`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.commands.sh`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.commands.sh.sha256`)));
  assert.match(result.stdout, new RegExp(`push-tauri-migration-handoff\\.ts --archive ${escapeRegExp(archivePath)}`));
  assert.match(result.stdout, /download-tauri-m4-reports\.ts/);
  assert.match(result.stdout, new RegExp(`--expected-head ${head}`));
  assert.match(result.stdout, /--advance/);
  const remoteHead = await git(fixture, "ls-remote", "--heads", remotePath, "refs/heads/codex/electron-to-tauri-migration");
  assert.equal(remoteHead.stdout.trim(), "");
});

test("continue-tauri-migration can continue from a custom handoff archive path", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const customArchivePath = join(fixture, "transfer", "custom-tauri-handoff.tar.gz");
  const { archivePath } = await writeHandoffArchive(handoffDir, customArchivePath);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--handoff-archive",
    customArchivePath,
    "--remote",
    remotePath,
    "--dry-run",
    "--skip-dispatch",
  );

  assert.equal(archivePath, customArchivePath);
  assert.doesNotMatch(result.stdout, /verify-tauri-migration-handoff\.ts/);
  assert.doesNotMatch(result.stdout, /package-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, new RegExp(`push-tauri-migration-handoff\\.ts --archive ${escapeRegExp(customArchivePath)}`));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${customArchivePath}.sha256`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${customArchivePath}.commands.sh`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${customArchivePath}.commands.sh.sha256`)));
  assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(`${handoffDir}.tar.gz`)));
  assert.match(result.stdout, new RegExp(`--expected-head ${head}`));
});

test("continue-tauri-migration dry-run stops after a failed push preflight", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath, archiveSha256 } = await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "missing.git");

  const result = await runContinue(fixture, "--handoff-dir", handoffDir, "--remote", remotePath, "--dry-run");

  assert.match(result.stdout, /Would push codex\/electron-to-tauri-migration/);
  assert.match(result.stdout, /Dry-run push preflight failed/);
  assert.match(result.stdout, /The planned push is likely blocked on this host/);
  assert.match(result.stdout, new RegExp(`Expected remote head: codex\\/electron-to-tauri-migration @ ${head}`));
  assert.match(result.stdout, new RegExp(`Archive SHA-256: ${archiveSha256}`));
  assert.match(result.stdout, /Command script SHA-256: [0-9a-f]{64}/);
  assert.match(result.stdout, new RegExp(escapeRegExp(archivePath)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.sha256`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.commands.sh`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.commands.sh.sha256`)));
  assert.match(result.stdout, /After the receiver push succeeds, native CI dispatch requires GH_BIN\/gh/);
  assert.match(result.stdout, /The command sidecar prints the gh workflow run ci\.yml --ref codex\/electron-to-tauri-migration/);
  assert.match(result.stdout, /Remote branch is not ready; native CI cannot be collected yet/);
  assert.doesNotMatch(result.stdout, /Native CI dispatch/);
  assert.doesNotMatch(result.stdout, /Trigger it manually with: gh workflow run/);
  assert.doesNotMatch(result.stdout, /download-tauri-m4-reports\.ts/);
});

test("continue-tauri-migration rejects branch overrides that differ from the current handoff", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  await assert.rejects(
    runContinue(
      fixture,
      "--branch",
      "codex/other-tauri-migration",
      "--handoff-dir",
      handoffDir,
      "--remote",
      remotePath,
      "--dry-run",
      "--skip-dispatch",
    ),
    /continuation branch codex\/other-tauri-migration does not match current handoff\/status branch codex\/electron-to-tauri-migration/,
  );
});

test("continue-tauri-migration dry-run with skip-push stops before native CI when the remote is missing", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath } = await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--dry-run",
    "--skip-push",
  );

  assert.match(result.stdout, /Push skipped/);
  assert.match(result.stdout, /If this host lacks repository write access/);
  assert.match(result.stdout, new RegExp(escapeRegExp(archivePath)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.sha256`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.commands.sh`)));
  assert.match(result.stdout, new RegExp(escapeRegExp(`${archivePath}.commands.sh.sha256`)));
  assert.match(result.stdout, new RegExp(`push-tauri-migration-handoff\\.ts --archive ${escapeRegExp(archivePath)}`));
  assert.match(result.stdout, /After the receiver push succeeds, native CI dispatch requires GH_BIN\/gh/);
  assert.match(result.stdout, /The command sidecar prints the gh workflow run ci\.yml --ref codex\/electron-to-tauri-migration/);
  assert.match(result.stdout, /Remote branch is not ready; native CI cannot be collected yet/);
  assert.doesNotMatch(result.stdout, /Native CI dispatch/);
  assert.doesNotMatch(result.stdout, /download-tauri-m4-reports\.ts/);
});

test("continue-tauri-migration does not advance from local reports before remote head verification", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);
  const reportDir = join(fixture, "reports");
  await writeWindowsReport(join(reportDir, winArtifactName));
  await writeLinuxReport(join(reportDir, linuxArtifactName));

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--report-dir",
    reportDir,
    "--advance",
    "--dry-run",
    "--skip-push",
    "--skip-dispatch",
  );

  assert.match(result.stdout, /Remote branch is not ready; native CI cannot be collected yet/);
  assert.doesNotMatch(result.stdout, /advance-tauri-migration-m4-m5\.ts/);
  assert.doesNotMatch(result.stdout, /Would record M4 evidence/);
});

test("continue-tauri-migration surfaces missing platform reports before planning M4 work", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);
  const reportDir = join(fixture, "missing reports");

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--report-dir",
    reportDir,
    "--dry-run",
    "--skip-push",
    "--skip-dispatch",
  );

  assert.match(result.stdout, /Platform reports need attention/);
  assert.match(result.stdout, new RegExp(`platform report directory missing: ${escapeRegExp(reportDir)}`));
  assert.match(result.stdout, /Remote branch is not ready; native CI cannot be collected yet/);
});

test("continue-tauri-migration surfaces heartbeat problems before planning M4 work", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);
  const automationDir = join(fixture, "automations");
  await writeHeartbeatAutomation(automationDir, "tauri-migration-follow-up", {
    prompt: "Continue from docs/electron-to-tauri-migration.md without the dry-run cadence.",
    status: "PAUSED",
  });

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--automation-dir",
    automationDir,
    "--dry-run",
    "--skip-dispatch",
  );

  assert.match(result.stdout, /Heartbeat needs attention/);
  assert.match(result.stdout, /expected status ACTIVE, got PAUSED/);
  assert.match(result.stdout, /continuation dry-run/);
  assert.match(result.stdout, /Would push codex\/electron-to-tauri-migration/);
});

test("continue-tauri-migration surfaces missing M4 evidence markers before planning M4 work", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [...m4PlatformGateLabels],
    defaults: "electron",
    extraDocLines: [m4EvidenceLogMarker],
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runContinue(fixture, "--handoff-dir", handoffDir, "--remote", remotePath, "--dry-run", "--skip-dispatch");

  assert.match(result.stdout, /M4 evidence needs attention/);
  assert.match(result.stdout, /missing pushed remote branch-head evidence marker\/detail/);
  assert.match(result.stdout, /Would push codex\/electron-to-tauri-migration/);
});

test("continue-tauri-migration dry-run waits for reports when the remote already matches", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = await createRemoteFixture(fixture, head);
  const reportDir = join(fixture, "reports");

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--report-dir",
    reportDir,
    "--wait-reports",
    "--advance",
    "--dry-run",
    "--skip-dispatch",
  );

  assert.doesNotMatch(result.stdout, /push-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, /download-tauri-m4-reports\.ts/);
  assert.match(result.stdout, new RegExp(`--expected-head ${head}`));
  assert.match(result.stdout, new RegExp(`--output-dir ${escapeRegExp(reportDir)}`));
  assert.match(result.stdout, new RegExp(`--root ${escapeRegExp(fixture)}`));
  assert.match(result.stdout, /--advance/);
  assert.match(result.stdout, /Would wait for native M4 reports and advance M4→M5/);
});

test("continue-tauri-migration reports manual dispatch when gh workflow dispatch fails", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = await createRemoteFixture(fixture, head);
  const ghBin = join(fixture, "fake-gh");
  await writeFile(ghBin, "#!/usr/bin/env bash\necho dispatch denied >&2\nexit 1\n", "utf8");
  await chmod(ghBin, 0o755);

  const result = await runContinue(fixture, "--handoff-dir", handoffDir, "--remote", remotePath, "--gh", ghBin);

  assert.match(result.stdout, /Native CI dispatch failed/);
  const prBodyPath = join(fixture, ".tmp", "tauri-migration-pr-body.md");
  assert.match(result.stdout, new RegExp(`Draft PR body: ${escapeRegExp(prBodyPath)}`));
  assert.match(result.stdout, new RegExp(`Trigger it manually with: ${escapeRegExp(ghBin)} workflow run ci\\.yml --ref codex/electron-to-tauri-migration`));
  assert.match(result.stdout, /If workflow dispatch is unavailable after the branch is pushed, open a draft PR with:/);
  assert.match(result.stdout, new RegExp(`${escapeRegExp(ghBin)} pr create --draft --base main --head codex/electron-to-tauri-migration`));
  assert.match(result.stdout, new RegExp(`--body-file ${escapeRegExp(prBodyPath)}`));
  assert.match(result.stdout, /download-tauri-m4-reports\.ts/);
  assert.match(result.stdout, new RegExp(`--expected-head ${head}`));
  assert.match(result.stdout, new RegExp(`--root ${escapeRegExp(fixture)}`));
  assert.match(await readFile(prBodyPath, "utf8"), /## Validation/);
  assert.match(await readFile(prBodyPath, "utf8"), /Pending native M4 evidence/);
});

test("continue-tauri-migration dry-run reports manual dispatch when gh is unavailable", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = await createRemoteFixture(fixture, head);
  const missingGh = join(fixture, "missing-gh");

  const result = await runContinue(fixture, "--handoff-dir", handoffDir, "--remote", remotePath, "--gh", missingGh, "--dry-run");
  const prBodyPath = join(fixture, ".tmp", "tauri-migration-pr-body.md");

  assert.doesNotMatch(result.stdout, new RegExp(`Would run: ${escapeRegExp(missingGh)}`));
  assert.doesNotMatch(result.stdout, /Would request native CI dispatch/);
  assert.match(result.stdout, /Native CI dispatch skipped/);
  assert.match(result.stdout, new RegExp(`${escapeRegExp(missingGh)} is not available on PATH`));
  assert.match(result.stdout, new RegExp(`Would write draft PR body: ${escapeRegExp(prBodyPath)}`));
  assert.match(
    result.stdout,
    new RegExp(`Trigger it manually with: ${escapeRegExp(missingGh)} workflow run ci\\.yml --ref codex/electron-to-tauri-migration`),
  );
  assert.match(result.stdout, /If workflow dispatch is unavailable after the branch is pushed, open a draft PR with:/);
  assert.match(result.stdout, new RegExp(`${escapeRegExp(missingGh)} pr create --draft --base main --head codex/electron-to-tauri-migration`));
  assert.match(result.stdout, new RegExp(`--body-file ${escapeRegExp(prBodyPath)}`));
  assert.match(result.stdout, /download-tauri-m4-reports\.ts/);
  assert.match(result.stdout, new RegExp(`--expected-head ${head}`));
  assert.match(result.stdout, new RegExp(`--root ${escapeRegExp(fixture)}`));
  await assert.rejects(readFile(prBodyPath, "utf8"), /ENOENT/);
});

test("continue-tauri-migration keeps receiver override paths aligned in dry-run", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);
  const missingGh = join(fixture, "missing-gh");
  const reportDir = join(fixture, "custom reports");
  const prBodyPath = join(fixture, "custom pr", "tauri-pr.md");

  const result = await runContinue(
    fixture,
    "--handoff-dir",
    handoffDir,
    "--remote",
    remotePath,
    "--gh",
    missingGh,
    "--workflow",
    "release beta.yml",
    "--report-dir",
    reportDir,
    "--pr-body-path",
    prBodyPath,
    "--dry-run",
  );

  assert.match(result.stdout, /push-tauri-migration-handoff\.ts/);
  assert.match(result.stdout, new RegExp(`--gh ${escapeRegExp(missingGh)}`));
  assert.match(result.stdout, /--workflow 'release beta\.yml'/);
  assert.match(result.stdout, new RegExp(`--report-dir '${escapeRegExp(reportDir)}'`));
  assert.match(result.stdout, new RegExp(`--pr-body-path '${escapeRegExp(prBodyPath)}'`));
  assert.match(
    result.stdout,
    new RegExp(`Trigger it manually with: ${escapeRegExp(missingGh)} workflow run 'release beta\\.yml' --ref codex/electron-to-tauri-migration`),
  );
  assert.match(result.stdout, new RegExp(`--body-file '${escapeRegExp(prBodyPath)}'`));
  assert.match(result.stdout, new RegExp(`--output-dir '${escapeRegExp(reportDir)}'`));
  assert.match(result.stdout, new RegExp(`--expected-head ${head}`));
});

test("continue-tauri-migration reports transferable handoff paths when push fails", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const { archivePath, archiveSha256 } = await writeHandoffArchive(handoffDir);
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  await assert.rejects(
    runContinue(fixture, "--handoff-dir", handoffDir, "--remote", remotePath, "--skip-dispatch"),
    (error) => {
      const detail = error as Error & { stderr?: string };
      const stderr = detail.stderr ?? "";
      assert.match(stderr, /Remote handoff push failed/);
      assert.match(stderr, new RegExp(`Expected remote head: codex\\/electron-to-tauri-migration @ ${head}`));
      assert.match(stderr, new RegExp(`Archive SHA-256: ${archiveSha256}`));
      assert.match(stderr, /Command script SHA-256: [0-9a-f]{64}/);
      assert.match(stderr, new RegExp(escapeRegExp(archivePath)));
      assert.match(stderr, new RegExp(escapeRegExp(`${archivePath}.sha256`)));
      assert.match(stderr, new RegExp(escapeRegExp(`${archivePath}.commands.sh`)));
      assert.match(stderr, new RegExp(escapeRegExp(`${archivePath}.commands.sh.sha256`)));
      assert.match(stderr, /Then run the command sidecar from that checkout/);
      assert.match(stderr, new RegExp(`${escapeRegExp(`${archivePath}.commands.sh`)} ${escapeRegExp(archivePath)}`));
      assert.match(stderr, /After the receiver push succeeds, native CI dispatch requires GH_BIN\/gh/);
      assert.match(stderr, /The command sidecar prints the gh workflow run ci\.yml --ref codex\/electron-to-tauri-migration/);
      assert.match(stderr, /Or run the push-only fallback/);
      assert.match(stderr, /push-tauri-migration-handoff\.ts/);
      return true;
    },
  );
});

async function createFixtureRoot(
  t: test.TestContext,
  options: { checked: readonly string[]; defaults: "electron" | "tauri"; extraDocLines?: readonly string[] },
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-status-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  await writeFixtureFile(root, "docs/electron-to-tauri-migration.md", migrationDoc(options.checked, options.extraDocLines ?? []));
  await writeFixtureFile(root, "tools/dev/src/config.ts", toolsConfig(options.defaults));
  await writeFixtureFile(root, "tools/pack/src/config.ts", toolsConfig(options.defaults));
  await writeFixtureFile(root, ".github/workflows/release-beta.yml", releaseBetaWorkflow(options.defaults));
  return root;
}

async function initGitFixture(root: string): Promise<string> {
  await git(root, "init", "--initial-branch=main");
  await git(root, "config", "user.email", "codex@example.test");
  await git(root, "config", "user.name", "Codex Test");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "fixture");
  await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return (await git(root, "rev-parse", "HEAD")).stdout.trim();
}

async function writeHandoffFixture(
  handoffDir: string,
  options: { branchHead: string; bundlePath?: string; fixedReportNote?: boolean; staleNote?: boolean },
): Promise<string> {
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  const bundle = Buffer.from("bundle\n", "utf8");
  const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
  await mkdir(handoffDir, { recursive: true });
  await writeFile(bundlePath, bundle);
  await writeFile(
    join(handoffDir, "open-design-tauri-migration-handoff.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: "codex/electron-to-tauri-migration",
        branchHead: options.branchHead,
        bundlePath: options.bundlePath ?? "open-design-tauri-migration.bundle",
        bundleSha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(handoffDir, "open-design-tauri-migration-handoff.md"),
    handoffNoteFixture(options.branchHead, {
      fixedReportNote: options.fixedReportNote === true,
      stale: options.staleNote === true,
    }),
    "utf8",
  );
  return bundleSha256;
}

function handoffNoteFixture(branchHead: string, options: { fixedReportNote: boolean; stale: boolean }): string {
  const reportDirArg = options.fixedReportNote ? "/tmp/open-design-tauri-m4-reports" : '"${TAURI_M4_REPORT_DIR:-/tmp/open-design-tauri-m4-reports}"';
  const winReportArg = options.fixedReportNote
    ? "/tmp/open-design-tauri-m4-reports/open-design-ci-win-tauri-e2e-report"
    : '"${TAURI_M4_REPORT_DIR:-/tmp/open-design-tauri-m4-reports}/open-design-ci-win-tauri-e2e-report"';
  const linuxReportArg = options.fixedReportNote
    ? "/tmp/open-design-tauri-m4-reports/open-design-ci-linux-tauri-e2e-report"
    : '"${TAURI_M4_REPORT_DIR:-/tmp/open-design-tauri-m4-reports}/open-design-ci-linux-tauri-e2e-report"';
  const directAdvanceCommand = options.stale
    ? [
        "pnpm exec tsx scripts/advance-tauri-migration-m4-m5.ts \\",
        `  --win-report ${winReportArg} \\`,
        `  --linux-report ${linuxReportArg}`,
      ]
    : [
        "pnpm exec tsx scripts/advance-tauri-migration-m4-m5.ts \\",
        '  --remote "${REMOTE:-origin}" \\',
        "  --branch codex/electron-to-tauri-migration \\",
        `  --expected-head ${branchHead} \\`,
        `  --win-report ${winReportArg} \\`,
        `  --linux-report ${linuxReportArg}`,
      ];
  return [
    "# Tauri Migration Handoff",
    "",
    "```bash",
    "pnpm exec tsx scripts/download-tauri-m4-reports.ts \\",
    "  --branch codex/electron-to-tauri-migration \\",
    `  --expected-head ${branchHead} \\`,
    '  --remote "${REMOTE:-origin}" \\',
    "  --wait \\",
    `  --output-dir ${reportDirArg}`,
    "```",
    "",
    "```bash",
    ...directAdvanceCommand,
    "```",
    "",
  ].join("\n");
}

async function writeHandoffArchive(handoffDir: string, output?: string): Promise<{ archivePath: string; archiveSha256: string }> {
  const archivePath = output ?? `${handoffDir}.tar.gz`;
  await mkdir(dirname(archivePath), { recursive: true });
  await execFileAsync("tar", ["-czf", archivePath, "-C", dirname(handoffDir), basename(handoffDir)], {
    maxBuffer: 1024 * 1024,
  });
  const archiveSha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  await writeFile(`${archivePath}.sha256`, `${archiveSha256}  ${basename(archivePath)}\n`, "utf8");
  await writeFile(
    `${archivePath}.commands.sh`,
    [
      "#!/usr/bin/env bash",
      "# generated by scripts/package-tauri-migration-handoff.ts",
      "read_checksum() {",
      "  :",
      "}",
      'read_checksum "$command_checksum" "$(basename -- "$script_path")" "command script"',
      'read_checksum "$checksum" "$(basename -- "$archive")" "archive"',
      "ensure_tracked_clean() {",
      "  git status --porcelain --untracked-files=no",
      '  printf "%s\\n" "tracked worktree changes are present"',
      "}",
      "ensure_tracked_clean",
      'restore_branch=""',
      'restore_branch="$branch"',
      'git checkout "$restore_branch"',
      'gh_bin="${GH_BIN:-gh}"',
      'command -v "$gh_bin"',
      '"$gh_bin" workflow run "$workflow" --ref "$branch"',
      "print_shell_command() {",
      '  printf \'%q\' "$word"',
      "}",
      'print_shell_command "$gh_bin" workflow run "$workflow" --ref "$branch"',
      'print_shell_command "$gh_bin" pr create --draft --base main --head "$branch"',
      'print_shell_command pnpm exec tsx scripts/download-tauri-m4-reports.ts --branch "$branch"',
      'git fetch "$bundle" "$branch:$temp_ref"',
      'gh workflow run "$workflow" --ref "$branch"',
      "download-tauri-m4-reports.ts",
      "bundle_sha=",
      'actual_bundle_sha="$(hash_file "$bundle")"',
      "bundle SHA-256 mismatch",
      'printf "%s\\n" "Verified handoff package identity:"',
      'printf "%s\\n" "  Expected remote head: $branch @ $expected_head"',
      'printf "%s\\n" "  Archive SHA-256: $actual_sha"',
      'printf "%s\\n" "  Command script SHA-256: $actual_command_sha"',
      'printf "%s\\n" "  Bundle SHA-256: $actual_bundle_sha"',
      'git bundle verify "$bundle"',
      'bundle_heads="$(git bundle list-heads "$bundle")"',
      "bundle does not contain expected branch head",
      'bundle_head="$(git rev-parse --verify "$temp_ref^{commit}")"',
      "bundle branch head mismatch",
      "unsupported handoff manifest schemaVersion",
      "handoff manifest branchHead must be a 40-character SHA-1",
      "handoff manifest bundlePath must be relative and relocatable",
      "handoff manifest bundleSha256 must be a 64-character SHA-256",
      '--run-id "$GITHUB_RUN_ID"',
      '--branch "$branch"',
      '--remote "$remote"',
      '--expected-head "$expected_head"',
      '--handoff-archive "$archive"',
      "workflow_dispatched",
      "TAURI_NATIVE_CI_WAIT",
      'pnpm exec tsx scripts/download-tauri-m4-reports.ts --branch "$branch" --expected-head "$expected_head" --remote "$remote" --wait --output-dir "$report_dir" --advance',
      "# GITHUB_RUN_ID=<github-run-id>",
      'print_shell_command "GITHUB_RUN_ID=<github-run-id>" "$script_path" "$archive"',
      "--wait",
      "TAURI_PR_BODY_PATH",
      "--body-file",
      "GITHUB_RUN_ID",
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(`${archivePath}.commands.sh`, 0o755);
  await writeCommandScriptChecksum(`${archivePath}.commands.sh`);
  return { archivePath, archiveSha256 };
}

async function writeCommandScriptChecksum(commandScriptPath: string): Promise<void> {
  const commandScriptSha256 = createHash("sha256").update(await readFile(commandScriptPath)).digest("hex");
  await writeFile(`${commandScriptPath}.sha256`, `${commandScriptSha256}  ${basename(commandScriptPath)}\n`, "utf8");
}

async function createRemoteFixture(root: string, branchHead: string): Promise<string> {
  const remotePath = join(root, "remote.git");
  await git(root, "init", "--bare", remotePath);
  await git(root, "push", remotePath, `${branchHead}:refs/heads/codex/electron-to-tauri-migration`);
  return remotePath;
}

async function writeWindowsReport(reportRoot: string): Promise<void> {
  await mkdir(join(reportRoot, "screenshots"), { recursive: true });
  await writeFile(join(reportRoot, "screenshots", "open-design-win-smoke.png"), "png");
  await writeJson(join(reportRoot, "manifest.json"), {
    platform: "win",
    screenshot: "screenshots/open-design-win-smoke.png",
    spec: "specs/win-tauri.spec.ts",
  });
  await writeJson(join(reportRoot, "suite-result.json"), {
    exitCode: 0,
    platform: "win",
    spec: "specs/win-tauri.spec.ts",
    status: "success",
  });
  await writeJson(join(reportRoot, "summary.json"), {
    build: {
      installerPath: "C:/tmp/OpenDesign.exe",
      to: "nsis",
    },
    health: healthyEval(1234),
    install: {
      installDir: "C:/tmp/install",
      uninstallerPath: "C:/tmp/install/Uninstall.exe",
    },
    screenshot: "screenshots/open-design-win-smoke.png",
    start: {
      executablePath: "C:/tmp/install/Open Design.exe",
      pid: 123,
      source: "installed",
      status: runningStatus(1234),
    },
    stop: {
      remainingPids: [],
    },
    uninstall: {
      residueObservation: {
        installedExeExists: false,
        managedProcessPids: [],
        productNamespaceRootExists: false,
        registryResidues: [],
        uninstallerExists: false,
      },
    },
  });
}

async function writeLinuxReport(reportRoot: string): Promise<void> {
  await mkdir(join(reportRoot, "screenshots"), { recursive: true });
  await writeFile(join(reportRoot, "screenshots", "open-design-linux-smoke.png"), "png");
  await writeJson(join(reportRoot, "manifest.json"), {
    platform: "linux",
    screenshot: "screenshots/open-design-linux-smoke.png",
    spec: "specs/linux.spec.ts",
  });
  await writeJson(join(reportRoot, "suite-result.json"), {
    exitCode: 0,
    platform: "linux",
    spec: "specs/linux.spec.ts",
    status: "success",
  });
  await writeJson(join(reportRoot, "summary.json"), {
    build: {
      appImagePath: "/tmp/OpenDesign.AppImage",
      to: "appimage",
    },
    headless: {
      install: {
        launcherPath: "/tmp/open-design-headless",
      },
      start: {
        pid: 345,
        status: {
          url: "http://127.0.0.1:3456/",
        },
      },
      stop: {
        remainingPids: [],
      },
    },
    health: healthyEval(2345),
    install: {
      appImagePath: "/tmp/OpenDesign.AppImage",
    },
    screenshot: "screenshots/open-design-linux-smoke.png",
    start: {
      executablePath: "/tmp/OpenDesign.AppImage",
      pid: 234,
      source: "installed",
      status: runningStatus(2345),
    },
    stop: {
      remainingPids: [],
    },
    uninstall: {
      removed: {
        appImage: "removed",
        desktop: "removed",
        icon: "removed",
      },
    },
  });
}

async function writeHeartbeatAutomation(
  automationDir: string,
  directoryName: string,
  options: { id?: string; name?: string; prompt?: string; status?: string } = {},
): Promise<void> {
  const prompt =
    options.prompt ??
    "Continue from docs/electron-to-tauri-migration.md, then run scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz --remote origin --report-dir /tmp/open-design-tauri-m4-reports and scripts/continue-tauri-migration.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz --remote origin --report-dir /tmp/open-design-tauri-m4-reports --dry-run before mutating state.";
  await mkdir(join(automationDir, directoryName), { recursive: true });
  await writeFile(
    join(automationDir, directoryName, "automation.toml"),
    [
      "version = 1",
      `id = "${options.id ?? "tauri-migration-follow-up"}"`,
      'kind = "heartbeat"',
      `name = "${options.name ?? "Tauri migration follow-up"}"`,
      `prompt = "${prompt}"`,
      `status = "${options.status ?? "ACTIVE"}"`,
      'rrule = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0"',
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runningStatus(port: number): { state: string; url: string } {
  return {
    state: "running",
    url: `http://127.0.0.1:${port}/`,
  };
}

function healthyEval(port: number): { health: { ok: boolean; version: string }; href: string; status: number } {
  return {
    health: {
      ok: true,
      version: "0.7.0",
    },
    href: `http://127.0.0.1:${port}/`,
    status: 200,
  };
}

function migrationDoc(checkedLabels: readonly string[], extraLines: readonly string[]): string {
  const checked = new Set(checkedLabels);
  return [
    "# Electron to Tauri Migration",
    "",
    ...[
      ...m4PlatformGateLabels,
      m5ToolsDevDefaultLabel,
      m5ToolsPackDefaultLabel,
      m5ReleaseBetaDefaultLabel,
      m5ElectronFallbackLabel,
      m5PrimaryDocsLabel,
      m6ElectronDepsLabel,
      m6ElectronRuntimeLabel,
      m6ElectronResourcesLabel,
      m6ElectronTestsLabel,
      m6ElectronGuidanceLabel,
    ].map((label) => `- [${checked.has(label) ? "x" : " "}] ${label}`),
    "",
    ...extraLines,
  ].join("\n");
}

function toolsConfig(defaultRuntime: "electron" | "tauri"): string {
  return `export const DEFAULT_DESKTOP_RUNTIME = "${defaultRuntime}";\n`;
}

function releaseBetaWorkflow(defaultRuntime: "electron" | "tauri"): string {
  return [
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      desktop_runtime:",
    "        type: choice",
    "        options:",
    "          - electron",
    "          - tauri",
    `        default: ${defaultRuntime}`,
    "",
  ].join("\n");
}

async function writeFixtureFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
}

async function runStatus(root: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", statusScript, "--root", root, ...args, "--json"], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function runStatusWithEnv(
  root: string,
  env: Record<string, string>,
  ...args: string[]
): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", statusScript, "--root", root, ...args, "--json"], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024,
  });
}

async function runContinue(root: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", continueScript, "--root", root, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function git(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
