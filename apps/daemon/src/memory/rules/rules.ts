/** @module rules/rules
 * Annotation-to-rule-proposal distillation: turns a batch of in-canvas / in-deck
 * annotations (comments, highlights, inspect-selection marks) into candidate `rule`
 * memory drafts surfaced through the Keep gate. Distillation NEVER writes a rule on its
 * own — that is the user's explicit decision.
 *
 * Two layered passes: a heuristic pass (always available, no provider — each annotation
 * note becomes one draft) and a best-effort LLM pass via `llm/suggestWithLLM` (groups
 * related annotations into a single generalised, checkable rule). Both passes feed the
 * same merge+dedupe so the output never surfaces near-duplicates. Depends on `llm/`
 * for the suggest path; no other sibling imports this file directly.
 */

import type {
  AnnotationDistillInput,
  RuleProposalDraft,
} from '@open-design/contracts';
// suggestWithLLM lives in the @ts-nocheck llm/ module; its inferred type
// is loose, which is fine — we only consume the {type,name,description,body}
// MemoryDraft shape it documents.
import { suggestWithLLM } from '../llm/index.js';

const MAX_ANNOTATIONS = 24;
const MAX_PROPOSALS = 8;

interface DistillOptions {
  projectRoot?: string | null;
  chatAgentId?: string | null;
  chatModel?: string | null;
  chatProvider?: unknown;
  // Test seam: inject a fake suggest function so the LLM pass can be exercised
  // without a network call.
  suggest?: typeof suggestWithLLM;
}

/**
 * The result returned by {@link distillRulesFromAnnotations}. `proposals` is the
 * merged, deduplicated list of rule drafts. `attemptedLLM` indicates whether the LLM
 * pass was reached (false when no provider is configured or the pass threw).
 * `source` is `'heuristic'` when only the regex pass produced output, `'llm'` when
 * only the model did, or `'mixed'` when both contributed surviving proposals.
 */
export interface DistillResult {
  proposals: RuleProposalDraft[];
  attemptedLLM: boolean;
  source: 'heuristic' | 'llm' | 'mixed';
}

const RULE_SYSTEM_PROMPT = `You distil a designer's review annotations into reusable, checkable design rules for an AI design assistant.

You are given a batch of annotations the user left on a delivered artifact (comments, highlights, inspect-selection marks). Each annotation may name the element it targets and the current content there.

Decide whether the annotations imply any GENERAL, reusable rule — a preference that should hold for FUTURE artifacts too, not just a one-off fix to this element. Group related annotations into a single rule where they express the same intent.

A good rule is:
- general (applies beyond the specific element annotated),
- checkable (you can verify a future artifact against it), and
- grounded in what the user actually annotated.

Do NOT invent rules the annotations do not support. If nothing generalises, return an empty list.

Output STRICT JSON in this exact shape — nothing else, no prose, no markdown fences:
{
  "entries": [
    { "type": "rule", "name": "short title (<= 60 chars)", "description": "one-line summary (<= 140 chars)", "body": "Assertion: <what must hold>\\nCheck: <how to verify it>\\nVerified by: <which annotation(s) implied this>" }
  ]
}

If nothing worth a rule, return: {"entries": []}`;

/**
 * Parses a `rule` memory entry body back into structured proposal fields. The body is
 * expected to follow the `Assertion: … / Check: … / Verified by: …` format written by
 * `OdCard.keep` and `od memory rule add`. Tolerant: a body that is plain prose falls
 * back to treating the first line as the assertion.
 * @param body - The raw markdown body of a rule memory entry.
 * @returns `{ assertion, check, rationale }` — `check` defaults to `assertion` when
 *   no `Check:` line is present.
 */
// Parse a rule memory body (`Assertion:` / `Check:` / `Verified by:` /
// `Rationale:` lines, as written by OdCard.keep and `od memory rule add`) back
// into the structured proposal fields. Tolerant: a body that is just prose
// falls back to using the whole body as the assertion.
export function parseRuleBody(body: string): {
  assertion: string;
  check: string;
  rationale: string;
} {
  const lines = String(body || '').split(/\r?\n/);
  let assertion = '';
  let check = '';
  let rationale = '';
  for (const raw of lines) {
    const line = raw.trim();
    const m = /^([A-Za-z][A-Za-z ]*?):\s*(.*)$/.exec(line);
    if (!m) continue;
    const label = (m[1] ?? '').toLowerCase();
    const value = (m[2] ?? '').trim();
    if (!value) continue;
    if (label === 'assertion' && !assertion) assertion = value;
    else if (label === 'check' && !check) check = value;
    else if ((label === 'verified by' || label === 'rationale') && !rationale) {
      rationale = value;
    }
  }
  if (!assertion) {
    assertion = String(body || '').trim().split(/\r?\n/)[0]?.trim() ?? '';
  }
  return { assertion, check: check || assertion, rationale };
}

/**
 * @internal
 * Collapses whitespace in `value` and truncates to `max` characters with a trailing
 * `…`. Used to sanitise annotation text before building proposal fields.
 */
function clean(value: string | undefined, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

/**
 * @internal
 * Builds a single heuristic `RuleProposalDraft` from one annotation. The note becomes
 * the assertion; a verifiable check is derived from the note; the target element and
 * current text are recorded as the rationale. Returns `null` when the note is too short
 * (< 3 characters) to form a meaningful rule.
 */
// Build one heuristic proposal from a single annotation. The note is the
// assertion; the check restates it as a verifiable instruction; the target
// context is recorded as the rationale so the user can see what it came from.
function heuristicProposal(
  annotation: AnnotationDistillInput,
): RuleProposalDraft | null {
  const note = clean(annotation.note, 240);
  if (note.length < 3) return null;
  const target = clean(annotation.targetLabel, 80);
  const name = clean(
    target ? `${target}: ${note}` : note,
    60,
  ) || 'Design rule';
  const rationaleBits: string[] = [];
  if (target) rationaleBits.push(`annotation on "${target}"`);
  const currentText = clean(annotation.currentText, 80);
  if (currentText) rationaleBits.push(`current: "${currentText}"`);
  return {
    name,
    description: note,
    assertion: note,
    check: `Verify future artifacts satisfy: ${note}`,
    ...(rationaleBits.length > 0
      ? { rationale: `Distilled from ${rationaleBits.join(', ')}.` }
      : { rationale: 'Distilled from a delivered-artifact annotation.' }),
  };
}

/**
 * @internal
 * Serialises the annotation batch into the user message sent to the LLM pass. Each
 * annotation is numbered with its note, target, file path, current text, kind, and
 * HTML hint so the model has enough context to judge whether the critique generalises.
 */
// Compose a single user payload describing every annotation for the LLM pass.
function renderAnnotationsPayload(
  annotations: AnnotationDistillInput[],
): string {
  const parts: string[] = ['## Annotations on a delivered artifact', ''];
  annotations.forEach((a, i) => {
    parts.push(`${i + 1}. note: ${clean(a.note, 400) || '(empty)'}`);
    const target = clean(a.targetLabel, 120);
    if (target) parts.push(`   target: ${target}`);
    if (a.filePath) parts.push(`   file: ${clean(a.filePath, 200)}`);
    const currentText = clean(a.currentText, 200);
    if (currentText) parts.push(`   currentText: ${currentText}`);
    if (a.selectionKind) parts.push(`   kind: ${clean(a.selectionKind, 40)}`);
    const htmlHint = clean(a.htmlHint, 200);
    if (htmlHint) parts.push(`   htmlHint: ${htmlHint}`);
  });
  parts.push('', 'Return ONLY the JSON object described in the system prompt.');
  return parts.join('\n');
}

/**
 * @internal
 * Derives the deduplication key for a proposal: the normalised lowercase assertion.
 * Two proposals that express the same constraint in different whitespace or
 * capitalisation will share a key and only one will survive the merge.
 */
function dedupeKey(draft: RuleProposalDraft): string {
  return draft.assertion.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * @internal
 * Merges LLM proposals and heuristic proposals into a single deduplicated list (LLM
 * first so LLM proposals win on assertion collision, keeping the better-generalised
 * phrasing). Caps the result at `MAX_PROPOSALS`.
 */
// Merge heuristic + LLM proposals, dropping near-duplicate assertions. LLM
// proposals win on collision because they tend to be the better-generalised
// phrasing of the same intent.
function mergeProposals(
  llm: RuleProposalDraft[],
  heuristic: RuleProposalDraft[],
): RuleProposalDraft[] {
  const out: RuleProposalDraft[] = [];
  const seen = new Set<string>();
  for (const draft of [...llm, ...heuristic]) {
    const key = dedupeKey(draft);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
    if (out.length >= MAX_PROPOSALS) break;
  }
  return out;
}

/**
 * Distils a batch of design annotations into candidate `rule` memory proposals.
 * Runs a heuristic pass first (always), then a best-effort LLM pass via
 * `suggestWithLLM` with a rule-focused system prompt and a `type === 'rule'` filter.
 * The two passes are merged and deduplicated, with LLM proposals winning on collision
 * because they tend to be better generalised. Returns up to `MAX_PROPOSALS` proposals.
 * @param dataDir - The resolved daemon data root (used only for the LLM pass provider
 *   selection via `readMemoryConfig`).
 * @param input - `{ annotations }` — only annotations with a non-empty `note` of ≥ 3
 *   characters are processed; up to `MAX_ANNOTATIONS` annotations are read.
 * @param options - Provider hints and an optional `suggest` test seam.
 * @returns A {@link DistillResult} with the merged proposal list, LLM-attempted flag,
 *   and source tag.
 */
export async function distillRulesFromAnnotations(
  dataDir: string,
  input: { annotations: AnnotationDistillInput[] },
  options: DistillOptions = {},
): Promise<DistillResult> {
  const annotations = Array.isArray(input?.annotations)
    ? input.annotations
        .filter((a) => a && typeof a.note === 'string' && a.note.trim().length >= 3)
        .slice(0, MAX_ANNOTATIONS)
    : [];
  if (annotations.length === 0) {
    return { proposals: [], attemptedLLM: false, source: 'heuristic' };
  }

  const heuristic = annotations
    .map((a) => heuristicProposal(a))
    .filter((p): p is RuleProposalDraft => p !== null);

  // LLM pass — reuse the existing suggest path with a rule-focused prompt and a
  // type filter so only `rule` candidates survive. Synthesize a user message
  // from the annotations; suggestWithLLM records its own extraction-history
  // attempt and returns [] when no provider is configured.
  const suggest = options.suggest ?? suggestWithLLM;
  let llmDrafts: RuleProposalDraft[] = [];
  let attemptedLLM = false;
  try {
    const suggestions = await suggest(
      dataDir,
      {
        userMessage: renderAnnotationsPayload(annotations),
        assistantMessage: '',
      },
      {
        projectRoot: options.projectRoot ?? null,
        chatAgentId: options.chatAgentId ?? null,
        chatModel: options.chatModel ?? null,
        chatProvider: options.chatProvider ?? null,
        kind: 'llm',
        systemPrompt: RULE_SYSTEM_PROMPT,
        candidateFilter: (candidate: { type?: string }) => candidate?.type === 'rule',
      },
    );
    if (Array.isArray(suggestions)) {
      attemptedLLM = true;
      llmDrafts = suggestions
        .map((s: { name?: string; description?: string; body?: string }) => {
          const name = clean(s?.name, 60);
          if (!name) return null;
          const parsed = parseRuleBody(s?.body ?? '');
          if (!parsed.assertion) return null;
          return {
            name,
            description: clean(s?.description, 140),
            assertion: parsed.assertion,
            check: parsed.check,
            ...(parsed.rationale ? { rationale: parsed.rationale } : {}),
          } as RuleProposalDraft;
        })
        .filter((p): p is RuleProposalDraft => p !== null);
    }
  } catch (err) {
    // Distillation is best-effort; a provider failure still returns the
    // heuristic proposals so the feature degrades gracefully.
    console.warn('[memory-rules] LLM distillation failed', (err as Error)?.message ?? err);
  }

  const proposals = mergeProposals(llmDrafts, heuristic);
  const source: DistillResult['source'] =
    llmDrafts.length > 0 && heuristic.length > 0
      ? 'mixed'
      : llmDrafts.length > 0
        ? 'llm'
        : 'heuristic';
  return { proposals, attemptedLLM, source };
}
