import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { installMacElectronApp, withMacElectronProcess } from "@open-design/shell-electron/lifecycle/installed";
import { describeElectronRuntimeDiagnostics, inspectElectronBoundCapsule, inspectElectronSelectedCapsule, inspectElectronStartupThroughCdp, waitForElectronStartup } from "@open-design/shell-electron/lifecycle/inspection";
import { canonicalBytes, checkedFile, describeFile, readObject, writeObject } from "./control-common.ts";
import { readPublishedAcceptance } from "./installed-acceptance.ts";
import { collectReleaseAcceptance, updateAcceptanceSameCarrier } from "./acceptance.ts";
import { createAcceptanceScope, removeAcceptanceScope } from "./acceptance-scope.ts";

type Input = Readonly<{ publication: string; policy: string; shell: string; target: string; workRoot: string }>;
const execute = promisify(execFile);
type ExerciseInput = Input & Readonly<{ artifact: string; mode: string; baselineReceipt?: string; namespace?: string }>;

export async function exerciseReleaseInstallation(input: ExerciseInput) {
  return exerciseInstallation(input);
}

/** Both installations are verified before either runtime starts. Wait for both
 * owners to finish, including cleanup, even when one scenario fails. */
export async function exerciseReleaseInstallationPair(input: Input & Readonly<{ artifact: string; baselineArtifact: string; baselineReceipt: string }>) {
  if (input.shell !== "electron") throw new Error("Paired installation acceptance requires Electron");
  const firstInput = { ...input, mode: "first", namespace: `accept-first-${randomUUID()}` };
  const hotInput = { ...input, artifact: input.baselineArtifact, mode: "hot", namespace: `accept-hot-${randomUUID()}` };
  const prepared = await Promise.allSettled([prepareInstallation(firstInput), prepareInstallation(hotInput)]);
  const failures = prepared.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Installation preparation failed");
  const first = (prepared[0] as PromiseFulfilledResult<PreparedInstallation>).value;
  const hot = (prepared[1] as PromiseFulfilledResult<PreparedInstallation>).value;
  const results = await Promise.allSettled([
    exerciseInstallation(firstInput, first),
    exerciseInstallation(hotInput, hot, first.installedRoot),
  ]);
  const errors = results.filter(result => result.status === "rejected");
  if (errors.length) throw new AggregateError(errors.map(result => result.reason), "Installed acceptance failed");
}

type PreparedInstallation = Awaited<ReturnType<typeof prepareInstallation>>;
async function exerciseInstallation(input: ExerciseInput, prepared?: PreparedInstallation, candidateRoot?: string) {
  if (!["first", "hot"].includes(input.mode)) throw new Error("Installation mode must be first or hot");
  input = { ...input, namespace: input.namespace ?? `accept-${input.mode}-${randomUUID()}` };
  try { return await executeReleaseInstallation(input, prepared ?? await prepareInstallation(input), candidateRoot); }
  catch (error) {
    const failure = error as Error & { code?: unknown; signal?: unknown; killed?: boolean; stdout?: string; stderr?: string };
    try {
      await writeObject(join(resolve(input.workRoot), "diagnostics", `${input.mode}-failure.json`), {
        message: failure.message, code: failure.code, signal: failure.signal, killed: failure.killed,
        stdout: failure.stdout, stderr: failure.stderr,
      });
    } catch (diagnosticError) { console.error("Could not retain installation failure:", diagnosticError); }
    throw error;
  }
  finally {
    if (input.shell === "electron" && input.mode === "hot") {
      try {
        const output = join(resolve(input.workRoot), "diagnostics");
        await mkdir(output, { recursive: true });
        await copyFile(join(resolve(input.workRoot), "hot", "hot.json.stages.json"), join(output, "hot-stages.json"));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not retain Capsule stages:", error); }
    }
    if (input.shell === "electron" && ["first", "hot"].includes(input.mode)) {
      try {
        const { required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication,
          policyReceipt: input.policy, shellType: input.shell, target: input.target });
        const diagnostics = describeElectronRuntimeDiagnostics({ namespace: input.namespace!,
          channel: policy.channel, productName: required.installIdentity.productName, presentation: "headless" });
        const output = join(resolve(input.workRoot), "diagnostics");
        await mkdir(output, { recursive: true });
        await copyFile(diagnostics.runtimeLog, join(output, input.mode + "-runtime.jsonl"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not retain installation diagnostics:", error);
      }
    }
    if (input.shell === "terminal" && input.mode === "first") {
      const output = join(resolve(input.workRoot), "diagnostics");
      await mkdir(output, { recursive: true });
      for (const name of ["installed-proof", "runtime-start", "runtime-status", "runtime-stop"]) {
        try { await copyFile(join(resolve(input.workRoot), "first", `${name}.json`), join(output, `${name}.json`)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not retain Terminal diagnostics:", error); }
      }
    }
  }
}

/** Execution products belong to this invocation, never to the workflow's directory layout. */
async function prepareInstallation(input: ExerciseInput) {
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
  const namespace = input.namespace!;
  let installedRoot: string;
  if (input.shell === "electron") {
    const scope = { namespace, channel: policy.channel, productName: required.installIdentity.productName, presentation: "headless" as const };
    await createAcceptanceScope(root, input.publication, scope);
    const appPath = join(root, "installed.app");
    installedRoot = (await installMacElectronApp({ artifact: resolve(input.artifact), appPath })).resources;
  } else if (input.shell === "terminal") {
    installedRoot = join(root, "installed");
  } else throw new Error("Unsupported acceptance Shell");
  return { required, published, policy, root, namespace, installedRoot };
}

async function executeReleaseInstallation(input: ExerciseInput, prepared: PreparedInstallation, candidateRoot?: string) {
  const { required, published, policy, root, namespace, installedRoot } = prepared;
  let hotAcceptanceReceipt: string | undefined;
  if (input.shell === "electron") {
    const appPath = join(root, "installed.app");
    const executableName = required.installIdentity?.executableName;
    if (typeof executableName !== "string") throw new Error("Published executable identity is absent");
    // Enclose platform acquisition plus the product's bounded cold warmup;
    // readiness still requires committed startup and renderer evidence.
    const common = { appPath, executableName, timeoutMs: 600_000 };
    const args = ["--headless", `--namespace=${namespace}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0"];
    if (input.mode === "hot") {
      const head = new URL(published.channelHead.url), base = new URL(policy.target.publicBaseUrl + "/");
      if (head.protocol !== "https:" || head.origin !== base.origin || head.username || head.password
        || !head.pathname.startsWith(base.pathname + policy.channel + "/" + policy.releaseVersion + "/")) throw new Error("Candidate head escapes publication");
      hotAcceptanceReceipt = join(root, "hot.json");
      const baselineStartedAfter = Date.now();
      await withMacElectronProcess({ ...common, args: [...args, `--od-channel-head-url=${head.href}`] },
      async () => {
        // The freshly installed baseline has its own cold materialization;
        // only the subsequent updater interaction belongs to the CDP budget.
        await waitForElectronStartup({ namespace, channel: policy.channel,
          productName: required.installIdentity.productName, presentation: "headless" }, baselineStartedAfter, 420_000);
        if (candidateRoot == null) {
          const first = await readObject(join(resolve(input.workRoot), "first", "execution.json"));
          await checkedFile(first.publication, "first-install publication", input.publication);
          candidateRoot = first.installedRoot;
        }
        await updateAcceptanceSameCarrier({ ...input, installedRoot, candidateRoot: candidateRoot!,
          namespace, receipt: hotAcceptanceReceipt! });
      });
    }
    const startedAfter = Date.now();
    await withMacElectronProcess({ ...common, args }, async () => {
      const result = await inspectElectronStartupThroughCdp({ namespace, channel: policy.channel,
        productName: required.installIdentity.productName, presentation: "headless" }, startedAfter);
      await writeObject(join(root, "startup-cdp.json"), result);
    });
  } else if (input.shell === "terminal") {
    const extracted = join(root, "extracted");
    await mkdir(extracted);
    await execute("/usr/bin/tar", ["-xzf", resolve(input.artifact), "-C", extracted], { timeout: 120_000 });
    const source = join(extracted, "nexu-terminal");
    const installed = await execute("/bin/sh", [join(source, "sh/install.sh"), "--source", source,
      "--root", installedRoot, "--channel", policy.channel, "--namespace", namespace], { timeout: 180_000 });
    await writeObject(join(root, "installed-proof.json"), JSON.parse(installed.stdout));
    const lifecycle = async (operation: string) => execute("/bin/sh", [join(installedRoot, "sh/terminal.sh"),
      "--root", installedRoot, "--store-root", join(root, "store"), "--channel", policy.channel, "--namespace", namespace,
      "--operation", operation, "--result", join(root, `runtime-${operation}.json`),
      ...(operation === "start" ? ["--attachment-id", "public-acceptance"] : [])], { timeout: operation === "start" ? 600_000 : 180_000 });
    try { await lifecycle("start"); await lifecycle("status"); } finally { await lifecycle("stop"); }
  } else throw new Error("Unsupported acceptance Shell");
  await writeObject(join(root, "execution.json"), {
    schemaVersion: 1, operation: "release.installation.exercise", shell: input.shell, target: input.target,
    publication: await describeFile(input.publication), installedRoot, runtimeProofRoot: root,
    namespace, ...(hotAcceptanceReceipt == null ? {} : { hotAcceptanceReceipt }),
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
  let baselineCandidate = false;
  if (input.shell === "electron") {
    if (!input.inspection) throw new Error("Electron collection requires baseline inspection");
    const inspection = await readObject(input.inspection);
    const { policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target });
    if (inspection.schemaVersion !== 1 || inspection.operation !== "electron.baseline.inspect"
      || inspection.target !== input.target || inspection.channel !== policy.channel || inspection.releaseVersion !== policy.releaseVersion
      || typeof inspection.compatible !== "boolean" || typeof inspection.upgradeRequired !== "boolean") throw new Error("Baseline inspection identity mismatch");
    hot = inspection.compatible;
    baselineCandidate = inspection.baselineCandidate === true;
    if (baselineCandidate && (hot || inspection.upgradeRequired)) throw new Error("candidate baseline cannot claim hot acceptance");
    if (inspection.upgradeRequired && !hot) throw new Error(`Baseline upgrade evidence is required: ${inspection.reason}`);
    if (hot && !inspection.upgradeRequired) throw new Error("Hot acceptance requires an older baseline");
  }
  const selected = hot ? await readExecution("hot") : first;
  if (input.shell === "electron") {
    if (hot && (first.namespace === selected.namespace || !first.namespace || !selected.namespace)) throw new Error("First and hot acceptance namespaces must be independent");
    const { required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target });
    const committed = await inspectElectronSelectedCapsule({ namespace: first.namespace, channel: policy.channel,
      productName: required.installIdentity.productName, presentation: "headless" }, first.installedRoot);
    const bound = await inspectElectronBoundCapsule(first.installedRoot);
    if (!canonicalBytes(committed.envelope).equals(canonicalBytes(bound.envelope))) throw new Error("First installation did not commit its bound Capsule");
  }
  await collectReleaseAcceptance({ ...input, installedRoot: selected.installedRoot,
    baselineCandidate,
    runtimeProofRoot: selected.runtimeProofRoot, namespace: selected.namespace,
    ...(hot ? { hotAcceptanceReceipt: selected.hotAcceptanceReceipt,
      firstInstallRoot: first.installedRoot, firstInstallNamespace: first.namespace } : {}) });
  if (input.shell === "electron") {
    const { required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target });
    for (const execution of hot ? [first, selected] : [first]) {
      await removeAcceptanceScope(execution.runtimeProofRoot, input.publication, { namespace: execution.namespace,
        channel: policy.channel, productName: required.installIdentity.productName, presentation: "headless" });
    }
  }
}
