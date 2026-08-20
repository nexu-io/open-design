import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Digest = `sha256:${string}`;

export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function canonicalize(value: unknown): Json {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON cannot contain non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value == null || typeof value !== "object") throw new Error("canonical JSON value must be an object");
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function digest(value: string | Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
