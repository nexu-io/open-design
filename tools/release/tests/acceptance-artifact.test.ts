import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fetchAcceptanceArtifact } from "../src/exact/acceptance-artifact.ts";
import { resolveReleasePolicy } from "../src/policy/release-profile.ts";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "acceptance-artifact-")); roots.push(root);
  const policy = resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", channel: "betahyx", releaseVersion: "0.1.0-betahyx.2", sourceCommit: "a".repeat(40),
    profile: "exact-validation", sourceRef: "refs/heads/feat/test", switches: { endUserDistribution: false, stableAuthorized: false },
    target: { endpointUrl: "https://storage.example", bucket: "releases", publicBaseUrl: "https://public.example",
      latestChannelHeadUrl: "https://storage.example/releases/betahyx/latest/channel-head.json" } });
  const required = { shell: { type: "electron" }, target: "darwin-arm64", installIdentity: { executableName: "open-design-betahyx", namespace: "betahyx" },
    artifact: { url: "https://public.example/betahyx/0.1.0-betahyx.1/installer.dmg", size: 9, sha256: createHash("sha256").update("installer").digest("hex") } };
  const published = { schemaVersion: 1, operation: "exact.publish", channel: policy.channel, releaseVersion: policy.releaseVersion, sourceCommit: policy.sourceCommit,
    profile: policy.profile, target: policy.target, requiredAcceptances: [required] };
  const input = { publication: join(root, "publication.json"), policy: join(root, "policy.json"), shell: "electron", target: "darwin-arm64", output: join(root, "downloaded"), receipt: join(root, "required.json"), githubEnv: join(root, "github-env") };
  await writeFile(input.publication, JSON.stringify(published)); await writeFile(input.policy, JSON.stringify(policy));
  const fetch = vi.fn(async () => new Response("installer")); vi.stubGlobal("fetch", fetch);
  return { input, published, required, fetch };
}

it("downloads the published hot baseline exactly and projects identity only after verification", async () => {
  const f = await fixture(), result = await fetchAcceptanceArtifact(f.input);
  expect(await readFile(result.file, "utf8")).toBe("installer");
  expect(JSON.parse(await readFile(f.input.receipt, "utf8"))).toEqual(f.required);
  expect(await readFile(f.input.githubEnv, "utf8")).toBe("ELECTRON_EXECUTABLE=open-design-betahyx\nELECTRON_NAMESPACE=betahyx\n");
  expect(f.fetch.mock.calls[0]).toMatchObject([new URL(f.required.artifact.url), { redirect: "error" }]);
  await expect(fetchAcceptanceArtifact(f.input)).rejects.toThrow("EEXIST");
  expect(await readFile(result.file, "utf8")).toBe("installer");
});

it.each(["tampered!", "too long installer", "short"])("does not expose an invalid artifact (%s) or identity", async body => {
  const f = await fixture(); f.fetch.mockResolvedValueOnce(new Response(body));
  await expect(fetchAcceptanceArtifact(f.input)).rejects.toThrow(/binding mismatch|exceeds published size/u);
  await expect(access(f.input.output)).rejects.toThrow(); await expect(access(f.input.receipt)).rejects.toThrow(); await expect(access(f.input.githubEnv)).rejects.toThrow();
});

it("rejects ambiguous targets, foreign origins and injected identity before network access", async () => {
  const f = await fixture();
  f.published.requiredAcceptances.push(f.required); await writeFile(f.input.publication, JSON.stringify(f.published));
  await expect(fetchAcceptanceArtifact(f.input)).rejects.toThrow("one matching published target");
  f.published.requiredAcceptances.pop(); f.required.artifact.url = "https://public.example/stable/installer.dmg"; await writeFile(f.input.publication, JSON.stringify(f.published));
  await expect(fetchAcceptanceArtifact(f.input)).rejects.toThrow("escapes");
  f.required.artifact.url = "https://public.example/betahyx/installer.dmg"; f.required.installIdentity.namespace = "betahyx\nINJECTED=true";
  await writeFile(f.input.publication, JSON.stringify(f.published)); await expect(fetchAcceptanceArtifact(f.input)).rejects.toThrow("safe installed identity");
  expect(f.fetch).not.toHaveBeenCalled();
});
