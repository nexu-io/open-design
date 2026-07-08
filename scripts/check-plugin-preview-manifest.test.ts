import assert from "node:assert/strict";
import test from "node:test";

import { validatePreviewManifest } from "./check-plugin-preview-manifest.ts";

const HASH_A = "a2e7f0664e7ceed4";
const HASH_B = "0123456789abcdef";

function manifestWith(previews: Record<string, unknown>): unknown {
  return { generatedAt: null, previews };
}

function dirEntry(id: string, hash: string = HASH_A): Record<string, unknown> {
  return {
    video: `${id}/${hash}/preview.mp4`,
    poster: `${id}/${hash}/poster.jpg`,
    durationMs: 3667,
    holdMs: 2500,
    hash,
  };
}

function flatEntry(id: string, hash: string = HASH_A): Record<string, unknown> {
  return {
    video: `${id}.${hash}.mp4`,
    poster: `${id}.${hash}.poster.jpg`,
    durationMs: 3667,
    holdMs: 2500,
    hash,
  };
}

test("accepts directory-layout and legacy flat-layout entries", () => {
  const manifest = manifestWith({
    "example-video-hyperframes": dirEntry("example-video-hyperframes"),
    "example-invoice": flatEntry("example-invoice", HASH_B),
  });
  const ids = new Set(["example-video-hyperframes", "example-invoice"]);
  assert.deepEqual(validatePreviewManifest(manifest, ids), []);
});

test("flags an orphan entry whose plugin no longer ships", () => {
  const manifest = manifestWith({ "example-luxury-botanical": flatEntry("example-luxury-botanical") });
  const violations = validatePreviewManifest(manifest, new Set(["example-invoice"]));
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /example-luxury-botanical: no such plugin ships/);
});

test("flags clip keys that belong to a different plugin id", () => {
  const manifest = manifestWith({
    "example-video-hyperframes": {
      ...dirEntry("example-video-hyperframes"),
      video: `example-figma/${HASH_A}/preview.mp4`,
    },
  });
  const violations = validatePreviewManifest(manifest, new Set(["example-video-hyperframes"]));
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /video key "example-figma\/.*" does not belong to this plugin id/);
});

test("flags a key whose embedded fingerprint disagrees with the recorded hash", () => {
  const manifest = manifestWith({
    "example-invoice": { ...flatEntry("example-invoice", HASH_A), hash: HASH_B },
  });
  const violations = validatePreviewManifest(manifest, new Set(["example-invoice"]));
  assert.equal(violations.length, 2); // video + poster both carry the old hash
  assert.match(violations[0]!, /does not carry the recorded hash/);
});

test("flags two entries claiming the same clip", () => {
  const shared = dirEntry("example-a");
  const manifest = manifestWith({
    "example-a": shared,
    "example-b": { ...shared },
  });
  const violations = validatePreviewManifest(manifest, new Set(["example-a", "example-b"]));
  // example-b's keys belong to example-a (2 ownership violations) and both
  // keys are double-claimed (2 duplicate violations).
  assert.equal(violations.filter((v) => /does not belong/.test(v)).length, 2);
  assert.equal(violations.filter((v) => /claimed by 2 entries/.test(v)).length, 2);
});

test("flags malformed hash, missing keys, and non-positive timings", () => {
  const manifest = manifestWith({
    "example-a": { poster: "example-a/x/poster.jpg", hash: "NOT-HEX", durationMs: 0, holdMs: -5 },
  });
  const violations = validatePreviewManifest(manifest, new Set(["example-a"]));
  assert.ok(violations.some((v) => /video must be a non-empty string/.test(v)));
  assert.ok(violations.some((v) => /hash must be 16 lowercase hex chars/.test(v)));
  assert.ok(violations.some((v) => /durationMs must be a positive finite number/.test(v)));
  assert.ok(violations.some((v) => /holdMs must be a positive finite number/.test(v)));
});

test("rejects a manifest without a previews object", () => {
  const violations = validatePreviewManifest({ previews: [] }, new Set());
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /expected a \{ previews: \{ <id>: … \} \} object/);
});
