/**
 * Creative Memory System — end-to-end engine walkthrough.
 *
 * Runs a scripted scenario showing every layer the package exposes:
 *   - signal ingestion (multiple types)
 *   - confidence ladder + accumulation
 *   - reversal lifecycle (noise guard → graduated → shadow → promotion)
 *   - decay + archive
 *   - retrieval pipeline (eleven stages, with diagnostics)
 *   - prompt block rendering
 *   - project override scenario
 *
 * The output of this script is the source of truth for `walkthrough.md`.
 * If you change the script, regenerate the markdown by re-running and
 * pasting the output into the corresponding section of walkthrough.md.
 *
 * Run from the repo root:
 *   pnpm --filter @open-design/creative-memory-system demo
 *
 * Or directly:
 *   tsx packages/creative-memory-system/demo/walkthrough.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import * as store from "../src/preferenceStore.js";
import type { Preference, RetrievalResult, Signal } from "../src/types.js";

// ---------------------------------------------------------------------------
// Setup: isolated scratch storage so the demo never touches real user data.
// ---------------------------------------------------------------------------

const moduleDir = path.dirname(url.fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(moduleDir, ".demo-storage");
process.env.MEMORY_STORAGE_ROOT = STORAGE_DIR;

if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true });

const USER = "demo_user";
const SESSION = "demo_session";

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function step(n: number, title: string): void {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`STEP ${n} — ${title}`);
  console.log("=".repeat(72));
}

function note(text: string): void {
  console.log(`\n${text}`);
}

function showState(label: string): void {
  const all = store.listPreferences(USER, { status: "all" });
  console.log(`\n${label}:`);
  if (all.length === 0) {
    console.log("  (no preferences)");
    return;
  }
  for (const p of all) {
    const shadowMark = p.shadow_of ? ` shadow_of=${p.shadow_of}` : "";
    console.log(
      `  [${p.polarity}] ${p.preference_type}/${p.pattern}  ` +
        `strength=${p.signal_strength.toFixed(2)} ` +
        `conf=${p.confidence} ` +
        `status=${p.polarity_status}${shadowMark}`,
    );
  }
}

function showRetrieval(retrieved: RetrievalResult): void {
  console.log("\nRetrieval result:");
  console.log(`  positives (${retrieved.positives.length}):`);
  for (const p of retrieved.positives) {
    console.log(
      `    ${p.preference_type}/${p.pattern} (${p.confidence}, strength=${p.signal_strength.toFixed(2)})`,
    );
  }
  console.log(`  negatives (${retrieved.negatives.length}):`);
  for (const p of retrieved.negatives) {
    console.log(
      `    ${p.preference_type}/${p.pattern} (${p.confidence}, strength=${p.signal_strength.toFixed(2)})`,
    );
  }
  console.log(`  projectOverrides (${retrieved.projectOverrides.length}):`);
  for (const p of retrieved.projectOverrides) {
    console.log(`    ${p.preference_type}/${p.pattern}`);
  }
  console.log(`  diagnostics (${retrieved.diagnostics.length}):`);
  for (const d of retrieved.diagnostics) {
    console.log(`    [${d.type}] ${d.trace}`);
  }
}

function showPromptBlock(block: string): void {
  console.log("\nGenerated prompt block (concatenated into the next generation):");
  if (!block) {
    console.log("  (empty — nothing injectable)");
    return;
  }
  for (const line of block.split("\n")) console.log(`  | ${line}`);
}

// ---------------------------------------------------------------------------
// Signal builder
// ---------------------------------------------------------------------------

function makeSignal(overrides: Partial<Signal>): Signal {
  return {
    signal_type: "explicit_tag",
    pattern: "airy_spacing",
    preference_type: "layout_density",
    polarity: "positive",
    tag_text: null,
    scope: "global",
    project_id: null,
    artifact_id: "art_demo",
    session_id: SESSION,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function backdate(prefId: string, daysAgo: number, field: "last_seen" | "decay_at"): void {
  const past = new Date();
  past.setDate(past.getDate() - daysAgo);
  store.updatePreference(USER, prefId, { [field]: past.toISOString() } as Partial<Preference>);
}

// ---------------------------------------------------------------------------
// Walkthrough
// ---------------------------------------------------------------------------

console.log("Creative Memory System — end-to-end engine walkthrough");
console.log("Storage root: " + STORAGE_DIR);
console.log("User: " + USER);

// -----------------------------------------------------------------
step(1, "Fresh user state — no preferences yet");
// -----------------------------------------------------------------
note(
  "A new user has nothing in memory. retrieveForInjection returns empty\n" +
    "arrays, and the prompt block is an empty string (nothing gets injected).",
);
store.resetMemory(USER, { scope: "all" });
showState("State");
{
  const retrieved = store.retrieveForInjection(USER, {});
  const block = store.buildPromptBlock(retrieved);
  showRetrieval(retrieved);
  showPromptBlock(block);
}

// -----------------------------------------------------------------
step(2, "Positive signal — user tags a layout 'Save this direction'");
// -----------------------------------------------------------------
note(
  "An explicit_tag signal carries the highest weight (0.30). Each call adds\n" +
    "weight / NORMALIZER (= 0.15) to the running strength. After one signal:\n" +
    "strength=0.15, confidence=low. The preference is not yet injectable\n" +
    "(needs strength ≥ 0.40 AND medium+ confidence).",
);
store.ingestSignal(
  USER,
  makeSignal({
    signal_type: "explicit_tag",
    tag_text: "Save this direction",
  }),
);
showState("State");
{
  const retrieved = store.retrieveForInjection(USER, {});
  showRetrieval(retrieved);
}

// -----------------------------------------------------------------
step(3, "Three more matching signals — confidence ladder climbs");
// -----------------------------------------------------------------
note(
  "Repeated signals accumulate. After 4 explicit_tags total: strength=0.60,\n" +
    "confidence=medium. Now the preference passes the threshold gate and\n" +
    "appears in retrieval.",
);
for (let i = 0; i < 3; i++) {
  store.ingestSignal(
    USER,
    makeSignal({ signal_type: "explicit_tag" }),
  );
}
showState("State");
{
  const retrieved = store.retrieveForInjection(USER, {});
  const block = store.buildPromptBlock(retrieved);
  showRetrieval(retrieved);
  showPromptBlock(block);
}

// -----------------------------------------------------------------
step(4, "Negative signal — user gives thumbs-down on a different pattern");
// -----------------------------------------------------------------
note(
  "A thumbs_down on neon_palette creates a negative preference (weak weight).\n" +
    "Four further explicit_tag negative signals on the same pattern push it\n" +
    "above threshold and into medium confidence. Negatives are weighted by\n" +
    "NEGATIVE_PRIORITY_MULTIPLIER (1.2) at retrieval, so an equal-strength\n" +
    "avoidance signal ranks ahead of an equal-strength preference.",
);
store.ingestSignal(
  USER,
  makeSignal({
    signal_type: "thumbs_down",
    pattern: "neon_palette",
    preference_type: "color",
    polarity: "negative",
  }),
);
// Build the negative up to medium confidence with explicit_tag negatives
for (let i = 0; i < 4; i++) {
  store.ingestSignal(
    USER,
    makeSignal({
      signal_type: "explicit_tag",
      pattern: "neon_palette",
      preference_type: "color",
      polarity: "negative",
      tag_text: "Too noisy",
    }),
  );
}
showState("State");
{
  const retrieved = store.retrieveForInjection(USER, {});
  const block = store.buildPromptBlock(retrieved);
  showRetrieval(retrieved);
  showPromptBlock(block);
}

// -----------------------------------------------------------------
step(5, "Reversal lifecycle — user changes their mind about airy_spacing");
// -----------------------------------------------------------------
note(
  "Four contradictory signals on a stable preference triggers the reversal\n" +
    "ladder:\n" +
    "  signal 1: noise guard — no change (one off-day click is tolerated)\n" +
    "  signal 2: strength × 0.80, status remains stable\n" +
    "  signal 3: strength × 0.60, confidence drops one rung\n" +
    "  signal 4+: status flips to under_review, a SHADOW record is created\n" +
    "The shadow tracks the new opposite-polarity signal. Until it reaches\n" +
    "medium confidence, neither the original (under_review) nor the shadow\n" +
    "(low confidence) are injected.",
);
for (let i = 0; i < 4; i++) {
  store.ingestSignal(
    USER,
    makeSignal({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "Wrong direction",
    }),
  );
}
showState("State after reversal triggers");
{
  const retrieved = store.retrieveForInjection(USER, {});
  showRetrieval(retrieved);
}

// -----------------------------------------------------------------
step(6, "Shadow promotion — user keeps signaling the new direction");
// -----------------------------------------------------------------
note(
  "Continued signals on the shadow accumulate strength. When the shadow\n" +
    "reaches medium confidence it promotes (clears shadow_of) and the\n" +
    "original is archived. The preference has now genuinely flipped polarity\n" +
    "in a way that respected the noise guard but eventually decisively shifted.",
);
for (let i = 0; i < 5; i++) {
  store.ingestSignal(
    USER,
    makeSignal({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "Wrong direction",
    }),
  );
}
showState("State after shadow promotion");
{
  const retrieved = store.retrieveForInjection(USER, {});
  showRetrieval(retrieved);
}

// -----------------------------------------------------------------
step(7, "Decay — a stale preference fades and eventually archives");
// -----------------------------------------------------------------
note(
  "The user has not interacted with neon_palette in over 90 days. runDecay\n" +
    "applies × 0.70 to its strength and drops confidence by one rung. After\n" +
    "180 days of no interaction (measured against last_seen), the record\n" +
    "archives and is excluded from retrieval forever (until a new same-polarity\n" +
    "signal reactivates it, which is also supported).",
);
// Refresh the demo state — re-establish a clean profile to demonstrate decay
store.resetMemory(USER, { scope: "all" });
const decayPref = store.ingestSignal(
  USER,
  makeSignal({ signal_type: "explicit_tag", pattern: "stale_pattern", preference_type: "style" }),
)!;
for (let i = 0; i < 3; i++) {
  store.ingestSignal(
    USER,
    makeSignal({ signal_type: "explicit_tag", pattern: "stale_pattern", preference_type: "style" }),
  );
}
showState("State before decay");
console.log("\nBackdating decay_at by 91 days to simulate inactivity...");
backdate(decayPref.id, 91, "decay_at");
{
  const r = store.runDecay(USER);
  console.log(`runDecay() returned: { decayed: ${r.decayed}, archived: ${r.archived} }`);
}
showState("State after decay pass");

console.log("\nBackdating last_seen by 181 days to trigger archive...");
backdate(decayPref.id, 181, "last_seen");
{
  const r = store.runDecay(USER);
  console.log(`runDecay() returned: { decayed: ${r.decayed}, archived: ${r.archived} }`);
}
showState("State after archive pass");

// -----------------------------------------------------------------
step(8, "Realistic profile — full retrieval pipeline with diagnostics");
// -----------------------------------------------------------------
note(
  "Build a realistic profile that exercises the full eleven-stage pipeline:\n" +
    "  - several positive preferences across multiple categories\n" +
    "  - several negative preferences\n" +
    "  - more candidates than fit in the injection budget\n" +
    "Retrieval will fire balancing stages and emit diagnostics describing\n" +
    "every non-trivial decision the engine made.",
);
store.resetMemory(USER, { scope: "all" });
const positives: Array<{ pattern: string; preference_type: string }> = [
  { pattern: "airy_spacing", preference_type: "layout" },
  { pattern: "wide_grid", preference_type: "layout" },
  { pattern: "single_column", preference_type: "layout" },
  { pattern: "split_panel", preference_type: "layout" },
  { pattern: "serif_headlines", preference_type: "typography" },
  { pattern: "monospace_code", preference_type: "typography" },
  { pattern: "earth_palette", preference_type: "color" },
  { pattern: "subtle_motion", preference_type: "motion" },
];
for (const { pattern, preference_type } of positives) {
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, makeSignal({ pattern, preference_type }));
  }
}
const negatives = [
  { pattern: "neon_palette", preference_type: "color" },
  { pattern: "heavy_animation", preference_type: "motion" },
  { pattern: "comic_sans", preference_type: "typography" },
];
for (const { pattern, preference_type } of negatives) {
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(
      USER,
      makeSignal({ pattern, preference_type, polarity: "negative" }),
    );
  }
}
console.log(`\nProfile size: ${store.listPreferences(USER).length} preferences`);
{
  const retrieved = store.retrieveForInjection(USER, {});
  const block = store.buildPromptBlock(retrieved);
  showRetrieval(retrieved);
  showPromptBlock(block);
}

// -----------------------------------------------------------------
step(9, "Project override — global preference shadowed by project-scoped one");
// -----------------------------------------------------------------
note(
  "A user working on a fintech project has a global preference for\n" +
    "airy_spacing, but for THIS project specifically prefers dense_grid.\n" +
    "The project-scoped record shadows the global one for retrievals\n" +
    "scoped to that project. A diagnostic event records the suppression\n" +
    "so the host can show the user which preferences are project-overridden.",
);
for (let i = 0; i < 4; i++) {
  store.ingestSignal(
    USER,
    makeSignal({
      pattern: "airy_spacing",
      preference_type: "layout",
      scope: "project",
      project_id: "proj_fintech",
    }),
  );
}
// Make the project record DIFFERENT polarity so the override is visible
for (let i = 0; i < 4; i++) {
  store.ingestSignal(
    USER,
    makeSignal({
      pattern: "airy_spacing",
      preference_type: "layout",
      polarity: "negative",
      scope: "project",
      project_id: "proj_fintech",
    }),
  );
}
{
  console.log("\nGlobal-only retrieval (no project_id):");
  const r1 = store.retrieveForInjection(USER, {});
  const b1 = store.buildPromptBlock(r1);
  showRetrieval(r1);
  showPromptBlock(b1);

  console.log("\n\nProject-scoped retrieval (project_id=proj_fintech):");
  const r2 = store.retrieveForInjection(USER, { project_id: "proj_fintech" });
  const b2 = store.buildPromptBlock(r2, "proj_fintech");
  showRetrieval(r2);
  showPromptBlock(b2);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(72));
console.log("Walkthrough complete.");
console.log("=".repeat(72));
console.log(
  "\nWhat this demonstrates end-to-end at the engine layer:\n" +
    "  1. Fresh users start with empty injection sets — no surprise context.\n" +
    "  2. Signals build preferences gradually; one click is never enough.\n" +
    "  3. Negative preferences are first-class and weight ahead of positives.\n" +
    "  4. Reversals respect a noise guard before flipping; shadows preserve\n" +
    "     the path back if the user changes their mind again.\n" +
    "  5. Stale preferences fade and archive on a fixed schedule.\n" +
    "  6. Retrieval is bounded on count, polarity ratio, category share, and\n" +
    "     prompt token budget — every non-trivial decision is observable\n" +
    "     through structured diagnostic events.\n" +
    "  7. Project context overrides global context with a clear suppression\n" +
    "     trace so hosts can surface 'your project preferences differ from\n" +
    "     your usual taste' to the user.\n" +
    "\nWhat is INTENTIONALLY NOT shown here:\n" +
    "  - User-facing UI for inspect / edit / disable / reset. That surface\n" +
    "    lives in the host application (apps/daemon, apps/web) and depends\n" +
    "    on integration decisions tracked in docs/open-questions.md.\n" +
    "  - Wired pipeline integration. The adapter handlers in\n" +
    "    src/extractionAdapter.ts are stubs awaiting pipeline-team\n" +
    "    confirmation on event timing and attachment points.\n",
);

// Clean up scratch storage so re-runs are deterministic
fs.rmSync(STORAGE_DIR, { recursive: true });
