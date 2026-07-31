import { createHash } from 'node:crypto';

/**
 * Attribution for stable-prefix drift.
 *
 * A resumed agent session holds the stable instruction prefix (daemon prompt +
 * tool contract + client system prompt). When any byte of it changes between
 * turns we must re-send the whole block, which also invalidates the upstream
 * prompt cache for everything downstream of it — including the conversation
 * history. `stable_prompt_cache_miss_reason='stable-prompt-changed'` records
 * THAT this happened; this module records WHICH named input caused it.
 *
 * Attribution is computed over the composer's INPUTS rather than by slicing the
 * composed prompt on its `---` separators. The question a drift event has to
 * answer is "what caused the prefix to move", and the cause is always an input;
 * splitting the output would report which bytes differ but still leave the
 * mapping back to a cause to a human diffing Langfuse traces by hand — which is
 * the manual step this exists to remove.
 *
 * INVARIANT: the sha256 over the whole composed block (`stablePromptHash`) is
 * the only source of truth for cache hit/miss. Section hashes are attribution
 * metadata and must never gate a re-send decision — a section-map bug must be
 * able to mislabel a drift event but never to suppress or fabricate one.
 */

/**
 * Every named input that feeds the stable prefix, grouped into the section it
 * is attributed to. Keys are `composeSystemPrompt` argument names plus the two
 * inputs the caller merges in (`runtimeToolPrompt`, `clientSystemPrompt`).
 *
 * Adding an input to the stable prefix without adding it here does not corrupt
 * the drift signal: the overall hash still moves and the turn is reported as
 * `unattributed`, which is the alarm that this table has fallen behind.
 */
const SECTION_INPUTS = {
  // Auto-extracted personal memory. Known to churn WITHIN a session as the
  // extractor sediments new facts — the dominant first-resume drift cause.
  memory: ['memoryBody', 'memoryHooks'],
  // Project intent: artifact kind, fidelity, speaker-notes/animation intent,
  // plus the derived deck/media/platform signals. Those signals are latched per
  // conversation (#5709) precisely because re-deriving them per turn flipped
  // the prefix mid-session; this section is how a regression there stays
  // visible instead of needing a hand diff of Langfuse traces.
  intent: [
    'metadata',
    'template',
    'freeformDeckSignal',
    'mediaHintSignal',
    'platformHintSignal',
  ],
  // Per-conversation mode (design/plan/chat) and the handoff profile.
  mode: ['sessionMode', 'executionProfile', 'streamFormat'],
  'design-system': [
    'designSystemBody',
    'designSystemTitle',
    'designSystemUsageMd',
    'designSystemTokensCss',
    'designSystemComponentsManifest',
    'designSystemFixtureHtml',
    'designSystemPullIndex',
    'designSystemImportMode',
  ],
  skill: ['skillBody', 'skillName', 'skillMode', 'skillModes'],
  craft: ['craftBody', 'craftSections'],
  plugin: ['pluginBlock', 'activeStageBlocks'],
  instructions: ['userInstructions', 'projectInstructions'],
  locale: ['locale'],
  media: [
    'mediaExecution',
    'byokMediaDefaults',
    'audioVoiceOptions',
    'audioVoiceOptionsError',
  ],
  critique: ['critique', 'critiqueBrand', 'critiqueSkill'],
  // Dormant by design: #5336 moved the connected-MCP directive out of the
  // cached prefix into the per-turn slice, because it reflects live OAuth token
  // validity and flipped mid-conversation. The key is absent today, so this
  // section never reports — it exists so that re-admitting that input (or any
  // future live-token input under this name) is attributed on sight rather than
  // rediscovered by hand.
  mcp: ['connectedExternalMcp'],
  runtime: [
    'agentId',
    'includeCodexImagegenOverride',
    'promptCoreVariant',
    'runtimeToolPrompt',
  ],
  'client-system': ['clientSystemPrompt'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type StableSectionName = keyof typeof SECTION_INPUTS;

export const STABLE_SECTION_NAMES = Object.keys(SECTION_INPUTS) as StableSectionName[];

/** Section name -> short digest of that section's inputs for one turn. */
export type StableSectionHashes = Readonly<Partial<Record<StableSectionName, string>>>;

/**
 * `unattributed` means the composed prefix changed but no tracked section did:
 * the input that moved is missing from SECTION_INPUTS. It is a coverage gap
 * report, not a drift cause.
 */
export type StableChangedSection = StableSectionName | 'unattributed';

/**
 * JSON with object keys sorted at every level, so two structurally equal inputs
 * hash equal regardless of the order their keys were built in.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return val;
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    );
  });
}

/**
 * 64-bit digest. These are only ever compared for equality against another
 * digest of the same input shape, so a full sha256 would spend storage and
 * event payload on collision resistance nothing here needs.
 */
function digest(value: unknown): string {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex').slice(0, 16);
}

/**
 * Hash each section of the stable prefix from the composer inputs.
 *
 * A section whose inputs are all absent is omitted rather than hashed as empty,
 * so a section appearing or disappearing between turns (memory extracted for
 * the first time, a design system detached) reads as a change.
 */
export function computeStableSectionHashes(
  inputs: Readonly<Record<string, unknown>>,
): StableSectionHashes {
  const hashes: Partial<Record<StableSectionName, string>> = {};
  for (const section of STABLE_SECTION_NAMES) {
    const present = SECTION_INPUTS[section].filter((key) => inputs[key] !== undefined);
    if (present.length === 0) continue;
    hashes[section] = digest(present.map((key) => [key, inputs[key]]));
  }
  return hashes;
}

/**
 * Sections whose hash differs between the seeding turn and this turn, in
 * declaration order.
 *
 * Returns an empty list when nothing tracked moved. Callers that already know
 * the overall prefix changed should read that emptiness as `unattributed`
 * rather than as "no drift" — see `describeChangedStableSections`.
 */
export function diffStableSections(
  storedSections: StableSectionHashes | null | undefined,
  currentSections: StableSectionHashes,
): StableSectionName[] {
  const stored = storedSections ?? {};
  return STABLE_SECTION_NAMES.filter((name) => stored[name] !== currentSections[name]);
}

/**
 * The changed-section list to report for a turn already known to have drifted.
 *
 * Never returns an empty list: a drift we cannot attribute is reported as
 * `unattributed` so the coverage gap shows up in telemetry instead of looking
 * like a clean turn.
 */
export function describeChangedStableSections(
  storedSections: StableSectionHashes | null | undefined,
  currentSections: StableSectionHashes,
): StableChangedSection[] {
  const changed = diffStableSections(storedSections, currentSections);
  return changed.length > 0 ? changed : ['unattributed'];
}

/** Serialize for the `agent_sessions.stable_prompt_sections` column. */
export function serializeStableSections(sections: StableSectionHashes): string {
  return JSON.stringify(sections);
}

/**
 * Parse a stored section map. Unknown or malformed entries are dropped rather
 * than thrown on: a row written by a newer/older daemon must degrade to
 * `unattributed`, never break the turn.
 */
export function parseStableSections(raw: unknown): StableSectionHashes | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const hashes: Partial<Record<StableSectionName, string>> = {};
  for (const name of STABLE_SECTION_NAMES) {
    const value = (parsed as Record<string, unknown>)[name];
    if (typeof value === 'string' && value.length > 0) hashes[name] = value;
  }
  return hashes;
}
