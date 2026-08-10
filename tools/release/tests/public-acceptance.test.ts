import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compareCountedReleaseVersions, sha256Digest } from "../src/storage/latest-publication.js";
import {
  issuePublicWindowsAcceptance,
  preparePublicWindowsAcceptance,
  publicAcceptanceInternals,
} from "../src/storage/public-acceptance.js";

const publicOrigin = "https://releases.example";
const releaseVersion = "0.19.0-beta.27";
const closureVersion = "0.19.0-beta.31";
const commit = "0123456789abcdef0123456789abcdef01234567";
const namespace = "release-beta-win";
const temporaryRoots: string[] = [];

function fixture() {
  const installerBytes = Buffer.from("unsigned public NSIS installer");
  const closureBytes = Buffer.from("public Closure archive");
  const installerUrl = `${publicOrigin}/beta/shells/electron/versions/0.19.0-beta.4/win32-x64/Open%20Design.exe`;
  const closureUrl = `${publicOrigin}/beta/closure/win32-x64/versions/${closureVersion}/closure.zip`;
  const platformUrl = `${publicOrigin}/beta/versions/${releaseVersion}.unsigned/platforms/win_x64.json`;
  const metadataUrl = `${publicOrigin}/beta/versions/${releaseVersion}/metadata.json`;
  const closureArtifact = {
    digest: sha256Digest(closureBytes),
    size: closureBytes.byteLength,
    url: closureUrl,
  };
  const platform = {
    artifacts: {
      installer: {
        digest: sha256Digest(installerBytes),
        size: installerBytes.byteLength,
        url: installerUrl,
      },
    },
    channel: "beta",
    closure: {
      assets: { archive: closureArtifact },
      manifest: {
        artifact: closureArtifact,
        identity: {
          channel: "beta",
          digest: closureArtifact.digest,
          platform: "win32-x64",
          protocolVersion: 1,
          version: closureVersion,
        },
      },
    },
    enabled: true,
    github: { commit },
    platformKey: "win_x64",
    r2: {
      versionManifestUrl: platformUrl,
      versionPrefix: `beta/versions/${releaseVersion}.unsigned`,
    },
    releaseVersion,
    status: "published",
  };
  const metadata = {
    github: { commit },
    r2: { versionPrefix: `beta/versions/${releaseVersion}` },
    releaseState: "complete",
    releaseTargets: { win_x64: platform },
    releaseVersion,
  };
  const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
  const platformBytes = Buffer.from(`${JSON.stringify(platform, null, 2)}\n`);
  const responses = new Map<string, Buffer>([
    [metadataUrl, metadataBytes],
    [platformUrl, platformBytes],
    [installerUrl, installerBytes],
  ]);
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const bytes = responses.get(String(input));
    return bytes == null ? new Response(null, { status: 404 }) : new Response(Uint8Array.from(bytes));
  });
  return { closureArtifact, fetchImpl, installerBytes, metadataUrl };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("public Windows release acceptance", () => {
  it("downloads immutable public installer bytes and issues an exact Closure-bound smoke credential", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-public-acceptance-"));
    temporaryRoots.push(root);
    const source = fixture();
    const planPath = join(root, "plan.json");
    const buildJsonPath = join(root, "build.json");
    const plan = await preparePublicWindowsAcceptance({
      buildJsonPath,
      commit,
      downloadDir: join(root, "download"),
      fetchImpl: source.fetchImpl,
      metadataUrl: source.metadataUrl,
      namespace,
      planPath,
      publicOrigin,
      releaseVersion,
    });
    expect(await readFile(plan.installer.path)).toEqual(source.installerBytes);
    expect(JSON.parse(await readFile(buildJsonPath, "utf8"))).toEqual({ installerPath: plan.installer.path });

    const summaryPath = join(root, "summary.json");
    const suiteResultPath = join(root, "suite-result.json");
    await writeFile(summaryPath, `${JSON.stringify({
      closureBinding: {
        committed: {
          releaseVersion,
          standalone: {
            channel: "beta",
            digest: source.closureArtifact.digest,
            generation: 0,
            namespace,
            platform: "win32-x64",
            protocolVersion: 1,
            version: closureVersion,
          },
        },
      },
      plan: { profile: "core", selectedLanes: ["shell"] },
      timings: [{ status: "success", step: "win-shell-lifecycle" }],
    }, null, 2)}\n`);
    await writeFile(suiteResultPath, `${JSON.stringify({ exitCode: 0, status: "success" })}\n`);

    const credentialPath = join(root, "credential.json");
    const credential = await issuePublicWindowsAcceptance({
      credentialPath,
      planPath,
      smokeSummaryPath: summaryPath,
      suiteResultPath,
    });
    expect(credential).toMatchObject({
      closure: {
        digest: source.closureArtifact.digest,
        platform: "win32-x64",
        version: closureVersion,
      },
      commit,
      releaseVersion,
      smoke: { profile: "core", selectedLanes: ["shell"], status: "success" },
      status: "accepted",
      target: "win_x64",
    });
  });

  it("refuses to issue a credential after downloaded installer bytes change", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-public-acceptance-tamper-"));
    temporaryRoots.push(root);
    const source = fixture();
    const planPath = join(root, "plan.json");
    const plan = await preparePublicWindowsAcceptance({
      buildJsonPath: join(root, "build.json"),
      commit,
      downloadDir: join(root, "download"),
      fetchImpl: source.fetchImpl,
      metadataUrl: source.metadataUrl,
      namespace,
      planPath,
      publicOrigin,
      releaseVersion,
    });
    await writeFile(plan.installer.path, "tampered");
    const summaryPath = join(root, "summary.json");
    await writeFile(summaryPath, `${JSON.stringify({
      closureBinding: {
        committed: {
          releaseVersion,
          standalone: {
            channel: "beta",
            digest: source.closureArtifact.digest,
            namespace,
            platform: "win32-x64",
            version: closureVersion,
          },
        },
      },
      plan: { profile: "core", selectedLanes: ["shell"] },
      timings: [{ status: "success", step: "win-shell-lifecycle" }],
    })}\n`);
    const suiteResultPath = join(root, "suite-result.json");
    await writeFile(suiteResultPath, `${JSON.stringify({ exitCode: 0, status: "success" })}\n`);

    await expect(issuePublicWindowsAcceptance({
      credentialPath: join(root, "credential.json"),
      planPath,
      smokeSummaryPath: summaryPath,
      suiteResultPath,
    })).rejects.toThrow(/installer no longer matches public binding/);
  });

  it("rejects mutable latest URLs and prevents counted latest rollback", () => {
    expect(() => publicAcceptanceInternals.assertPublicImmutableUrl(
      `${publicOrigin}/beta/latest/metadata.json`,
      publicOrigin,
      "metadata URL",
    )).toThrow(/immutable version object/);
    expect(compareCountedReleaseVersions("0.19.0-beta.28", "0.19.0-beta.27", "beta")).toBeGreaterThan(0);
    expect(compareCountedReleaseVersions("0.19.0-beta.27", "0.19.0-beta.28", "beta")).toBeLessThan(0);
  });
});
