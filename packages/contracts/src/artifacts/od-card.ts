// Pure parser + payload types for inline <od-card>…</od-card> blocks.
//
// `<od-card>` is the display-only sibling of `<question-form>` (see
// apps/web/src/artifacts/question-form.ts). Where a question-form COLLECTS
// input and round-trips an answer as the next user message, an od-card just
// RENDERS a structured card inline in the transcript so the user can SEE how
// memory shaped the turn. The agent emits these around the harness work:
//
//   - PRE  (intent gateway): a collapsed "Memory applied · view brief" chip
//     that expands to the rewritten task brief (`type="task-brief"`).
//   - POST (self-verify):     a rubric scorecard showing which verified rules
//     passed / failed / were auto-fixed (`type="verify-scorecard"`).
//   - A "memory applied" chip listing which profile/facts/rules were used
//     (`type="memory-applied"`).
//   - A proposed verified rule the user can Keep / Edit / Discard before it
//     starts gating output (`type="rule-proposal"`).
//
// Wire shape — the JSON body is the payload; the `type` attribute selects the
// card kind (and is mirrored as `kind` inside the JSON when present):
//
//   <od-card type="task-brief">
//   { "summary": "Polish the exec deck", "fields": [
//       { "label": "Audience", "value": "execs" },
//       { "label": "Tone", "value": "confident, terse" } ] }
//   </od-card>
//
// This module is PURE TypeScript — no DOM, no Node, no web-runtime imports —
// so both the web renderer and the daemon (emit-guidance / validation) share
// one source of truth. Cards are display-only and emitted whole, so the parser
// is complete-only (no partial-JSON repair); a still-streaming, not-yet-closed
// block is stripped by `stripTrailingOpenOdCard` so raw markup never flashes.

/** The card kinds. Mirrors the `type` attribute and the payload `kind`. */
export type OdCardKind =
  | 'task-brief'
  | 'memory-applied'
  | 'verify-scorecard'
  | 'rule-proposal'
  | 'brand-browser-assist';

export const OD_CARD_KINDS: readonly OdCardKind[] = [
  'task-brief',
  'memory-applied',
  'verify-scorecard',
  'rule-proposal',
  'brand-browser-assist',
] as const;

/** A single labelled fact row used by the task-brief card. */
export interface OdCardField {
  label: string;
  value: string;
}

/** PRE: the rewritten task brief. Rendered as a collapsed chip
 *  (`summary`) that expands to the full `fields` list. */
export interface OdCardTaskBrief {
  kind: 'task-brief';
  /** One-line chip label, e.g. "Polish the exec deck". */
  summary: string;
  /** Optional longer headline shown when expanded. */
  title?: string;
  /** The expanded brief: audience, tone, files, constraints, done-means, … */
  fields: OdCardField[];
  /** Optional trailing note shown under the fields. */
  note?: string;
}

/** A reference to a memory entry that shaped the turn. */
export interface OdCardMemoryRef {
  /** Memory type bucket — drives the chip's category dot. */
  type: 'user' | 'feedback' | 'project' | 'reference' | 'profile' | 'rule';
  /** Human display name of the entry. */
  name: string;
  /** Optional entry id for deep-linking into the settings panel. */
  id?: string;
}

/** A compact chip stating that memory shaped this turn + what was used. */
export interface OdCardMemoryApplied {
  kind: 'memory-applied';
  /** One-line summary, e.g. "Applied your profile and 2 rules". */
  summary: string;
  used: OdCardMemoryRef[];
}

export type OdCardRowStatus = 'pass' | 'fail' | 'fixed';

/** One rubric row in the verify scorecard. */
export interface OdCardScoreRow {
  /** The verified rule / check that was evaluated. */
  rule: string;
  status: OdCardRowStatus;
  /** What was wrong / what was fixed. Shown for fail + fixed rows. */
  note?: string;
}

/** POST: the self-verify scorecard. `status` is the rolled-up verdict. */
export interface OdCardVerifyScorecard {
  kind: 'verify-scorecard';
  /** Rolled-up verdict across the rows. */
  status: 'pass' | 'partial' | 'fail';
  /** Optional one-line summary, e.g. "5/6 checks passed · 1 auto-fixed". */
  summary?: string;
  rows: OdCardScoreRow[];
}

/** A verified rule proposed for the user to Keep / Edit / Discard. Approving
 *  it writes a `type:'rule'` memory entry that future verify passes enforce. */
export interface OdCardRuleProposal {
  kind: 'rule-proposal';
  /** Short display name for the rule. */
  name: string;
  /** One-line description / hook. */
  description?: string;
  /** The thing that must hold (human-readable). */
  assertion: string;
  /** How to check it — the rubric line a verify pass evaluates. */
  check: string;
  /** Why this was inferred (e.g. "you corrected the CTA color twice"). */
  rationale?: string;
}

/** A client-action card shown when brand extraction is blocked by an anti-bot
 *  wall: it opens/focuses the in-app browser tab so the user can solve the
 *  challenge, then the normal continue-extraction action reads the unblocked
 *  DOM and re-runs extraction from it. */
export interface OdCardBrandBrowserAssist {
  kind: 'brand-browser-assist';
  /** Brand whose extraction to re-run from the rendered page. */
  brandId: string;
  /** In-app browser tab to harvest from. Defaults to the brand browser tab. */
  browserTabId?: string;
  /** Page URL, shown to the user and used as the extraction base URL. */
  url?: string;
  /** Human label for the wall that blocked extraction (e.g. "Cloudflare"). */
  reason?: string;
}

export type OdCard =
  | OdCardTaskBrief
  | OdCardMemoryApplied
  | OdCardVerifyScorecard
  | OdCardRuleProposal
  | OdCardBrandBrowserAssist;

export type OdCardSegment =
  | { kind: 'text'; text: string }
  | { kind: 'card'; card: OdCard; raw: string };

// `od-card` is the canonical tag. The close tag must match, so we capture the
// name and compute the matching close string. Case-insensitive at scan time.
const OD_CARD_OPEN_RE = /<(od-card)\b([^>]*)>/i;

/**
 * Split a final assistant text payload into ordered prose + card segments so
 * the renderer can interleave cards inline. Anything that doesn't parse as a
 * valid od-card stays in the prose stream (never swallowed).
 */
export function splitOnOdCards(input: string): OdCardSegment[] {
  const out: OdCardSegment[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const m = OD_CARD_OPEN_RE.exec(slice);
    if (!m) {
      out.push({ kind: 'text', text: slice });
      break;
    }
    const closeTag = '</od-card>';
    const openStart = cursor + m.index;
    const openEnd = openStart + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) {
      // Unterminated — leave the rest as prose so we don't swallow it.
      out.push({ kind: 'text', text: slice });
      break;
    }
    if (openStart > cursor) {
      out.push({ kind: 'text', text: input.slice(cursor, openStart) });
    }
    const body = input.slice(openEnd, closeIdx);
    const attrs = parseAttrs(m[2] ?? '');
    const card = tryParseOdCard(body, attrs);
    const blockEnd = closeIdx + closeTag.length;
    if (card) {
      out.push({ kind: 'card', card, raw: input.slice(openStart, blockEnd) });
    } else {
      // Malformed — keep raw text so the user can still see it.
      out.push({ kind: 'text', text: input.slice(openStart, blockEnd) });
    }
    cursor = blockEnd;
  }
  return out;
}

/** True when the message contains at least one parseable od-card. */
export function hasOdCard(input: string): boolean {
  return splitOnOdCards(input).some((seg) => seg.kind === 'card');
}

/**
 * Drop a trailing, not-yet-closed `<od-card>` block from streaming text so the
 * chat doesn't flash raw `<od-card>{…` markup before the JSON finishes.
 * Returns the visible text plus whether such an open block existed.
 */
export function stripTrailingOpenOdCard(
  input: string,
): { text: string; hadOpenCard: boolean } {
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const m = OD_CARD_OPEN_RE.exec(slice);
    if (!m) break;
    const closeTag = '</od-card>';
    const openStart = cursor + m.index;
    const openEnd = openStart + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) {
      return { text: input.slice(0, openStart), hadOpenCard: true };
    }
    cursor = closeIdx + closeTag.length;
  }
  return { text: input, hadOpenCard: false };
}

function findCloseTag(input: string, from: number, closeTag: string): number {
  const closeLower = closeTag.toLowerCase();
  const tagLen = closeTag.length;
  const maxStart = input.length - tagLen;
  for (let i = from; i <= maxStart; i++) {
    if (input.slice(i, i + tagLen).toLowerCase() === closeLower) return i;
  }
  return -1;
}

function parseAttrs(raw: string): Record<string, string> {
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1] as string] = (m[2] ?? m[3] ?? '') as string;
  }
  return out;
}

function normalizeKind(raw: unknown): OdCardKind | null {
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  return (OD_CARD_KINDS as readonly string[]).includes(lower)
    ? (lower as OdCardKind)
    : null;
}

/**
 * Parse one od-card body. The `type` attribute wins for selecting the kind;
 * falls back to a `kind` field in the JSON. Returns null on any shape
 * mismatch so the caller keeps the raw text in the prose stream.
 */
export function tryParseOdCard(
  body: string,
  attrs: Record<string, string>,
): OdCard | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  const kind = normalizeKind(attrs.type) ?? normalizeKind(obj.kind);
  if (!kind) return null;
  switch (kind) {
    case 'task-brief':
      return parseTaskBrief(obj);
    case 'memory-applied':
      return parseMemoryApplied(obj);
    case 'verify-scorecard':
      return parseVerifyScorecard(obj);
    case 'rule-proposal':
      return parseRuleProposal(obj);
    case 'brand-browser-assist':
      return parseBrandBrowserAssist(obj);
    default:
      return null;
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseTaskBrief(obj: Record<string, unknown>): OdCardTaskBrief | null {
  const summary = str(obj.summary) || str(obj.title);
  if (!summary) return null;
  const fields: OdCardField[] = Array.isArray(obj.fields)
    ? obj.fields
        .map((f) => {
          if (!f || typeof f !== 'object') return null;
          const fo = f as Record<string, unknown>;
          const label = str(fo.label);
          const value = str(fo.value);
          if (!label && !value) return null;
          return { label, value };
        })
        .filter((f): f is OdCardField => f !== null)
    : [];
  const title = str(obj.title);
  const note = str(obj.note);
  return {
    kind: 'task-brief',
    summary,
    fields,
    ...(title && title !== summary ? { title } : {}),
    ...(note ? { note } : {}),
  };
}

function parseMemoryApplied(
  obj: Record<string, unknown>,
): OdCardMemoryApplied | null {
  const summary = str(obj.summary);
  if (!summary) return null;
  const used: OdCardMemoryRef[] = Array.isArray(obj.used)
    ? obj.used
        .map((u) => {
          if (!u || typeof u !== 'object') return null;
          const uo = u as Record<string, unknown>;
          const name = str(uo.name);
          if (!name) return null;
          const type = normalizeMemoryRefType(uo.type);
          const id = str(uo.id);
          return { type, name, ...(id ? { id } : {}) };
        })
        .filter((u): u is OdCardMemoryRef => u !== null)
    : [];
  return { kind: 'memory-applied', summary, used };
}

function normalizeMemoryRefType(v: unknown): OdCardMemoryRef['type'] {
  const lower = str(v).toLowerCase();
  if (
    lower === 'user'
    || lower === 'feedback'
    || lower === 'project'
    || lower === 'reference'
    || lower === 'profile'
    || lower === 'rule'
  ) {
    return lower;
  }
  return 'user';
}

function parseVerifyScorecard(
  obj: Record<string, unknown>,
): OdCardVerifyScorecard | null {
  const rows: OdCardScoreRow[] = Array.isArray(obj.rows)
    ? obj.rows
        .map((r) => {
          if (!r || typeof r !== 'object') return null;
          const ro = r as Record<string, unknown>;
          const rule = str(ro.rule);
          if (!rule) return null;
          const status = normalizeRowStatus(ro.status);
          const note = str(ro.note);
          return { rule, status, ...(note ? { note } : {}) };
        })
        .filter((r): r is OdCardScoreRow => r !== null)
    : [];
  if (rows.length === 0) return null;
  const status = normalizeScorecardStatus(obj.status, rows);
  const summary = str(obj.summary);
  return {
    kind: 'verify-scorecard',
    status,
    rows,
    ...(summary ? { summary } : {}),
  };
}

function normalizeRowStatus(v: unknown): OdCardRowStatus {
  const lower = str(v).toLowerCase();
  if (lower === 'fail' || lower === 'failed') return 'fail';
  if (lower === 'fixed' || lower === 'auto-fixed' || lower === 'autofixed') {
    return 'fixed';
  }
  return 'pass';
}

function normalizeScorecardStatus(
  v: unknown,
  rows: OdCardScoreRow[],
): OdCardVerifyScorecard['status'] {
  const lower = str(v).toLowerCase();
  if (lower === 'pass' || lower === 'partial' || lower === 'fail') {
    return lower as OdCardVerifyScorecard['status'];
  }
  // Derive from the rows when the model omitted the rolled-up verdict.
  const hasFail = rows.some((r) => r.status === 'fail');
  const hasFixed = rows.some((r) => r.status === 'fixed');
  if (hasFail) return 'fail';
  if (hasFixed) return 'partial';
  return 'pass';
}

function parseRuleProposal(
  obj: Record<string, unknown>,
): OdCardRuleProposal | null {
  const name = str(obj.name);
  const assertion = str(obj.assertion);
  const check = str(obj.check);
  if (!name || !assertion) return null;
  const description = str(obj.description);
  const rationale = str(obj.rationale);
  return {
    kind: 'rule-proposal',
    name,
    assertion,
    check: check || assertion,
    ...(description ? { description } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

function parseBrandBrowserAssist(
  obj: Record<string, unknown>,
): OdCardBrandBrowserAssist | null {
  const brandId = str(obj.brandId);
  if (!brandId) return null;
  const browserTabId = str(obj.browserTabId);
  const url = str(obj.url);
  const reason = str(obj.reason);
  return {
    kind: 'brand-browser-assist',
    brandId,
    ...(browserTabId ? { browserTabId } : {}),
    ...(url ? { url } : {}),
    ...(reason ? { reason } : {}),
  };
}

// ----- Form-answer parsing (onboarding → profile) -------------------------
//
// Discovery / task-type question-forms round-trip their answers back as the
// next user message via `formatFormAnswers` (apps/web/src/artifacts/
// question-form.ts), shaped as:
//
//   [form answers — discovery]
//   - Platform: Responsive
//   - Primary audience: SaaS buyers
//
// The daemon's profile-capture path parses that block to seed the structured
// `user_profile` memory. Kept here (pure) so web and daemon share one parser.

export interface ParsedFormAnswers {
  /** The form id from the header, e.g. "discovery". */
  id: string;
  /** Ordered label/value pairs; "(skipped)" answers are dropped. */
  pairs: OdCardField[];
}

const FORM_ANSWERS_HEADER_RE = /^\s*\[form answers(?:\s*[—\-:]\s*([^\]]+))?\]\s*$/i;
const FORM_ANSWERS_LINE_RE = /^\s*-\s+([^:]+):\s*(.*)$/;

/**
 * Parse a `[form answers — <id>]` block out of a user message. Returns null
 * when the message isn't a form-answer payload. Skipped answers ("(skipped)",
 * empty) are omitted so they don't overwrite known profile fields with blanks.
 */
export function parseFormAnswers(message: string): ParsedFormAnswers | null {
  if (typeof message !== 'string' || message.indexOf('[form answers') === -1) {
    return null;
  }
  const lines = message.split(/\r?\n/);
  let id = '';
  let started = false;
  const pairs: OdCardField[] = [];
  for (const line of lines) {
    if (!started) {
      const header = FORM_ANSWERS_HEADER_RE.exec(line);
      if (header) {
        started = true;
        id = (header[1] ?? '').trim();
      }
      continue;
    }
    const m = FORM_ANSWERS_LINE_RE.exec(line);
    if (!m) {
      // Blank line or a non-bullet line ends the block.
      if (line.trim().length === 0) continue;
      // A bullet-less prose line after the block — stop collecting.
      if (pairs.length > 0) break;
      continue;
    }
    const label = (m[1] ?? '').trim();
    const value = (m[2] ?? '').trim();
    if (!label) continue;
    if (!value || value === '(skipped)') continue;
    // Strip the "[value: …]" annotation formatFormAnswers appends for options
    // whose value differs from the label — the profile wants the human label.
    const cleanValue = value.replace(/\s*\[value:[^\]]*\]\s*$/i, '').trim();
    pairs.push({ label, value: cleanValue });
  }
  if (!started) return null;
  return { id, pairs };
}
