// Blocks an artifact publication when the body still contains template
// placeholders that should have been replaced with real content. Scoped to
// the file-write boundary for HTML-rendered artifact kinds — the moment
// the file would land in the project as a published artifact — not to the
// agent's chat prose, where these strings can legitimately appear when
// the model is asking the user to fill them in.
//
// The placeholder set is intentionally short and pitch-deck-specific:
// these are the exact markers shipped by the official html-ppt-pitch-deck
// example template that signal "an unfilled fundraising slot" rather than
// "regular product copy". Extending the list to more general words risks
// false positives on real artifacts, so the contract is: any future
// example that wants similar enforcement should either declare structured
// `od.inputs` (preferred) or contribute its specific placeholder markers
// here together with a fixture that proves they cannot appear in
// finished output.
//
// Pairs with `od.inputs` on `plugins/_official/examples/html-ppt-pitch-deck/
// open-design.json`. The inputs gate is the primary contract — this guard
// is the defense-in-depth invariant that catches agents that bypassed the
// structured contract (e.g. routed through `od-default`) but still tried
// to publish a placeholder-laden HTML/deck artifact.

import { Buffer } from 'node:buffer';

export const ARTIFACT_PUBLICATION_BLOCKED_CODE = 'ARTIFACT_PUBLICATION_BLOCKED' as const;

// HTML and deck are the artifact kinds whose bodies are user-facing
// rendered documents. Other kinds (markdown drafts, code snippets, raw
// JSON) are not subject to this guard — placeholder strings can be
// legitimate content in those.
export const PUBLICATION_GUARDED_ARTIFACT_KINDS: ReadonlySet<string> = new Set(['html', 'deck']);

// Markers shipped by the html-ppt-pitch-deck example template that
// indicate an unresolved fundraising slot. Each is a substring; matching
// is case-sensitive because the template emits these literally.
export const UNRESOLVED_ARTIFACT_PLACEHOLDERS = [
  'Name to confirm',
  '$X.XM',
  'Replace this panel with',
  'Replace role placeholders',
  'Your form answer only said',
] as const;

export class ArtifactPublicationBlockedError extends Error {
  readonly code = ARTIFACT_PUBLICATION_BLOCKED_CODE;
  readonly placeholders: string[];

  constructor(placeholders: string[]) {
    super(buildArtifactPublicationBlockedMessage(placeholders));
    this.name = 'ArtifactPublicationBlockedError';
    this.placeholders = [...placeholders];
  }
}

export function isPublicationGuardedArtifactKind(kind: unknown): boolean {
  return typeof kind === 'string' && PUBLICATION_GUARDED_ARTIFACT_KINDS.has(kind);
}

export function findUnresolvedArtifactPlaceholders(value: unknown): string[] {
  const text = stringifyArtifactContent(value);
  if (!text) return [];
  return UNRESOLVED_ARTIFACT_PLACEHOLDERS.filter((placeholder) =>
    text.includes(placeholder),
  );
}

export function shouldBlockArtifactPublication(value: unknown): boolean {
  return findUnresolvedArtifactPlaceholders(value).length > 0;
}

export function buildArtifactPublicationBlockedMessage(placeholders: readonly string[]): string {
  const list = placeholders.length > 0 ? placeholders.join(', ') : 'unknown placeholders';
  return `Artifact still contains unresolved pitch-deck placeholders: ${list}. Provide the required pitch facts before publishing.`;
}

export function assertArtifactPublicationAllowed(value: unknown): void {
  const placeholders = findUnresolvedArtifactPlaceholders(value);
  if (placeholders.length > 0) {
    throw new ArtifactPublicationBlockedError(placeholders);
  }
}

function stringifyArtifactContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return '';
}
