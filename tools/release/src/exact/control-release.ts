import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { exactStorageObject, isReleaseChannel } from "@open-design/release";
import { storageConfigFromEnv } from "../storage/common.ts";
import { requestStorageObject } from "../storage/s3-upload.ts";

import { canonicalBytes, checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { createAcceptedShellBaselineReceipt, resolveAcceptedShellBaseline, type AcceptedShellTarget } from "./accepted-baseline.ts";
import { fetchAcceptedShellBaseline } from "./baseline-acquisition.ts";
import { bindReleaseValidation } from "./validation.ts";
import { collectInstalledAcceptance, readPublishedAcceptance } from "./installed-acceptance.ts";
import { authorizeReleaseCapability, readReleasePolicyReceipt, releaseTargetsEqual, type ReleasePolicyReceipt, type ReleaseTarget } from "../policy/release-profile.ts";
import { requiresFormalMacTrust } from "../policy/native-trust.ts";

function releaseComponent(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== value) {
    throw new Error("release version component exceeds the safe canonical integer boundary");
  }
  return parsed;
}

function releaseNumber(version: unknown, channel: string): number[] {
  if (channel === "stable") {
    const stable = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(version ?? ""));
    if (stable == null) throw new Error("invalid stable release version");
    return [...stable.slice(1).map(releaseComponent), 0];
  }
  const match = new RegExp(`^(\\d+)\\.(\\d+)\\.(\\d+)-${channel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.(\\d+)$`, "u").exec(String(version ?? ""));
  if (match == null) throw new Error("invalid counted release version");
  return match.slice(1).map(releaseComponent);
}

function compareVersion(left: unknown, right: unknown, channel: string): number {
  const a = releaseNumber(left, channel), b = releaseNumber(right, channel);
  for (let index = 0; index < 4; index += 1) if (a[index] !== b[index]) return a[index]! - b[index]!;
  return 0;
}

export function validateExactLaneTransition(current: JsonObject, incoming: JsonObject, channel: string): void {
  const removed = Object.keys(current).filter((lane) => incoming[lane] == null);
  if (removed.length > 0) throw new Error(`channel head would remove lanes: ${removed.sort().join(", ")}`);
  let advanced = Object.keys(incoming).some((lane) => current[lane] == null);
  for (const lane of Object.keys(current).sort()) {
    const comparison = compareVersion(incoming[lane]?.releaseVersion, current[lane]?.releaseVersion, channel);
    if (comparison < 0) throw new Error(`${lane} lane would move backward`);
    advanced ||= comparison > 0;
  }
  if (!advanced) throw new Error("channel head CAS would not advance or add any lane");
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  if (process.env.RELEASE_STORAGE_ACCESS_KEY_ID || process.env.RELEASE_STORAGE_SECRET_ACCESS_KEY) {
    const config = storageConfigFromEnv();
    const prefix = `${config.endpointUrl.replace(/\/$/u, "")}/${encodeURIComponent(config.bucket)}/`;
    if (!url.startsWith(prefix)) throw new Error("exact storage request differs from configured R2 target");
    const method = init.method ?? "GET";
    if ((method !== "GET" && method !== "PUT") || (init.body != null && !(init.body instanceof Uint8Array))) {
      throw new Error("unsupported exact storage request");
    }
    return requestStorageObject(config, decodeURIComponent(url.slice(prefix.length)), {
      method, headers: init.headers, ...(init.body == null ? {} : { body: init.body as Uint8Array }),
    });
  }
  const headers = new Headers(init.headers);
  const token = process.env.OD_EXACT_RELEASE_TOKEN;
  if (token != null && token.length > 0) headers.set("Authorization", `Bearer ${token}`);
  return await fetch(url, { ...init, headers });
}

async function putImmutable(url: string, body: Buffer, contentType: string): Promise<{ etag: string; replayed: boolean }> {
  const response = await request(url, { method: "PUT", body: new Uint8Array(body), headers: { "If-None-Match": "*", "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" } });
  if (response.status === 412) {
    const current = await request(url);
    if (!current.ok || !Buffer.from(await current.arrayBuffer()).equals(body)) throw new Error(`immutable object collision: ${url}`);
    return { etag: current.headers.get("etag") ?? "", replayed: true };
  }
  if (response.status !== 200 && response.status !== 201) throw new Error(`immutable upload failed (${response.status}): ${url}`);
  return { etag: response.headers.get("etag") ?? "", replayed: false };
}

function storage(requestValue: JsonObject, channel: string): ReleaseTarget {
  const endpointUrl = String(requestValue.endpointUrl ?? "");
  const bucket = String(requestValue.bucket ?? "");
  const publicBaseUrl = String(requestValue.publicBaseUrl ?? "");
  return {
    endpointUrl,
    bucket,
    latestChannelHeadUrl: `${endpointUrl}/${bucket}/${exactStorageObject({ channel, kind: "channel-head" }).key}`,
    publicBaseUrl,
  };
}

function publicObjectName(value: unknown): string {
  try { return decodeURIComponent(basename(new URL(String(value)).pathname)); }
  catch { throw new Error("published object URL is invalid"); }
}

export function validateReleaseArtifactTrust(policy: ReleasePolicyReceipt, acceptances: readonly JsonObject[]): void {
  for (const acceptance of acceptances) {
    if (acceptance.shell?.type !== "electron" || !String(acceptance.target ?? "").startsWith("darwin-")) continue;
    const trust = acceptance.platformTrust;
    if (trust?.platform !== "macos" || !["formal", "verify-only"].includes(String(trust.mode))) {
      throw new Error("Electron macOS release acceptance lacks platform trust");
    }
    if (requiresFormalMacTrust(policy) && trust.mode !== "formal") {
      throw new Error(`${policy.profile} requires formal Electron macOS trust`);
    }
    if (trust.mode === "formal" && (!/^[A-Z0-9]{10}$/u.test(String(trust.teamIdentifier ?? ""))
      || typeof trust.designatedRequirement !== "string" || trust.designatedRequirement.length === 0)) {
      throw new Error("formal Electron macOS trust identity is invalid");
    }
  }
}

export async function publishExactRelease(input: JsonObject, receiptPath: string): Promise<void> {
  const pack = await readObject(String(input.packReceipt ?? ""));
  if (pack.schemaVersion !== 2 || pack.operation !== "exact.pack") throw new Error("invalid exact pack receipt");
  const channel = String(pack.channel ?? ""), version = String(pack.releaseVersion ?? "");
  if (!isReleaseChannel(channel)) throw new Error("invalid release channel");
  releaseNumber(version, channel);
  const target = storage(input, channel);
  const policy = await readReleasePolicyReceipt(input.policyReceipt, {
    capability: "publish",
    channel,
    releaseVersion: version,
    sourceCommit: String(pack.sourceCommit ?? ""),
    target,
  });
  validateReleaseArtifactTrust(policy, pack.requiredAcceptances as JsonObject[]);
  const storagePrefix = `${policy.target.endpointUrl}/${policy.target.bucket}/${channel}/${version}`;
  const publicPrefix = `${policy.target.publicBaseUrl}/${channel}/${version}`;
  const objects: JsonObject[] = [], names = new Set<string>();
  let allReplayed = true;
  for (const kind of ["artifacts", "documents"] as const) {
    for (const value of pack[kind] as JsonObject[]) {
      const path = await checkedFile(value, kind.slice(0, -1));
      const name = basename(path);
      if (names.has(name)) throw new Error(`duplicate exact object name: ${name}`);
      names.add(name);
      const encodedName = encodeURIComponent(name);
      const body = await readFile(path), storageUrl = `${storagePrefix}/${encodedName}`, publicUrl = `${publicPrefix}/${encodedName}`;
      const contentType = kind === "artifacts" ? String(value.mediaType ?? "application/octet-stream") : "application/json; charset=utf-8";
      const uploaded = await putImmutable(storageUrl, body, contentType); allReplayed &&= uploaded.replayed;
      if (kind === "documents") {
        const readback = await request(storageUrl);
        if (!readback.ok || !Buffer.from(await readback.arrayBuffer()).equals(body)) throw new Error(`exact document readback failed: ${storageUrl}`);
      }
      objects.push({ kind: kind.slice(0, -1), name, url: publicUrl, etag: uploaded.etag, sha256: value.sha256, size: value.size });
    }
  }
  const publicByName = new Map(objects.map((value) => [value.name, value]));
  const requiredAcceptances = (pack.requiredAcceptances as JsonObject[]).map((acceptance) => {
    const artifact = publicByName.get(publicObjectName(acceptance.artifact.url)), shellMetadata = publicByName.get(publicObjectName(acceptance.shellMetadata.url));
    if (artifact == null || shellMetadata == null) throw new Error("required acceptance is not backed by published objects");
    return { ...acceptance, artifact: { ...acceptance.artifact, url: artifact.url }, shellMetadata: { ...acceptance.shellMetadata, url: shellMetadata.url } };
  });
  const headPath = await checkedFile((pack.documents as JsonObject[]).find((value) => resolve(String(value.file)) === resolve(String(pack.channelHeadFile)))!, "channel head");
  const head = objects.find((value) => value.name === basename(headPath))!;
  await writeObject(receiptPath, { schemaVersion: 1, operation: "exact.publish", profile: policy.profile, channel, releaseVersion: version, sourceCommit: pack.sourceCommit, target: policy.target, latestChannelHeadUrl: policy.target.latestChannelHeadUrl, channelHead: { ...head, file: headPath }, objects, requiredAcceptances, replayed: allReplayed });
}

async function validateAcceptances(published: JsonObject, paths: unknown): Promise<void> {
  if (!Array.isArray(paths)) throw new Error("exact.activate requires acceptanceCredentials");
  const credentials = await Promise.all(paths.map((path) => readObject(String(path))));
  const byKey = new Map<string, JsonObject>();
  for (const credential of credentials) {
    const key = `${credential.shell?.type}/${credential.target}`;
    if (credential.schemaVersion !== 1 || credential.operation !== "exact.acceptance" || credential.status !== "accepted" || byKey.has(key)) throw new Error(`invalid or duplicate acceptance credential: ${key}`);
    byKey.set(key, credential);
  }
  const required = new Map((published.requiredAcceptances as JsonObject[]).map((value) => [`${value.shell.type}/${value.target}`, value]));
  if (byKey.size !== required.size || [...required.keys()].some((key) => !byKey.has(key))) throw new Error(`acceptance topology mismatch: required=${[...required.keys()].sort()} actual=${[...byKey.keys()].sort()}`);
  for (const [key, expected] of required) {
    const credential = byKey.get(key)!;
    for (const field of ["channel", "releaseVersion", "sourceCommit"]) if (credential[field] !== published[field]) throw new Error(`acceptance ${field} binding mismatch`);
    for (const field of ["shell", "artifact", "shellMetadata", "installIdentity", "platformTrust", "updater"]) if (!canonicalBytes(credential[field]).equals(canonicalBytes(expected[field]))) throw new Error("acceptance artifact or Shell binding mismatch");
    if (credential.installed == null || !canonicalBytes(credential.installed.shell).equals(canonicalBytes(expected.shell)) || credential.installed.target !== expected.target) throw new Error("acceptance lacks installed Shell proof");
  }
}

async function validatedElectronAcceptance(published: JsonObject, path: unknown): Promise<JsonObject> {
  const credential = await readObject(String(path ?? ""));
  const key = `${credential.shell?.type}/${credential.target}`;
  const expected = (published.requiredAcceptances as JsonObject[]).find((value) => `${value.shell?.type}/${value.target}` === key);
  if (credential.schemaVersion !== 1 || credential.operation !== "exact.acceptance" || credential.status !== "accepted"
    || credential.shell?.type !== "electron" || expected == null) throw new Error("invalid Electron acceptance credential");
  for (const field of ["channel", "releaseVersion", "sourceCommit"]) if (credential[field] !== published[field]) throw new Error(`acceptance ${field} binding mismatch`);
  for (const field of ["shell", "artifact", "shellMetadata", "installIdentity", "platformTrust", "updater"]) {
    if (!canonicalBytes(credential[field]).equals(canonicalBytes(expected[field]))) throw new Error("acceptance artifact or Shell binding mismatch");
  }
  if (credential.installed == null || !canonicalBytes(credential.installed.shell).equals(canonicalBytes(expected.shell))
    || credential.installed.target !== expected.target) throw new Error("acceptance lacks installed Shell proof");
  return credential;
}

export async function inspectAcceptedElectronBaseline(input: Readonly<{
  publication: string; policy: string; target: string; receipt: string; githubEnv?: string;
}>) {
  if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(input.target)) throw new Error("unsupported baseline target");
  const { required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: "electron", target: input.target });
  const acquired = await fetchAcceptedShellBaseline({ channel: policy.channel, target: input.target as AcceptedShellTarget,
    pointerUrl: `${policy.target.publicBaseUrl}/${policy.channel}/accepted/electron/${input.target}/latest.json` });
  const resolved = resolveAcceptedShellBaseline({ channel: policy.channel, target: input.target as AcceptedShellTarget, acceptedReceipt: acquired });
  const compatible = resolved.mode === "accepted" && resolved.baseline.shell.buildHash === required.shell.buildHash
    && resolved.baseline.shell.version === required.shell.version
    && compareVersion(policy.releaseVersion, resolved.acceptance.releaseVersion, policy.channel) > 0;
  const baselineReceipt = compatible ? join(dirname(resolve(input.receipt)), "accepted-baseline.json") : undefined;
  if (baselineReceipt != null) await writeObject(baselineReceipt, JSON.parse(Buffer.from(acquired!.bytes).toString("utf8")));
  const receipt = { schemaVersion: 1, operation: "electron.baseline.inspect", compatible,
    channel: policy.channel, releaseVersion: policy.releaseVersion, target: input.target,
    ...(baselineReceipt == null ? {} : { baselineReceipt }) };
  await writeObject(input.receipt, receipt);
  if (input.githubEnv != null) await appendFile(input.githubEnv, `ELECTRON_ACCEPTANCE_MODE=${compatible ? "hot" : "full"}\n`);
  return receipt;
}

export async function fetchAcceptedElectronBaseline(input: JsonObject, receiptPath: string): Promise<void> {
  const channel = String(input.channel ?? ""), releaseVersion = String(input.releaseVersion ?? ""), sourceCommit = String(input.sourceCommit ?? "");
  const policy = await readReleasePolicyReceipt(input.policyReceipt, { capability: "reuse", channel, releaseVersion, sourceCommit });
  const snapshot = await readObject(String(input.baselineReceipt ?? ""));
  const reconstructed = createAcceptedShellBaselineReceipt(snapshot.acceptance);
  if (!canonicalBytes(reconstructed).equals(canonicalBytes(snapshot)) || reconstructed.channel !== channel || reconstructed.target !== input.target) {
    throw new Error("exact accepted Electron baseline binding mismatch");
  }
  const published = await readObject(String(input.publishReceipt ?? ""));
  if (published.schemaVersion !== 1 || published.operation !== "exact.publish" || published.channel !== channel
    || published.releaseVersion !== releaseVersion || published.sourceCommit !== sourceCommit) throw new Error("baseline publication binding mismatch");
  const { required: current } = await readPublishedAcceptance({ publishReceipt: String(input.publishReceipt),
    policyReceipt: String(input.policyReceipt), shellType: "electron", target: String(input.target) });
  const credential = reconstructed.acceptance as JsonObject;
  if (current == null || current.shell.version !== credential.shell.version || current.shell.buildHash !== credential.shell.buildHash
    || compareVersion(releaseVersion, credential.releaseVersion, channel) <= 0) throw new Error("accepted baseline carrier differs from the published carrier");
  if (typeof input.validationReceipt !== "string") throw new Error("accepted carrier reuse requires current Shell test validation");
  const validation = await readObject(input.validationReceipt);
  if (validation.operation === "exact.validation.binding") {
    if (validation.schemaVersion !== 1 || validation.sourceCommit !== sourceCommit
      || validation.node !== "electron.shell.test" || validation.target !== input.target) {
      throw new Error("accepted carrier Shell test validation binding mismatch");
    }
    bindReleaseValidation(validation.execution, { node: "electron.shell.test", target: input.target, sourceCommit });
  } else if (validation.schemaVersion !== 1 || validation.operation !== "exact.validation" || validation.status !== "passed"
    || validation.node !== "electron.shell.test" || validation.sourceCommit !== sourceCommit
    || validation.target !== input.target || validation.executionPlatform !== input.target) {
    throw new Error("accepted carrier Shell test validation binding mismatch");
  }
  const artifact = credential.artifact;
  if (artifact == null || typeof artifact.url !== "string" || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(artifact.sha256)
    || !Number.isSafeInteger(artifact.size) || artifact.size < 0 || typeof artifact.mediaType !== "string") {
    throw new Error("exact accepted Electron contribution artifact is invalid");
  }
  const artifactUrl = new URL(artifact.url);
  const publicBase = new URL(`${policy.target.publicBaseUrl}/`);
  if (artifactUrl.protocol !== publicBase.protocol || artifactUrl.origin !== publicBase.origin
    || !artifactUrl.pathname.startsWith(`${publicBase.pathname}${channel}/`)) throw new Error("exact accepted Electron artifact escapes the release public origin");
  const response = await fetch(artifactUrl, { redirect: "error" });
  if (!response.ok || response.url !== artifactUrl.href) throw new Error("exact accepted Electron artifact acquisition failed");
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength !== artifact.size || createHash("sha256").update(body).digest("hex") !== artifact.sha256) {
    throw new Error("exact accepted Electron artifact binding mismatch");
  }
  const output = resolve(String(input.outputDirectory ?? ""));
  await mkdir(output, { recursive: true });
  const archiveFile = join(output, input.target.startsWith("darwin-") ? "baseline-shell-artifact.dmg" : "baseline-shell-artifact.exe");
  await writeFile(archiveFile, body);
  await writeObject(receiptPath, {
    schemaVersion: 1,
    operation: "electron.baseline.fetch",
    shell: credential.shell,
    target: credential.target,
    installIdentity: credential.installIdentity,
    platformTrust: credential.platformTrust,
    artifact: { file: archiveFile, sha256: artifact.sha256, size: artifact.size, mediaType: artifact.mediaType },
    updater: credential.updater,
  });
}

export async function activateExactRelease(input: JsonObject, receiptPath: string): Promise<void> {
  const published = await readObject(String(input.publishReceipt ?? ""));
  if (published.schemaVersion !== 1 || published.operation !== "exact.publish") throw new Error("invalid exact.publish receipt");
  const policy = await readReleasePolicyReceipt(input.policyReceipt, {
    capability: "activate",
    channel: String(published.channel ?? ""),
    releaseVersion: String(published.releaseVersion ?? ""),
    sourceCommit: String(published.sourceCommit ?? ""),
  });
  if (published.profile !== policy.profile) throw new Error("published release profile binding mismatch");
  if (!releaseTargetsEqual(published.target, policy.target)
    || published.latestChannelHeadUrl !== policy.target.latestChannelHeadUrl) {
    throw new Error("published release target binding mismatch");
  }
  await validateAcceptances(published, input.acceptanceCredentials);
  const headPath = await checkedFile(published.channelHead, "published channel head", input.channelHeadFile), headBody = await readFile(headPath);
  const incomingHead = JSON.parse(headBody.toString()).head as JsonObject, channel = String(published.channel);
  const latestUrl = policy.target.latestChannelHeadUrl;
  const current = await request(latestUrl);
  let replayed = false, latestEtag = "";
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" };
  if (current.status === 404) headers["If-None-Match"] = "*";
  else if (current.ok) {
    const currentBody = Buffer.from(await current.arrayBuffer());
    if (currentBody.equals(headBody)) { replayed = true; latestEtag = current.headers.get("etag") ?? ""; }
    else {
      const currentHead = JSON.parse(currentBody.toString()).head as JsonObject;
      validateExactLaneTransition(currentHead.lanes ?? {}, incomingHead.lanes ?? {}, channel);
      const etag = current.headers.get("etag"); if (etag == null || etag.length === 0) throw new Error("latest channel head lacks an ETag for CAS");
      headers["If-Match"] = etag;
    }
  } else throw new Error(`latest inspection failed (${current.status})`);
  if (!replayed) {
    const promoted = await request(latestUrl, { method: "PUT", body: new Uint8Array(headBody), headers });
    if (promoted.status !== 200 && promoted.status !== 201) throw new Error(`latest CAS failed (${promoted.status})`);
    latestEtag = promoted.headers.get("etag") ?? "";
  }
  await writeObject(receiptPath, { schemaVersion: 1, operation: "exact.activate", profile: policy.profile, channel, releaseVersion: published.releaseVersion, sourceCommit: published.sourceCommit, latestChannelHeadUrl: latestUrl, latestChannelHeadEtag: latestEtag, replayed });
}

export async function promoteAcceptedElectronBaseline(input: JsonObject, receiptPath: string): Promise<void> {
  const published = await readObject(String(input.publishReceipt ?? ""));
  const activation = await readObject(String(input.activationReceipt ?? ""));
  if (published.schemaVersion !== 1 || published.operation !== "exact.publish"
    || activation.schemaVersion !== 1 || activation.operation !== "exact.activate") throw new Error("invalid exact baseline promotion authority");
  const channel = String(published.channel ?? ""), releaseVersion = String(published.releaseVersion ?? ""), sourceCommit = String(published.sourceCommit ?? "");
  const policy = await readReleasePolicyReceipt(input.policyReceipt, { capability: "promote", channel, releaseVersion, sourceCommit });
  if (published.profile !== policy.profile || !releaseTargetsEqual(published.target, policy.target)
    || published.latestChannelHeadUrl !== policy.target.latestChannelHeadUrl) throw new Error("accepted baseline published target binding mismatch");
  for (const field of ["profile", "channel", "releaseVersion", "sourceCommit"] as const) {
    if (activation[field] !== published[field]) throw new Error(`accepted baseline activation ${field} binding mismatch`);
  }
  if (activation.latestChannelHeadUrl !== policy.target.latestChannelHeadUrl) throw new Error("accepted baseline activation target binding mismatch");
  const channelHeadPath = await checkedFile(published.channelHead, "accepted baseline channel head", input.channelHeadFile), channelHeadBody = await readFile(channelHeadPath);
  const activeHead = await request(policy.target.latestChannelHeadUrl);
  if (!activeHead.ok || !Buffer.from(await activeHead.arrayBuffer()).equals(channelHeadBody)) throw new Error("accepted baseline requires the exact active channel head");

  const credential = await validatedElectronAcceptance(published, input.acceptanceCredential);
  const target = credential.target;
  if (target !== "darwin-arm64" && target !== "darwin-x64" && target !== "win32-x64") throw new Error("accepted baseline target is unsupported");
  const snapshot = createAcceptedShellBaselineReceipt(credential);
  const snapshotBody = canonicalBytes(snapshot), snapshotDigest = createHash("sha256").update(snapshotBody).digest("hex");
  const storageBase = `${policy.target.endpointUrl}/${policy.target.bucket}`;
  const publicBase = policy.target.publicBaseUrl;
  const snapshotKey = exactStorageObject({ channel, releaseVersion, target, digest: snapshotDigest, kind: "accepted" }).key;
  const snapshotStorageUrl = `${storageBase}/${snapshotKey}`;
  const snapshotUrl = `${publicBase}/${snapshotKey}`;
  const immutable = await putImmutable(snapshotStorageUrl, snapshotBody, "application/json; charset=utf-8");
  const immutableReadback = await request(snapshotStorageUrl);
  if (!immutableReadback.ok || !Buffer.from(await immutableReadback.arrayBuffer()).equals(snapshotBody)) throw new Error("accepted baseline immutable readback failed");
  const pointer = {
    schemaVersion: 1,
    operation: "electron.shell-baseline.latest",
    channel,
    releaseVersion,
    sourceCommit,
    target,
    receipt: { url: snapshotUrl, sha256: `sha256:${snapshotDigest}`, size: snapshotBody.byteLength },
  };
  const pointerKey = exactStorageObject({ channel, target, kind: "accepted-head" }).key;
  const pointerBody = canonicalBytes(pointer), pointerStorageUrl = `${storageBase}/${pointerKey}`, pointerUrl = `${publicBase}/${pointerKey}`;
  const current = await request(pointerStorageUrl);
  let replayed = false, pointerEtag = "";
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" };
  if (current.status === 404) headers["If-None-Match"] = "*";
  else if (current.ok) {
    const currentBody = Buffer.from(await current.arrayBuffer());
    if (currentBody.equals(pointerBody)) { replayed = true; pointerEtag = current.headers.get("etag") ?? ""; }
    else {
      const currentPointer = JSON.parse(currentBody.toString()) as JsonObject;
      if (currentPointer.schemaVersion !== 1 || currentPointer.operation !== "electron.shell-baseline.latest"
        || currentPointer.channel !== channel || currentPointer.target !== target) throw new Error("accepted baseline pointer scope is invalid");
      if (compareVersion(releaseVersion, currentPointer.releaseVersion, channel) <= 0) throw new Error("accepted baseline pointer would not advance");
      const etag = current.headers.get("etag");
      if (etag == null || etag.length === 0) throw new Error("accepted baseline pointer lacks an ETag for CAS");
      headers["If-Match"] = etag;
    }
  } else throw new Error(`accepted baseline pointer inspection failed (${current.status})`);
  if (!replayed) {
    const promoted = await request(pointerStorageUrl, { method: "PUT", body: new Uint8Array(pointerBody), headers });
    if (promoted.status !== 200 && promoted.status !== 201) throw new Error(`accepted baseline pointer CAS failed (${promoted.status})`);
    pointerEtag = promoted.headers.get("etag") ?? "";
  }
  const pointerReadback = await request(pointerStorageUrl);
  if (!pointerReadback.ok || !Buffer.from(await pointerReadback.arrayBuffer()).equals(pointerBody)) throw new Error("accepted baseline pointer readback failed");
  await writeObject(receiptPath, {
    schemaVersion: 1,
    operation: "exact.baseline.promote",
    profile: policy.profile,
    channel,
    releaseVersion,
    sourceCommit,
    target,
    baselineIdentity: snapshot.baselineIdentity,
    snapshot: { url: snapshotUrl, sha256: `sha256:${snapshotDigest}`, size: snapshotBody.byteLength, etag: immutable.etag, replayed: immutable.replayed },
    pointer: { url: pointerUrl, etag: pointerEtag, replayed },
  });
}

export async function acceptInstalledRelease(input: JsonObject, receiptPath: string): Promise<void> {
  const { credential, policy } = await collectInstalledAcceptance(input);
  validateReleaseArtifactTrust(policy, [credential]);
  await writeObject(receiptPath, credential);
}

export async function executeExactReleaseControl(requestValue: JsonObject, receiptPath: string): Promise<void> {
  if (requestValue.operation === "release.authorize") {
    await writeObject(receiptPath, await authorizeReleaseCapability(requestValue));
    return;
  }
  if (requestValue.schemaVersion !== 1) throw new Error("unsupported exact release request schema");
  if (requestValue.operation === "exact.acceptance") return acceptInstalledRelease(requestValue, receiptPath);
  if (requestValue.operation === "exact.publish") return await publishExactRelease(requestValue, receiptPath);
  if (requestValue.operation === "exact.activate") return await activateExactRelease(requestValue, receiptPath);
  if (requestValue.operation === "exact.baseline.promote") return await promoteAcceptedElectronBaseline(requestValue, receiptPath);
  if (requestValue.operation === "exact.baseline.fetch") return await fetchAcceptedElectronBaseline(requestValue, receiptPath);
  throw new Error("unsupported exact release operation");
}

export function selfCheckExactReleaseControl(): void {
  const channel = "check";
  validateExactLaneTransition({ content: { releaseVersion: "0.1.0-check.1" } }, { content: { releaseVersion: "0.1.0-check.2" } }, channel);
  try {
    validateExactLaneTransition({ content: { releaseVersion: "0.1.0-check.2" } }, { content: { releaseVersion: "0.1.0-check.1" } }, channel);
  } catch { return; }
  throw new Error("exact release transition self-check failed");
}
