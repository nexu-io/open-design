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
    transcriptMessageCount: extractNumber(body, /Transcript\s*message\s*count[^:]*[:\s]+([^\n]+)/i),
    generatedAt: extractDate(body, /Generated[^:\n]*[:\s]+([^\n]+)/i),
  };
}

// #1580: Claude renders Provenance fields with Markdown-bold labels
// (`- **Field:** value`) per Markdown convention. The capture starts
// just after the label's `:`, so a leading `** ` (and any trailing
// emphasis if the value itself is wrapped) leaks into the value.
//
// PR #1584 review (lefarcen): narrow the strip to only consume
// Markdown residue, never literal `*`/`_` characters in the value:
//   1. Leading `*`/`_` tokens FOLLOWED BY WHITESPACE
//      (the `** ` left over from `- **Field:** value`).
//   2. Trailing WHITESPACE followed by `*`/`_` tokens
//      (mirror of step 1 if Claude closes after the value).
//   3. A single balanced wrap around the whole remaining value
//      (`**X**` / `*X*` / `__X__` / `_X_`).
// Asymmetric literal `*`/`_` without a whitespace separator AND
// without a balanced closing token are preserved
// (e.g. `_draft.html`, `build_id_v1_`). Backticks are intentionally
// kept (the rendered clipboard text reads fine with them).
function stripMarkdownEmphasis(value: string): string {
  let v = value.replace(/^[*_]+\s+/, '').replace(/\s+[*_]+$/, '');
  const wrap = v.match(/^(\*\*|__|\*|_)(.+?)\1$/);
  if (wrap && wrap[2]) v = wrap[2];
  return v;
}

function extractRawValue(body: string, re: RegExp): string | null {
  const m = body.match(re);
  if (!m || !m[1]) return null;
  const value = stripMarkdownEmphasis(m[1].trim());
  return value.length > 0 ? value : null;
}

function extractField(body: string, re: RegExp): string | null {
  return extractRawValue(body, re);
}

function extractFieldOrNone(body: string, re: RegExp): string | null {
  const value = extractRawValue(body, re);
  if (value === null) return null;
  if (NONE_SENTINEL.test(value)) return null;
  return value;
}

function extractNumber(body: string, re: RegExp): number | null {
  const raw = extractRawValue(body, re);
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function extractDate(body: string, re: RegExp): Date | null {
  const raw = extractRawValue(body, re);
  if (raw === null) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
