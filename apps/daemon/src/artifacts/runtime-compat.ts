import { Buffer } from 'node:buffer';

const HTML_EXTENSION = /\.html?$/iu;
const MOTION_REACT_HOOK_USAGE =
  /\bMotion\b[\s\S]*\b(?:useScroll|useTransform|useMotionTemplate|useMotionValue|useAnimationFrame)\b|\b(?:useScroll|useTransform|useMotionTemplate|useMotionValue|useAnimationFrame)\s*\(/u;
// Boundary: this normalizer only repairs the `<script src=...>` UMD shape served by unpkg/jsdelivr —
// the vanilla `dist/motion.js` DOM bundle (`Motion.animate`), which has none of the React hooks. It does
// NOT touch ESM `import`s, importmaps, esm.sh module URLs, or other CDNs; those paths are steered by the
// official system prompt and the per-plugin "Motion loading (locked)" notes, not rewritten here. The
// MOTION_REACT_HOOK_USAGE gate keeps legitimate vanilla DOM artifacts (animate-only, no hooks) untouched.
const CDN_HOST = String.raw`https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)`;
// Wrong bundle = any package path (`motion@` or even `framer-motion@`) ending in the vanilla `dist/motion.js`
// file. The correct `dist/framer-motion.js` file is never matched (it does not end in `/dist/motion.js`).
const VANILLA_MOTION_UMD_SCRIPT = new RegExp(
  String.raw`<script\b[^>]*\bsrc=(["'])${CDN_HOST}\/(?:framer-)?motion@[^/"']+\/dist\/motion(?:\.min)?\.js\1[^>]*>\s*<\/script>`,
  'giu',
);
const MOTION_UMD_SRC = new RegExp(
  String.raw`(${CDN_HOST}\/)(?:framer-)?motion@([^/"']+)\/dist\/motion(?:\.min)?\.js`,
  'iu',
);
const FRAMER_MOTION_UMD_SCRIPT = new RegExp(
  String.raw`<script\b[^>]*\bsrc=(["'])${CDN_HOST}\/framer-motion@[^/"']+\/dist\/framer-motion(?:\.min)?\.js\1[^>]*>\s*<\/script>`,
  'iu',
);
const FRAMER_MOTION_GLOBAL_USAGE = /\bFramerMotion\b/u;
const FRAMER_MOTION_ALIAS = '<script>window.FramerMotion = window.FramerMotion || window.Motion;</script>';
const INTEGRITY_ATTR = /\s+integrity=(["'])[^"']*\1/iu;

export function normalizeArtifactRuntimeImports(name: string, body: unknown): unknown {
  if (!HTML_EXTENSION.test(name)) return body;
  const text = stringifyTextBody(body);
  if (text === null) return body;
  if (!MOTION_REACT_HOOK_USAGE.test(text) && !FRAMER_MOTION_GLOBAL_USAGE.test(text)) return body;

  let normalized = text.replace(VANILLA_MOTION_UMD_SCRIPT, (tag) => {
    return tag
      .replace(MOTION_UMD_SRC, (_src, host: string, version: string) => `${host}framer-motion@${version}/dist/framer-motion.js`)
      .replace(INTEGRITY_ATTR, '');
  });
  if (FRAMER_MOTION_GLOBAL_USAGE.test(normalized) && !normalized.includes(FRAMER_MOTION_ALIAS)) {
    normalized = normalized.replace(FRAMER_MOTION_UMD_SCRIPT, (tag) => `${tag}\n${FRAMER_MOTION_ALIAS}`);
  }

  return Buffer.isBuffer(body) || body instanceof Uint8Array ? Buffer.from(normalized, 'utf8') : normalized;
}

function stringifyTextBody(body: unknown): string | null {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  return null;
}
