import {
  resolveStandaloneShellCompatibility,
  sha256Hex,
  type StandaloneResourceContribution,
  type StandaloneShellIdentity,
  type StandaloneShellRequirement,
  type StandaloneShellUpdaterPort,
  type StandaloneShellUpdaterSnapshot,
} from "@open-design/standalone";

export const CLOSURE_VERSION = "0.1.0";
export const CLOSURE_FIXTURE_COMPONENT = "closure-fixture";

export function createClosureFixtureContribution(input: {
  artifactUrl: string;
  artifactBytes: Uint8Array;
}): StandaloneResourceContribution {
  const sha256 = sha256Hex(input.artifactBytes);
  return {
    id: CLOSURE_FIXTURE_COMPONENT,
    component: "standalone.resource",
    sync: true,
    blob: {
      mediaType: "text/javascript",
      sha256,
      size: input.artifactBytes.byteLength,
      sources: [{ kind: "remote", url: input.artifactUrl }],
    },
    materialization: { type: "file", entrypoint: "fixture.mjs" },
  };
}

export type ClosureShellUpdatePreparation = Readonly<
  | { state: "compatible" }
  | {
      state: "update-required";
      currentVersion: string;
      minimumVersion: string | null;
      snapshot: StandaloneShellUpdaterSnapshot | null;
    }
>;

/**
 * Closure owns the compatibility decision while the concrete updater remains a
 * Shell handler. Preparing an update may check and download, but never applies
 * an installer or terminates another reference without an explicit action.
 */
export async function prepareClosureShellUpdate(input: Readonly<{
  requirement: StandaloneShellRequirement | null;
  shell: StandaloneShellIdentity;
  updater?: StandaloneShellUpdaterPort | null;
  onSnapshot?: (snapshot: StandaloneShellUpdaterSnapshot) => void | Promise<void>;
}>): Promise<ClosureShellUpdatePreparation> {
  const compatibility = resolveStandaloneShellCompatibility(input);
  if (compatibility.state === "compatible") return compatibility;
  const updater = compatibility.updater;
  if (updater == null || updater.shellType !== input.shell.type) {
    return { state: "update-required", currentVersion: compatibility.currentVersion, minimumVersion: compatibility.minimumVersion, snapshot: null };
  }
  let snapshot = await updater.readSnapshot();
  await input.onSnapshot?.(snapshot);
  if (snapshot.state === "idle" || snapshot.state === "failed") {
    snapshot = (await updater.invoke("check")).snapshot;
    await input.onSnapshot?.(snapshot);
  }
  if (snapshot.state === "available") {
    snapshot = (await updater.invoke("download")).snapshot;
    await input.onSnapshot?.(snapshot);
  }
  return { state: "update-required", currentVersion: compatibility.currentVersion, minimumVersion: compatibility.minimumVersion, snapshot };
}
