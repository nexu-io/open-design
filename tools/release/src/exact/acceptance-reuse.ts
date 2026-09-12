import { dirname, join } from "node:path";
import type { ReleasePolicyReceipt } from "../policy/release-profile.ts";
import { readReleasePolicyReceipt } from "../policy/release-profile.ts";
import { canonicalBytes, checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { openArtifactProduct } from "./artifact-acquisition.ts";

/** Compare authenticated business declarations, not workload identities. This
 * catches undeclared dispatch-input drift (such as standaloneVersion) before
 * activation without inferring a second cache key or silently running tests. */
async function contentDeclarations(publication: string, published: JsonObject) {
  const file = join(dirname(publication), "documents/content-metadata.json");
  const descriptor = published.objects?.find((object: JsonObject) => object.name === "content-metadata.json");
  if (descriptor == null) throw new Error("Published content metadata is missing");
  await checkedFile(descriptor, "Acceptance content", file);
  const { metadata } = await readObject(file);
  return { standaloneVersion: metadata.standaloneVersion, shell: metadata.shell, resources: metadata.resources,
    blobs: Object.fromEntries(Object.entries(metadata.blobs).map(([key, value]) => {
      const { sources: _sources, ...declaration } = value as JsonObject;
      return [key, declaration];
    })) };
}

export async function exportAcceptanceWitness(input: Readonly<{ publication: string; credential: string; output: string }>) {
  const published = await readObject(input.publication), acceptance = await readObject(input.credential);
  if (acceptance.operation !== "exact.acceptance" || acceptance.status !== "accepted") throw new Error("Witness requires actual installed acceptance");
  for (const field of ["channel", "releaseVersion", "sourceCommit"]) {
    if (acceptance[field] !== published[field]) throw new Error("Witness publication mismatch");
  }
  await writeObject(input.output, { schemaVersion: 1, operation: "exact.acceptance.witness", acceptance,
    content: await contentDeclarations(input.publication, published) });
}

/** A plan-projected successful behavioral witness, not a claim that the new
 * version was installed. Identity calculation and cache admission stay in Python. */
export function validateReusedAcceptance(credential: JsonObject, expected: JsonObject, policy: ReleasePolicyReceipt): void {
  if (policy.profile !== "exact-validation" || ["stable", "prerelease"].includes(policy.channel)) {
    throw new Error("Formal release lanes require fresh installed acceptance");
  }
  const origin = credential.origin;
  if (credential.schemaVersion !== 1 || credential.operation !== "exact.acceptance.reuse" || credential.status !== "accepted"
    || credential.installed != null || credential.baselineCandidate != null
    || origin?.schemaVersion !== 1 || origin.operation !== "exact.acceptance" || origin.status !== "accepted"
    || origin.baselineCandidate === true || origin.channel !== policy.channel || origin.target !== expected.target
    || origin.installed == null || origin.installed.target !== expected.target
    || !canonicalBytes(origin.shell).equals(canonicalBytes(expected.shell))
    || !canonicalBytes(origin.installed.shell).equals(canonicalBytes(expected.shell))
    || !canonicalBytes(origin.platformTrust).equals(canonicalBytes(expected.platformTrust))
    || !canonicalBytes(origin.updater).equals(canonicalBytes(expected.updater))
    || !/^[a-f0-9]{64}$/u.test(credential.evidence?.sha256 ?? "")
    || typeof credential.evidence?.url !== "string") throw new Error("Invalid reused installed acceptance");
  for (const field of ["channel", "releaseVersion", "sourceCommit"] as const) {
    if (credential[field] !== policy[field]) throw new Error(`Reused acceptance ${field} mismatch`);
  }
  for (const field of ["shell", "artifact", "shellMetadata", "installIdentity", "platformTrust", "updater", "target"]) {
    if (!canonicalBytes(credential[field]).equals(canonicalBytes(expected[field]))) throw new Error("Reused acceptance publication binding mismatch");
  }
}

/** Complete the acceptance inventory from authenticated historical products.
 * Fresh entries must already exist; this consumer never runs a missing test. */
export async function acquireAcceptanceEvidence(input: Readonly<{
  publication: string; policy: string; sources: string; output: string;
}>) {
  const published = await readObject(input.publication);
  const policy = await readReleasePolicyReceipt(input.policy, { capability: "acceptance",
    channel: published.channel, releaseVersion: published.releaseVersion, sourceCommit: published.sourceCommit });
  const request = await readObject(input.sources), seen = new Set<string>();
  const content = await contentDeclarations(input.publication, published);
  if (!Array.isArray(request.sources) || !Array.isArray(published.requiredAcceptances)) throw new Error("Invalid acceptance inventory");
  for (const source of request.sources) {
    const expected = published.requiredAcceptances.find((item: JsonObject) => item.shell.type === source.shell && item.target === source.target);
    const key = `${source.shell}-${source.target}`;
    if (expected == null || seen.has(key)) throw new Error("Acceptance inventory mismatch");
    seen.add(key);
    const file = join(input.output, `${key}.json`);
    if (source.artifact == null) { await readObject(file); continue; }
    await using product = await openArtifactProduct(source.artifact);
    const witness = await readObject(join(product.archive.root, "evidence", `${key}.json`));
    if (witness.schemaVersion !== 1 || witness.operation !== "exact.acceptance.witness"
      || !canonicalBytes(witness.content).equals(canonicalBytes(content))) throw new Error("Acceptance content declarations changed; fresh validation required");
    const origin = witness.acceptance;
    const credential = { ...expected, schemaVersion: 1, operation: "exact.acceptance.reuse", status: "accepted",
      channel: policy.channel, releaseVersion: policy.releaseVersion, sourceCommit: policy.sourceCommit,
      origin, evidence: source.artifact };
    validateReusedAcceptance(credential, expected, policy);
    await writeObject(file, credential);
  }
  if (seen.size !== published.requiredAcceptances.length) throw new Error("Incomplete acceptance inventory");
}
