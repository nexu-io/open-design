import { execFile } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { installMacElectronApp, withMacElectronProcess } from "@open-design/shell-electron/lifecycle/installed";
import { describeElectronRuntimeDiagnostics, inspectElectronStartupThroughCdp } from "@open-design/shell-electron/lifecycle/inspection";
import { checkedFile, describeFile, readObject, writeObject } from "./control-common.ts";
import { readPublishedAcceptance } from "./installed-acceptance.ts";
import { collectReleaseAcceptance, updateAcceptanceClosure } from "./acceptance.ts";

type Input = Readonly<{ publication: string; policy: string; shell: string; target: string; workRoot: string }>;
const execute = promisify(execFile);
type ExerciseInput = Input & Readonly<{ artifact: string; mode: string; baselineReceipt?: string }>;

export async function exerciseReleaseInstallation(input: ExerciseInput) {
  try { return await executeReleaseInstallation(input); }
  finally {
    if (input.shell === "electron" && ["first", "hot"].includes(input.mode)) {
      try {
        const { required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication,
          policyReceipt: input.policy, shellType: input.shell, target: input.target });
        const diagnostics = describeElectronRuntimeDiagnostics({ baseUserDataRoot: join(resolve(input.workRoot), input.mode, "user-data"),
          channel: policy.channel, namespace: required.installIdentity.namespace, presentation: "headless" });
        const output = join(resolve(input.workRoot), "diagnostics");
        await mkdir(output, { recursive: true });
        await copyFile(diagnostics.runtimeLog, join(output, input.mode + "-runtime.jsonl"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not retain installation diagnostics:", error);
      }
    }
  }
}

/** Execution products belong to this invocation, never to the workflow's directory layout. */
async function executeReleaseInstallation(input: ExerciseInput) {
  if (!["first", "hot"].includes(input.mode)) throw new Error("Installation mode must be first or hot");
  if (!input.target.startsWith("darwin-") || process.platform !== "darwin") throw new Error("Installed execution currently requires macOS");
  if (input.mode === "hot" && input.shell !== "electron") throw new Error("Hot execution requires Electron");
  const { required, published, policy } = await readPublishedAcceptance({
    publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target,
  });
  if (input.mode === "first") await checkedFile(required.artifact, "Published installer", input.artifact);
  else {
    if (!input.baselineReceipt) throw new Error("Hot execution requires baseline acquisition receipt");
    const baseline = await readObject(input.baselineReceipt);
    if (baseline.schemaVersion !== 1 || baseline.operation !== "electron.baseline.fetch" || baseline.target !== input.target
      || baseline.shell?.version !== required.shell.version || baseline.shell?.buildHash !== required.shell.buildHash
      || baseline.installIdentity?.executableName !== required.installIdentity?.executableName
      || baseline.installIdentity?.namespace !== required.installIdentity?.namespace) throw new Error("Baseline execution identity mismatch");
    await checkedFile(baseline.artifact, "Baseline installer", input.artifact);
  }
  const root = join(resolve(input.workRoot), input.mode);
  await mkdir(resolve(input.workRoot), { recursive: true });
  await mkdir(root); // Refuse evidence reuse or overwriting an earlier attempt.
  const baseUserDataRoot = join(root, "user-data");
  let installedRoot: string;
  let hotAcceptanceReceipt: string | undefined;
  if (input.shell === "electron") {
    const appPath = join(root, "installed.app");
    installedRoot = (await installMacElectronApp({ artifact: resolve(input.artifact), appPath })).resources;
    const executableName = required.installIdentity?.executableName;
    if (typeof executableName !== "string") throw new Error("Published executable identity is absent");
    // Enclose platform acquisition plus the product's bounded cold warmup;
    // readiness still requires committed startup and renderer evidence.
    const common = { appPath, executableName, timeoutMs: 600_000 };
    const args = ["--headless", `--user-data-dir=${baseUserDataRoot}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0"];
    if (input.mode === "hot") {
      const head = new URL(published.channelHead.url), base = new URL(policy.target.publicBaseUrl + "/");
      if (head.protocol !== "https:" || head.origin !== base.origin || head.username || head.password
        || !head.pathname.startsWith(base.pathname + policy.channel + "/" + policy.releaseVersion + "/")) throw new Error("Candidate head escapes publication");
      hotAcceptanceReceipt = join(root, "hot.json");
      await withMacElectronProcess({ ...common, args: [...args, `--od-channel-head-url=${head.href}`] },
      async () => updateAcceptanceClosure({ ...input, baseUserDataRoot, receipt: hotAcceptanceReceipt! }));
    }
    const startedAfter = Date.now();
    await withMacElectronProcess({ ...common, args }, async () => {
      const result = await inspectElectronStartupThroughCdp({ baseUserDataRoot, channel: policy.channel,
        namespace: required.installIdentity.namespace, presentation: "headless" }, startedAfter);
      await writeObject(join(root, "startup-cdp.json"), result);
    });
  } else if (input.shell === "terminal") {
    const extracted = join(root, "extracted");
    installedRoot = join(root, "installed");
    await mkdir(extracted);
    await execute("/usr/bin/tar", ["-xzf", resolve(input.artifact), "-C", extracted], { timeout: 120_000 });
    const source = join(extracted, "nexu-terminal");
    const namespace = "exact-public-acceptance";
    const installed = await execute("/bin/sh", [join(source, "sh/install.sh"), "--source", source,
      "--root", installedRoot, "--channel", policy.channel, "--namespace", namespace], { timeout: 180_000 });
    await writeObject(join(root, "installed-proof.json"), JSON.parse(installed.stdout));
    const lifecycle = async (operation: string) => execute("/bin/sh", [join(installedRoot, "sh/terminal.sh"),
      "--root", installedRoot, "--store-root", join(root, "store"), "--channel", policy.channel, "--namespace", namespace,
      "--operation", operation, "--result", join(root, `runtime-${operation}.json`),
      ...(operation === "start" ? ["--attachment-id", "public-acceptance"] : [])], { timeout: 180_000 });
    try { await lifecycle("start"); await lifecycle("status"); } finally { await lifecycle("stop"); }
  } else throw new Error("Unsupported acceptance Shell");
  await writeObject(join(root, "execution.json"), {
    schemaVersion: 1, operation: "release.installation.exercise", shell: input.shell, target: input.target,
    publication: await describeFile(input.publication), installedRoot, runtimeProofRoot: root,
    baseUserDataRoot, ...(hotAcceptanceReceipt == null ? {} : { hotAcceptanceReceipt }),
  });
}

export async function collectExecutedAcceptance(input: Input & Readonly<{ inspection?: string; receipt: string }>) {
  const root = resolve(input.workRoot);
  const readExecution = async (mode: string) => {
    const value = await readObject(join(root, mode, "execution.json"));
    if (value.schemaVersion !== 1 || value.operation !== "release.installation.exercise"
      || value.shell !== input.shell || value.target !== input.target) throw new Error("Installed execution identity mismatch");
    await checkedFile(value.publication, "Execution publication", input.publication);
    return value;
  };
  const first = await readExecution("first");
  let hot = false;
  if (input.shell === "electron") {
    if (!input.inspection) throw new Error("Electron collection requires baseline inspection");
    const inspection = await readObject(input.inspection);
    const { policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target });
    if (inspection.schemaVersion !== 1 || inspection.operation !== "electron.baseline.inspect"
      || inspection.target !== input.target || inspection.channel !== policy.channel || inspection.releaseVersion !== policy.releaseVersion
      || typeof inspection.compatible !== "boolean") throw new Error("Baseline inspection identity mismatch");
    hot = inspection.compatible;
  }
  const selected = hot ? await readExecution("hot") : first;
  await collectReleaseAcceptance({ ...input, installedRoot: selected.installedRoot,
    runtimeProofRoot: selected.runtimeProofRoot, baseUserDataRoot: selected.baseUserDataRoot,
    ...(hot ? { hotAcceptanceReceipt: selected.hotAcceptanceReceipt,
      firstInstallRoot: first.installedRoot, firstInstallUserDataRoot: first.baseUserDataRoot } : {}) });
}
