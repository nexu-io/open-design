import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";

const IDENTIFIER = /^[a-z][a-z0-9-]{0,31}$/u;

function releaseNumber(version: unknown, channel: string): number[] {
  const match = new RegExp(`^(\\d+)\\.(\\d+)\\.(\\d+)-${channel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.(\\d+)$`, "u").exec(String(version ?? ""));
  if (match == null) throw new Error("invalid counted release version");
  return match.slice(1).map(Number);
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

function storage(requestValue: JsonObject): { endpoint: string; bucket: string } {
  const endpoint = String(requestValue.endpointUrl ?? "").replace(/\/$/u, ""), bucket = String(requestValue.bucket ?? "").replace(/^\/+|\/+$/gu, "");
  if (!/^https?:\/\/\S+$/u.test(endpoint) || bucket.length === 0 || bucket.includes("/")) throw new Error("invalid exact release storage endpoint or bucket");
  return { endpoint, bucket };
}

async function publish(input: JsonObject, receiptPath: string): Promise<void> {
  const pack = await readObject(String(input.packReceipt ?? ""));
  if (pack.schemaVersion !== 2 || pack.operation !== "exact.pack") throw new Error("invalid exact pack receipt");
  const channel = String(pack.channel ?? ""), version = String(pack.releaseVersion ?? "");
  if (!IDENTIFIER.test(channel)) throw new Error("invalid release channel");
  releaseNumber(version, channel);
  const { endpoint, bucket } = storage(input), prefix = `${endpoint}/${bucket}/${channel}/${version}`;
  const objects: JsonObject[] = [], names = new Set<string>();
  let allReplayed = true;
  for (const kind of ["artifacts", "documents"] as const) {
    for (const value of pack[kind] as JsonObject[]) {
      const path = await checkedFile(value, kind.slice(0, -1));
      const name = basename(path);
      if (names.has(name)) throw new Error(`duplicate exact object name: ${name}`);
      names.add(name);
      const body = await readFile(path), url = `${prefix}/${name}`;
      const contentType = kind === "artifacts" ? String(value.mediaType ?? "application/octet-stream") : "application/json; charset=utf-8";
      const uploaded = await putImmutable(url, body, contentType); allReplayed &&= uploaded.replayed;
      if (kind === "documents") {
        const readback = await request(url);
        if (!readback.ok || !Buffer.from(await readback.arrayBuffer()).equals(body)) throw new Error(`exact document readback failed: ${url}`);
      }
      objects.push({ kind: kind.slice(0, -1), name, url, etag: uploaded.etag, sha256: value.sha256, size: value.size });
    }
  }
  const publicByName = new Map(objects.map((value) => [value.name, value]));
  const requiredAcceptances = (pack.requiredAcceptances as JsonObject[]).map((acceptance) => {
    const artifact = publicByName.get(basename(String(acceptance.artifact.url))), shellMetadata = publicByName.get(basename(String(acceptance.shellMetadata.url)));
    if (artifact == null || shellMetadata == null) throw new Error("required acceptance is not backed by published objects");
    return { ...acceptance, artifact: { ...acceptance.artifact, url: artifact.url }, shellMetadata: { ...acceptance.shellMetadata, url: shellMetadata.url } };
  });
  const headPath = await checkedFile((pack.documents as JsonObject[]).find((value) => resolve(String(value.file)) === resolve(String(pack.channelHeadFile)))!, "channel head");
  const head = objects.find((value) => value.name === basename(headPath))!;
  await writeObject(receiptPath, { schemaVersion: 1, operation: "exact.publish", channel, releaseVersion: version, sourceCommit: pack.sourceCommit, latestChannelHeadUrl: `${endpoint}/${bucket}/${channel}/latest/channel-head.json`, channelHead: { ...head, file: headPath }, objects, requiredAcceptances, replayed: allReplayed });
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
    for (const field of ["shell", "artifact", "shellMetadata"]) if (JSON.stringify(credential[field]) !== JSON.stringify(expected[field])) throw new Error("acceptance artifact or Shell binding mismatch");
    if (credential.installed == null || JSON.stringify(credential.installed.shell) !== JSON.stringify(expected.shell) || credential.installed.target !== expected.target) throw new Error("acceptance lacks installed Shell proof");
  }
}

async function activate(input: JsonObject, receiptPath: string): Promise<void> {
  const published = await readObject(String(input.publishReceipt ?? ""));
  if (published.schemaVersion !== 1 || published.operation !== "exact.publish") throw new Error("invalid exact.publish receipt");
  await validateAcceptances(published, input.acceptanceCredentials);
  const headPath = await checkedFile(published.channelHead, "published channel head"), headBody = await readFile(headPath);
  const incomingHead = JSON.parse(headBody.toString()).head as JsonObject, channel = String(published.channel), latestUrl = String(published.latestChannelHeadUrl);
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
  await writeObject(receiptPath, { schemaVersion: 1, operation: "exact.activate", channel, releaseVersion: published.releaseVersion, sourceCommit: published.sourceCommit, latestChannelHeadUrl: latestUrl, latestChannelHeadEtag: latestEtag, replayed });
}

export async function executeExactReleaseControl(requestValue: JsonObject, receiptPath: string): Promise<void> {
  if (requestValue.schemaVersion !== 1) throw new Error("unsupported exact release request schema");
  if (requestValue.operation === "exact.publish") return await publish(requestValue, receiptPath);
  if (requestValue.operation === "exact.activate") return await activate(requestValue, receiptPath);
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
