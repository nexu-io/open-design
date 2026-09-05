import { createHash } from "node:crypto";

import type { ExactTarget } from "./plan.js";

type AcquisitionResponse = Readonly<{
  bytes: Uint8Array;
  status: number;
  url: string;
}>;

export type AcceptedBaselineFetcher = (url: string) => Promise<AcquisitionResponse>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields are invalid`);
}

export async function fetchAcceptedShellBaseline(input: Readonly<{
  channel: string;
  fetcher?: AcceptedBaselineFetcher;
  pointerUrl: string;
  target: ExactTarget;
}>): Promise<Readonly<{ bytes: Uint8Array; sha256: `sha256:${string}` }> | undefined> {
  const pointerUrl = new URL(input.pointerUrl);
  if (pointerUrl.protocol !== "https:" && pointerUrl.hostname !== "localhost" && pointerUrl.hostname !== "127.0.0.1") {
    throw new Error("accepted Shell baseline pointer must use HTTPS");
  }
  const fetcher = input.fetcher ?? (async (url) => {
    const response = await fetch(url, { redirect: "error" });
    return { bytes: new Uint8Array(await response.arrayBuffer()), status: response.status, url: response.url };
  });
  const pointerResponse = await fetcher(pointerUrl.href);
  if (pointerResponse.status === 404) return undefined;
  if (pointerResponse.status !== 200 || pointerResponse.url !== pointerUrl.href) throw new Error("accepted Shell baseline pointer acquisition failed");
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(pointerResponse.bytes).toString("utf8"));
  } catch {
    throw new Error("accepted Shell baseline pointer JSON is invalid");
  }
  const pointer = record(decoded, "accepted Shell baseline pointer");
  exactKeys(pointer, ["channel", "operation", "receipt", "schemaVersion", "target"], "accepted Shell baseline pointer");
  const receipt = record(pointer.receipt, "accepted Shell baseline pointer receipt");
  exactKeys(receipt, ["sha256", "size", "url"], "accepted Shell baseline pointer receipt");
  if (pointer.schemaVersion !== 1 || pointer.operation !== "electron.shell-baseline.latest"
      || pointer.channel !== input.channel || pointer.target !== input.target) throw new Error("accepted Shell baseline pointer scope is invalid");
  if (typeof receipt.url !== "string" || typeof receipt.sha256 !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(receipt.sha256)
      || !Number.isSafeInteger(receipt.size) || (receipt.size as number) < 0) throw new Error("accepted Shell baseline pointer receipt is invalid");
  const receiptUrl = new URL(receipt.url);
  if (receiptUrl.origin !== pointerUrl.origin || receiptUrl.protocol !== pointerUrl.protocol) {
    throw new Error("accepted Shell baseline receipt escapes its trusted origin");
  }
  const receiptResponse = await fetcher(receiptUrl.href);
  if (receiptResponse.status !== 200 || receiptResponse.url !== receiptUrl.href) throw new Error("accepted Shell baseline receipt acquisition failed");
  if (receiptResponse.bytes.byteLength !== receipt.size
      || `sha256:${createHash("sha256").update(receiptResponse.bytes).digest("hex")}` !== receipt.sha256) {
    throw new Error("accepted Shell baseline acquired receipt binding mismatch");
  }
  return Object.freeze({ bytes: receiptResponse.bytes, sha256: receipt.sha256 as `sha256:${string}` });
}
