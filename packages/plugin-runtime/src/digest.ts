import { createHash } from 'node:crypto';
import type { PluginManifest } from '@open-design/contracts';

// Frozen `manifestSourceDigest` algorithm (plan F1). The input shape is
// stable forever: bumping it must come with a CI fixture update so historic
// snapshots cannot silently drift.
//
// Algorithm:
//   1. Build a canonical record { manifest, inputs, resolvedContextRefs }.
//   2. JSON.stringify with object keys sorted alphabetically and arrays
//      preserved in source order.
//   3. SHA-256 the resulting UTF-8 bytes; emit lower-case hex.
//
// Notes:
//   - The crypto import is `node:crypto`, available in Node 20+. Browser
//     consumers must shim. The runtime package is daemon-targeted today; if
//     a future preview sandbox needs digest computation we'll lift this
//     into a thin SubtleCrypto helper.
//   - resolvedContextRefs is normalized to a list of `{kind, ref}` pairs so
//     two plugins resolving the same skills/DS/craft to the same ids
//     produce the same digest, regardless of their context display labels.

export interface DigestInput {
  manifest: PluginManifest;
  inputs: Record<string, string | number | boolean>;
  resolvedContextRefs: Array<{ kind: string; ref: string }>;
}

export function manifestSourceDigest(input: DigestInput): string {
  const canonical = canonicalize({
    manifest: input.manifest,
    inputs: input.inputs,
    resolvedContextRefs: input.resolvedContextRefs,
  });
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = canonicalize(obj[key]);
  }
  return out;
}
