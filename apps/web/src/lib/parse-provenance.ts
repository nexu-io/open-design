// Parses the `## Provenance` section emitted by the daemon's finalize
// synthesis prompt. The section is a plain Markdown bullet list with five
// fields:
//
//   - Project ID
//   - Design system (or "none" if not selected)
//   - Current artifact (file name, or "none" if not in scope)
//   - Transcript message count
//   - Generated UTC timestamp
//
// Used by useDesignMdState (apps/web/src/hooks/useDesignMdState.ts) to
// drive the Continue in CLI button's stale/fresh state without an
// additional daemon endpoint. Pure helper so the regex shapes are easy
// to unit-test.

export interface ProvenanceFields {
  projectId: string | null;
  designSystemId: string | null;
  currentArtifact: string | null;
  transcriptMessageCount: number | null;
  generatedAt: Date | null;
}

const NONE_SENTINEL = /^none$/i;

export function parseProvenance(designMdText: string): ProvenanceFields | null {
  const sectionMatch = designMdText.match(/##\s+Provenance\s*\n([\s\S]+?)(?=\n##\s|$)/);
  if (!sectionMatch) return null;
  const body = sectionMatch[1] ?? '';

  return {
    projectId: extractField(body, /Project\s*ID[:\s]+([^\n]+)/i),
    designSystemId: extractFieldOrNone(body, /Design\s*system[^:]*[:\s]+([^\n]+)/i),
    currentArtifact: extractFieldOrNone(body, /Current\s*artifact[^:]*[:\s]+([^\n]+)/i),
    transcriptMessageCount: extractNumber(body, /Transcript\s*message\s*count[:\s]+(\d+)/i),
    generatedAt: extractDate(body, /Generated[^:\n]*[:\s]+(\S[^\n]*)/i),
  };
}

function trimBullet(value: string): string {
  // Lines look like "- Project ID: abc". The regex captures everything
  // after the colon to the newline; strip incidental trailing whitespace.
  return value.trim();
}

function extractField(body: string, re: RegExp): string | null {
  const m = body.match(re);
  if (!m || !m[1]) return null;
  const value = trimBullet(m[1]);
  return value.length > 0 ? value : null;
}

function extractFieldOrNone(body: string, re: RegExp): string | null {
  const value = extractField(body, re);
  if (value === null) return null;
  if (NONE_SENTINEL.test(value)) return null;
  return value;
}

function extractNumber(body: string, re: RegExp): number | null {
  const m = body.match(re);
  if (!m || !m[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function extractDate(body: string, re: RegExp): Date | null {
  const m = body.match(re);
  if (!m || !m[1]) return null;
  const raw = trimBullet(m[1]);
  if (raw.length === 0) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
