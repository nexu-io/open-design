/**
 * Prompt composer. The base is the OD-adapted "expert designer" system
 * prompt (see ./official-system.ts) — a full identity, workflow, and
 * content-philosophy charter. Stacked on top:
 *
 *   1. The discovery + planning + huashu-philosophy layer (./discovery.ts)
 *      — interactive question-form syntax, direction-picker fork,
 *      brand-spec extraction, TodoWrite reinforcement, 5-dim critique,
 *      and the embedded `directions.ts` library.
 *   2. The active design system's DESIGN.md (if any) — palette, typography,
 *      spacing rules treated as authoritative tokens.
 *   3. The active skill's SKILL.md (if any) — workflow specific to the
 *      kind of artifact being built. When the skill ships a seed
 *      (`assets/template.html`) and references (`references/layouts.md`,
 *      `references/checklist.md`), we inject a hard pre-flight rule above
 *      the skill body so the agent reads them BEFORE writing any code.
 *   4. For decks (skillMode === 'deck' OR metadata.kind === 'deck'), the
 *      deck framework directive (./deck-framework.ts) is pinned LAST so it
 *      overrides any softer slide-handling wording earlier in the stack —
 *      this is the load-bearing nav / counter / scroll JS / print
 *      stylesheet contract that PDF stitching depends on. We also fire on
 *      the metadata path so deck-kind projects without a bound skill
 *      (skill_id null) still get a framework, instead of having the agent
 *      re-author scaling / nav / print logic from scratch each turn. When
 *      the active skill ships its own seed (skill body references
 *      `assets/template.html`), we defer to that seed and skip the generic
 *      skeleton — the skill's framework wins to avoid double-injection.
 *
 * The composed string is what the daemon sees as `systemPrompt` and what
 * the Anthropic path sends as `system`.
 */
import { renderOfficialDesignerPrompt } from './official-system.js';
import { renderDiscoveryAndPhilosophy, renderSharedFramesBlock } from './discovery.js';
import {
  HOST_CLARIFICATION_GATE,
  PROMPT_INJECTION_RESISTANCE,
  renderPlatformContractsBlock,
  renderSlimCoreCharter,
  renderSlimPlanFoundation,
} from './core-slim.js';
import { renderDirectionIndexBlock, renderDirectionSpecBlock } from './directions.js';
import { renderDeckFrameworkDirective } from './deck-framework.js';
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_VIDEO_GENERATION_MODEL_ID,
  renderMediaGenerationContract,
} from './media-contract.js';
import { IMAGE_MODELS } from '../media/models.js';
import { renderPanelPrompt } from './panel.js';
import {
  defaultCritiqueConfig,
  isCritiqueRunEligible,
  type CritiqueConfig,
} from '@open-design/contracts/critique';
import {
  ASK_MODE_BOUNDARY,
  executionProfileFromStreamFormat,
  HOST_ROLE_MARKER_GUARD,
  HOST_QUESTION_FORM_PROTOCOL,
  INITIAL_SKIP_DISCOVERY_BRIEF_DIRECTIVE,
  PLAN_MODE_BOUNDARY,
  renderApiModeDirective,
  renderAskModeDirective,
  renderDesignSystemPromptBlocks,
  renderDynamicContextModeScope,
  renderInitialExamplePromptDirective,
  renderPlanModeDirective,
  resolveActiveSkillPromptScope,
  renderSlimMemoryBlocks,
  renderUiLocalePrompt,
  type AudioKind,
  type ByokMediaDefaults,
  type ChatSessionMode,
  type ExecutionProfile,
  type MediaExecutionPolicy,
  type MediaSurface,
} from '@open-design/contracts';

// Prepended first in every composed prompt so it wins precedence over all
// later sections, including skill bodies and user/project instructions.

const ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT = 100;
const ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX = 'ElevenLabs voice list could not be loaded';
const SEMANTIC_OUTPUT_FILE_NAMES = `## Semantic output file names

For new user-facing deliverables, choose a short semantic project-relative filename derived from the user's brief, product, screen, or artifact type. Do not call every new artifact \`index.html\`.

Good examples: \`investor-pitch-deck.html\`, \`ai-community-pr-deck.html\`, \`refund-ops-dashboard.html\`, \`pricing-page.html\`, \`screens/ios-checkout.html\`, \`daily-digest.md\`, \`image-manifest.json\`.

When editing an existing artifact, preserve its existing filename unless the user asks for a copy or version. Use \`index.html\` only for fixed runtime conventions or a lightweight launcher/overview: live-artifact generated previews, HyperFrames compositions, static SPA/deploy entry mapping, plugin previews/examples, \`ui_kits/app/index.html\`, or a multi-screen overview that links to semantic screen files. If an active skill or template says to copy a seed to \`index.html\`, adapt the destination to a semantic filename unless the task is one of those fixed-path exceptions.`;
const PROMPT_SAFE_HTTP_STATUS_LABELS: Record<string, string> = {
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'Not Found',
  '429': 'Too Many Requests',
  '500': 'Internal Server Error',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
};

function normalizePromptText(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatElevenLabsVoiceOptionsErrorForPrompt(
  error: string | undefined,
): string | undefined {
  const trimmed = normalizePromptText(error ?? '');
  if (!trimmed) return undefined;

  if (/no ElevenLabs API key/i.test(trimmed)) {
    return `${ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX} because the ElevenLabs API key is missing. Tell the user to configure it in Settings or paste a voice id manually.`;
  }

  const statusMatch = trimmed.match(
    /(?:\((\d{3})(?:\s+([^)]+))?\)|\b(\d{3})(?:\s+([A-Za-z][A-Za-z -]{0,40}))?\b)/,
  );
  if (statusMatch) {
    const statusCode = statusMatch[1] ?? statusMatch[3];
    const statusText = statusCode ? PROMPT_SAFE_HTTP_STATUS_LABELS[statusCode] ?? '' : '';
    const suffix = statusText ? ` ${statusText}` : '';
    return `${ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX} (${statusCode}${suffix}). Tell the user to retry the lookup or paste a voice id manually.`;
  }

  return `${ELEVENLABS_VOICE_OPTIONS_PROMPT_PREFIX}. Tell the user to retry the lookup or paste a voice id manually.`;
}

type ProjectMetadata = {
  kind?: string;
  intent?: string | null;
  fidelity?: string | null;
  speakerNotes?: boolean | null;
  slideCount?: string | null;
  animations?: boolean | null;
  includeLandingPage?: boolean | null;
  includeOsWidgets?: boolean | null;
  templateId?: string | null;
  templateLabel?: string | null;
  platform?: string | null;
  platformTargets?: string[] | null;
  inspirationDesignSystemIds?: string[];
  skipDiscoveryBrief?: boolean | null;
  examplePrompt?: boolean | null;
  examplePromptTitle?: string | null;
  examplePromptBrief?: Record<string, string> | null;
  imageModel?: string | null;
  imageAspect?: string | null;
  imageStyle?: string | null;
  videoModel?: string | null;
  videoLength?: number | null;
  videoAspect?: string | null;
  audioKind?: string | null;
  audioModel?: string | null;
  audioDuration?: number | null;
  voice?: string | null;
  brandId?: string | null;
  brandSourceUrl?: string | null;
  brandDesignSystemId?: string | null;
  promptTemplate?: {
    id?: string | null;
    surface?: 'image' | 'video' | null;
    title?: string | null;
    prompt?: string | null;
    summary?: string | null;
    category?: string | null;
    tags?: string[] | null;
    model?: string | null;
    aspect?: string | null;
    source?: {
      repo?: string | null;
      license?: string | null;
      author?: string | null;
      url?: string | null;
    } | null;
  } | null;
  contextPlugins?: Array<{
    id?: string | null;
    title?: string | null;
    description?: string | null;
  }> | null;
  contextMcpServers?: Array<{
    id?: string | null;
    label?: string | null;
    transport?: string | null;
    url?: string | null;
    command?: string | null;
  }> | null;
  contextConnectors?: Array<{
    id?: string | null;
    name?: string | null;
    provider?: string | null;
    category?: string | null;
    status?: string | null;
    accountLabel?: string | null;
  }> | null;
};
type ProjectTemplate = { name: string; description?: string | null; files: Array<{ name: string; content: string }> };
type AudioVoiceOption = {
  name: string;
  voiceId: string;
  category?: string | null;
  labels?: Record<string, string> | null;
};

type ExclusiveSurfaceMode = 'deck' | 'image' | 'video' | 'audio';

const EXCLUSIVE_SURFACE_MODES = new Set<ExclusiveSurfaceMode>(['deck', 'image', 'video', 'audio']);

export function resolveExclusiveSurface(args: {
  metadata?: ProjectMetadata | undefined;
  skillMode?: ComposeInput['skillMode'] | undefined;
  skillModes?: ComposeInput['skillModes'] | undefined;
}): ExclusiveSurfaceMode | null {
  const activeSkillModes = new Set(
    Array.isArray(args.skillModes)
      ? args.skillModes.filter(Boolean)
      : args.skillMode
        ? [args.skillMode]
        : [],
  );
  const metadataSurface = EXCLUSIVE_SURFACE_MODES.has(args.metadata?.kind as ExclusiveSurfaceMode)
    ? args.metadata?.kind as ExclusiveSurfaceMode
    : null;
  const primarySkillSurface = EXCLUSIVE_SURFACE_MODES.has(args.skillMode as ExclusiveSurfaceMode)
    ? args.skillMode as ExclusiveSurfaceMode
    : null;
  const composedSurfaceModes = Array.from(activeSkillModes).filter((mode): mode is ExclusiveSurfaceMode =>
    EXCLUSIVE_SURFACE_MODES.has(mode as ExclusiveSurfaceMode),
  );

  return metadataSurface
    ?? primarySkillSurface
    ?? (composedSurfaceModes.length === 1 ? composedSurfaceModes[0] ?? null : null);
}

// Deck-ish vocabulary across English and Chinese briefs. Kept deliberately
// generous: a false positive only re-injects the deck framework a freeform
// run would previously have received unconditionally, while a false negative
// means the agent hand-rolls deck scaffolding — so every borderline term
// stays in.
const DECK_INTENT_SIGNAL =
  /\b(slides?|deck|keynote|presentation|pitch\s?deck|ppt(x)?|slideshow|carousel)\b|幻灯|简报|讲稿|演示|路演|汇报|宣讲|课件|讲解|演讲|提案/i;

/**
 * Whether the outgoing user request reads as a slide-deck brief. Gates the
 * ~20K maybe-deck framework injection for freeform (kind=other / no
 * metadata) projects: those runs previously carried the full framework on
 * every turn "just in case". Feed it USER-AUTHORED text only (see
 * `extractUserAuthoredSignalText`) — assistant turns in a packed transcript
 * offer deck vocabulary the user never chose; conversation persistence is
 * the latch's job (`latchConversationIntentSignals`), not the scanner's.
 * Callers that cannot supply the request text should pass undefined to
 * `freeformDeckSignal`, which preserves the legacy always-inject behavior.
 */
export function detectDeckIntentSignal(
  ...texts: Array<string | null | undefined>
): boolean {
  return texts.some(
    (text) => typeof text === 'string' && DECK_INTENT_SIGNAL.test(text),
  );
}

// Media-generation vocabulary across English and Chinese briefs. Same
// generosity policy as DECK_INTENT_SIGNAL: over-firing keeps the dispatch
// hint (status quo), under-firing only costs the ~1.4K hint until the user
// actually mentions media — at which point the transcript-scanned signal
// flips true for the rest of the conversation.
const MEDIA_INTENT_SIGNAL =
  /\b(image|images|photo|picture|video|audio|music|voice(over)?|sound|illustration|logo|banner|poster|icon set|wallpaper|avatar|imagen|midjourney|flux|veo|sora|suno)\b|图片|图像|生成图|配图|插画|海报|壁纸|头像|视频|短片|音频|音乐|配音|音效|表情包/i;

// Platform vocabulary across English and Chinese briefs. Same generosity
// policy as the deck/media signals: over-firing injects a ~1K contracts
// block that classic carried unconditionally, so the failure direction is
// status quo; under-firing loses per-platform delivery detail.
const PLATFORM_INTENT_SIGNAL =
  /\b(ios|iphone|ipad|android|tablet|responsive|mobile app|native app|desktop app|cross[- ]platform|multi[- ]platform)\b|移动端|手机端|安卓|苹果|平板|响应式|跨端|多端|双端/i;

/**
 * Whether the visible conversation names a delivery platform. Backstops the
 * metadata-based gate for PLATFORM_CONTRACTS_BLOCK: freeform projects with
 * no platform metadata but a platform-explicit brief ("做个 iOS app 原型")
 * still need the per-platform delivery contracts classic carried always-on.
 */
export function detectPlatformIntentSignal(
  ...texts: Array<string | null | undefined>
): boolean {
  return texts.some(
    (text) => typeof text === 'string' && PLATFORM_INTENT_SIGNAL.test(text),
  );
}

/**
 * Whether the visible conversation mentions generating media. Gates the
 * MEDIA_DISPATCH_HINT for non-media projects: most runs never generate
 * media, so the generate→wait dispatch hint only ships once the request
 * text (transcript included) shows media vocabulary. Callers that cannot
 * supply the request text pass undefined to `mediaHintSignal`, which
 * preserves the legacy always-inject behavior.
 */
export function detectMediaIntentSignal(
  ...texts: Array<string | null | undefined>
): boolean {
  return texts.some(
    (text) => typeof text === 'string' && MEDIA_INTENT_SIGNAL.test(text),
  );
}

// Genuine transcript turn boundaries are exactly these lines: the web
// transcript builder writes `## <role>` verbatim and escapes any interior
// look-alike line (`escapeTranscriptRoleDelimiters`,
// apps/web/src/providers/daemon.ts), so an unescaped marker line in a packed
// message is always a real boundary.
const TRANSCRIPT_USER_MARKER = '## user';
const TRANSCRIPT_ASSISTANT_MARKER = '## assistant';
const TRANSCRIPT_CONTEXT_WARNING_MARKER = '## context warning';

// A packed transcript (buildDaemonTranscript, apps/web/src/providers/
// daemon.ts) always starts with a role marker or the context-warning header,
// and always carries the latest user turn. Both properties are required
// before treating a message as a transcript: a plain prompt that merely
// QUOTES `## user` mid-text (the quote is not the first content line) must
// keep whole-text scanning — dropping the text before the quote would
// silence the very request the signals exist to detect.
function isPackedTranscriptShape(lines: string[]): boolean {
  if (!lines.includes(TRANSCRIPT_USER_MARKER)) return false;
  const firstContent = lines.find((line) => line.trim().length > 0);
  return (
    firstContent === TRANSCRIPT_USER_MARKER ||
    firstContent === TRANSCRIPT_ASSISTANT_MARKER ||
    firstContent === TRANSCRIPT_CONTEXT_WARNING_MARKER
  );
}
// Mirrors the repo's accepted form-answer header grammar — the shared parser
// in packages/contracts/src/artifacts/od-card.ts (parseFormAnswers) accepts
// em-dash / hyphen / colon separators and the bare `[form answers]` header,
// case-insensitively; the CLI docs show the hyphen form. Narrowing must fire
// for every variant or CLI/manual form-answer turns re-enter the echoed-label
// false-positive path. Grammar parity is pinned by
// tests/prompts/intent-signal-user-text.test.ts.
const FORM_ANSWERS_HEADER = /^\s*\[form answers(?:\s*[—\-:]\s*[^\]]+)?\]\s*$/i;
const FORM_ANSWERS_ANSWER_LINE = /^\s*-\s+[^:]*:\s*(.*)$/;

// `formatFormAnswers` (apps/web/src/artifacts/question-form.ts) echoes each
// question as `- <question label>: <value>`. The label is the FORM's copy,
// not the user's words — the real task-type form carries "For slide decks,
// include speaker notes?" — so only the value part of each answer line may
// feed the intent scan. Whether a gated block is introduced is decided by
// what the user actually answered, not by what the form offered.
function narrowFormAnswerSignalText(body: string): string {
  const lines = body.split('\n');
  const firstContent = lines.find((line) => line.trim().length > 0);
  if (!firstContent || !FORM_ANSWERS_HEADER.test(firstContent)) return body;
  return lines
    .map((line) => {
      if (FORM_ANSWERS_HEADER.test(line)) return '';
      const answer = FORM_ANSWERS_ANSWER_LINE.exec(line);
      return answer ? answer[1] ?? '' : line;
    })
    .join('\n');
}

/**
 * Reduce an outgoing request message to the text the USER actually authored,
 * for intent-signal scanning. The three intent signals gate stable-region
 * prompt blocks, and for transcript-resending clients `message` embeds the
 * full packed conversation — assistant turns included. Assistant copy (most
 * damagingly the turn-1 discovery form's own option copy: «幻灯 / 路演»,
 * "Slide deck / pitch", «iOS / Android / 响应式») must never flip a signal:
 * every flip changes the stable instruction hash and re-sends the whole
 * stable block on resume.
 *
 * - Packed transcript (contains `## user` / `## assistant` marker lines):
 *   returns only the bodies of `## user` sections; `## assistant` sections
 *   and the leading `## context warning` block are dropped entirely.
 * - Plain message (no role markers): returned unchanged (legacy whole-scan).
 * - `[form answers — <id>]` blocks in either shape are narrowed to the value
 *   part of each `- label: value` line (see narrowFormAnswerSignalText).
 */
export function extractUserAuthoredSignalText(
  message: string | null | undefined,
): string {
  if (typeof message !== 'string' || message.length === 0) return '';
  // Marker lines are compared with any trailing CR stripped so CRLF
  // transcripts parse identically to the LF ones the web builder emits.
  const lines = message.split('\n').map((line) =>
    line.endsWith('\r') ? line.slice(0, -1) : line,
  );
  if (!isPackedTranscriptShape(lines)) {
    return narrowFormAnswerSignalText(message);
  }
  const userSections: string[][] = [];
  // null = dropped region: pre-marker text (`## context warning` included)
  // and `## assistant` sections.
  let currentUserSection: string[] | null = null;
  for (const line of lines) {
    if (line === TRANSCRIPT_USER_MARKER) {
      currentUserSection = [];
      userSections.push(currentUserSection);
      continue;
    }
    if (line === TRANSCRIPT_ASSISTANT_MARKER) {
      currentUserSection = null;
      continue;
    }
    currentUserSection?.push(line);
  }
  return userSections
    .map((sectionLines) => narrowFormAnswerSignalText(sectionLines.join('\n')))
    .join('\n\n');
}

export const BASE_SYSTEM_PROMPT = renderOfficialDesignerPrompt('filesystem');

export const SKIP_DISCOVERY_BRIEF_OVERRIDE = INITIAL_SKIP_DISCOVERY_BRIEF_DIRECTIVE;

// Injected into non-media projects so the agent knows how to dispatch
// media generation if the user asks for it mid-session (e.g. "generate an
// image with fal"). Without this, agents in prototype/deck projects try to
// call provider REST APIs directly and ask the user for keys that the daemon
// already holds in .od/media-config.json.
// Kept deliberately compact: this hint is signal-gated on non-media projects,
// so the worked generate→wait bash recipe lives in `od media help`
// (printMediaHelp in cli.ts) and the CLI's own stderr handoff guidance instead
// of the prompt. The hint only
// needs to (1) route the agent to the dispatcher instead of provider APIs,
// (2) state the handoff/exit-code semantics, and (3) pin the behavioral
// rules agents historically fumbled (PowerShell translation, jq, asking
// for API keys, substituting fal-ai/* model paths).
const MEDIA_DISPATCH_HINT = `

---

## Media generation (if asked)

If the user asks you to generate an image, video, or audio file — regardless of which provider or model they mention (fal, Replicate, OpenAI, etc.) — use the daemon dispatcher via your **Bash tool**. Do NOT call provider REST APIs directly.

The daemon injects these env vars into your shell (**POSIX bash — not PowerShell**):

- \`OD_NODE_BIN\`   — absolute path to the Node runtime
- \`OD_BIN\`        — absolute path to the OD CLI script
- \`OD_PROJECT_ID\` — the active project id

Use **POSIX \`$VAR\` syntax** — do NOT translate to PowerShell (\`$env:VAR\`, \`&\` operator):

\`\`\`bash
"$OD_NODE_BIN" "$OD_BIN" media generate \\
  --project "$OD_PROJECT_ID" \\
  --surface <image|video|audio> \\
  --model <model-id> \\
  --prompt "<full prompt>"
\`\`\`

The command exits \`0\` with one line of JSON: \`{"file":{...}}\` when done within ~25s, or \`{"taskId":"..."}\` as a successful handoff for slow models. A \`taskId\` is not completion: run the exact \`media wait\` command the CLI prints on stderr and repeat the newly printed command until exit \`0\` (done) or exit \`5\` (failed); exit \`2\` means still running, not failure. If JSON parsing is needed, use \`python3\`, never \`jq\`.

MODEL_SELECTION_GUIDANCE`;

function renderByokMediaDefaultsHint(defaults?: ByokMediaDefaults): string {
  const lines: string[] = [];
  const imageModel = defaults?.imageModel?.trim();
  const videoModel = defaults?.videoModel?.trim();
  const speechModel = defaults?.speechModel?.trim();
  const speechVoice = defaults?.speechVoice?.trim();
  if (imageModel) lines.push(`- Image model: \`${imageModel}\``);
  if (videoModel) lines.push(`- Video model: \`${videoModel}\``);
  if (speechModel) lines.push(`- Speech model: \`${speechModel}\``);
  if (speechVoice) lines.push(`- Speech voice: \`${speechVoice}\``);
  if (lines.length === 0) return '';
  return `

### Run-scoped BYOK media defaults

The user selected these BYOK media defaults in the chat UI for this run. Use
them when dispatching media unless the current user message explicitly asks for
a different model or voice.
${lines.join('\n')}`;
}

function renderMediaDispatchModelGuidance(defaults?: ByokMediaDefaults): string {
  const imageModel = defaults?.imageModel?.trim();
  const videoModel = defaults?.videoModel?.trim();
  const imagePart = imageModel
    ? `For image generation prefer your configured model: \`${imageModel}\`.`
    : `For image generation use \`${DEFAULT_IMAGE_GENERATION_MODEL_ID}\` by default and \`flux-pro-ultra\` only for an explicit best-quality request.`;
  const videoPart = videoModel
    ? `For video prefer your configured model: \`${videoModel}\`.`
    : `For video use \`${DEFAULT_VIDEO_GENERATION_MODEL_ID}\` by default.`;
  return `${imagePart} ${videoPart} Always pass \`--surface\` explicitly (\`image\`, \`video\`, or \`audio\`). Any \`fal-ai/*\` path (e.g. \`fal-ai/flux/schnell\`, \`fal-ai/wan-i2v\`) is also a valid \`--model\` value for image/video — pass it through as-is without substitution.`;
}

function renderMediaDispatchHint(defaults?: ByokMediaDefaults): string {
  const hint = MEDIA_DISPATCH_HINT
    .replace('MODEL_SELECTION_GUIDANCE', renderMediaDispatchModelGuidance(defaults));
  return `${hint}${renderByokMediaDefaultsHint(defaults)}`;
}

const FILESYSTEM_HANDOFF_OVERRIDE = `

---

## Filesystem handoff

This run uses Open Design's filesystem execution profile. Project files are the source of truth for generated artifacts.

Normal rhythm for artifact work:
1. Start with a short ordinary assistant message or compact \`<od-card>\` that states the locked direction.
2. Use progress tools for planning/status.
3. Create or edit project files through the runtime's native tool-call interface.
4. End with a short ordinary assistant message naming the written file(s) and summarizing the result.

Never type a tool invocation into assistant text as XML, markdown, JSON, or prose; if the runtime cannot call the tool, briefly explain that instead of simulating it.

This tool-call rule does not apply to Open Design UI markup. \`<question-form>\` and \`<od-card>\` are assistant text blocks that the host renders in the UI, not tool calls. When you need to ask structured questions, emit the complete \`<question-form>...</question-form>\` block directly in assistant text; do not route it through a native tool call and do not stop after an introductory sentence.

When you write or edit an HTML file in the project folder through the native file tool, that file is already visible in the user's file panel and preview.

- Do not output generated source code in a \`<artifact type="text/html">...</artifact>\` block.
- Do not duplicate file contents in assistant text after writing them to disk.
- After the final self-check, briefly name the written file and summarize the result instead.
- A filesystem run that emits a source-code \`<artifact>\` is treated as an unexpected fallback by the host.`;

export const buildExamplePromptOverride = renderInitialExamplePromptDirective;

const ACTIVE_DESIGN_SYSTEM_VISUAL_DIRECTION_OVERRIDE = `

---

## Active design system visual direction

Active design system exception: the active design system is the visual direction for this project. Use its DESIGN.md palette, typography, spacing, component rules, and theme tokens as the source of truth for color and mood.

- Do not ask the user to pick a separate theme color, visual direction, palette, typography mood, or direction card.
- Do not emit a direction question-form, a \`direction-cards\` picker, or any visual-direction card while an active design system is present.
- If an earlier discovery answer asks to "Pick a direction for me", treat that as already satisfied by the active design system and continue with the plan.
- When a downstream framework mentions "active direction" or "theme tokens", bind those fields from the active design system instead of the built-in direction library.
`;

export interface ComposeInput {
  agentId?: string | null | undefined;
  includeCodexImagegenOverride?: boolean | undefined;
  streamFormat?: string | undefined;
  skillBody?: string | undefined;
  skillName?: string | undefined;
  skillMode?:
    | 'prototype'
    | 'deck'
    | 'template'
    | 'design-system'
    | 'image'
    | 'video'
    | 'audio'
    | undefined;
  skillModes?: Array<'prototype' | 'deck' | 'template' | 'design-system' | 'image' | 'video' | 'audio'> | undefined;
  designSystemBody?: string | undefined;
  designSystemTitle?: string | undefined;
  // Compiled (machine-readable) form of the active brand's design system,
  // shipped as sibling files to DESIGN.md when available. Both fields are
  // optional; the daemon populates them by default for every brand that
  // ships `tokens.css` / `components.html` (today: `default` and
  // `kami`). `OD_DESIGN_TOKEN_CHANNEL=0` disables the channel as a kill
  // switch. When present they are appended AFTER the DESIGN.md block so
  // prose still sets the high-level voice and the structured form
  // disambiguates token names + worked component shapes.
  //
  // - `designSystemUsageMd`      — optional USAGE.md router that tells
  //                                agents how to consume this package.
  // - `designSystemTokensCss`    — verbatim `tokens.css` :root contract
  //                                that the agent pastes into the
  //                                artifact's <style>.
  // - `designSystemComponentsManifest` — concise structured summary
  //                                      derived from components.html.
  // - `designSystemFixtureHtml`        — verbatim `components.html`
  //                                      fallback when no manifest can
  //                                      be derived.
  // - `designSystemPullIndex`          — lightweight manifest-derived
  //                                      list of richer files available
  //                                      for later pull-channel work.
  // - `designSystemCorePullIndex`      — exact core-file paths available
  //                                      to compact filesystem Ask prompts.
  designSystemUsageMd?: string | undefined;
  designSystemTokensCss?: string | undefined;
  designSystemComponentsManifest?: string | undefined;
  designSystemFixtureHtml?: string | undefined;
  designSystemPullIndex?: string | undefined;
  designSystemCorePullIndex?: string | undefined;
  designSystemImportMode?: 'normalized' | 'hybrid' | 'verbatim' | undefined;
  // Craft references the active skill opted into via `od.craft.requires`.
  // The daemon resolves the slug list to file contents and concatenates
  // them with section headers; we inject them between the DESIGN.md and
  // the skill body. Explicit DESIGN.md visual decisions override aesthetic
  // craft defaults; objective quality gates still apply.
  craftBody?: string | undefined;
  craftSections?: string[] | undefined;
  // Markdown built from the user's auto-memory store
  // (<dataDir>/memory/*.md). Folded in before the active design system so
  // tone/voice/preferences extracted from past chats win over the
  // built-in identity charter but still defer to the brand's hard tokens
  // and the active skill's workflow. Empty/undefined skips the block.
  memoryBody?: string | undefined;
  // Per-hook switches for the two-loop memory feature, mirrored from the
  // memory config (`profileEnabled` / `rewriteEnabled` / `verifyEnabled`).
  // An absent object — or an absent field — is treated as TRUE so callers
  // with no memory config wired (and the contracts/BYOK fallback) keep the
  // loops on by default. `rewrite` drives the PRE intent-gateway task-brief
  // card; `verify` drives the POST self-verify scorecard. `profile` is
  // consumed by the memory-body composer; it is accepted here only so the
  // same object threads through unchanged.
  memoryHooks?: { profile?: boolean; rewrite?: boolean; verify?: boolean } | undefined;
  // Project-level metadata captured by the new-project panel. Drives the
  // agent's understanding of artifact kind, fidelity, speaker-notes intent
  // and animation intent. Missing fields here are exactly what the
  // discovery form should re-ask the user about on turn 1.
  metadata?: ProjectMetadata | undefined;
  // The template the user picked in the From-template tab, when present.
  // Snapshot of HTML files that the agent should treat as a starting
  // reference rather than a fixed deliverable.
  template?: ProjectTemplate | undefined;
  // Provider voice choices fetched by the daemon/web before composing the
  // prompt. Used for ElevenLabs speech discovery so the agent can render
  // a select question-form instead of asking the user to paste raw ids.
  audioVoiceOptions?: AudioVoiceOption[] | undefined;
  // When voice discovery fails, surface the error reason so the agent
  // can tell the user why the dropdown is unavailable instead of
  // pretending there were simply no voices.
  audioVoiceOptionsError?: string | undefined;
  // When present and enabled, the Critique Theater protocol addendum is
  // concatenated to the end of the composed prompt. Omitting this field
  // (or passing cfg.enabled === false) preserves legacy behavior unchanged.
  critique?: CritiqueConfig | undefined;
  // Brand name and DESIGN.md body. Required when critique is enabled;
  // ignored when critique is disabled or omitted.
  critiqueBrand?: { name: string; design_md: string } | undefined;
  // Skill identifier. Required when critique is enabled;
  // ignored when critique is disabled or omitted.
  critiqueSkill?: { id: string } | undefined;
  // Optional `## Active plugin` / `## Plugin inputs` block. The daemon's
  // plugin module renders this from an AppliedPluginSnapshot; we splice
  // it in after the active skill so the plugin description sits next to
  // its companion skill body in the prompt. Pass undefined when no
  // plugin is bound to the run.
  pluginBlock?: string | undefined;
  // Plan §3.L2 / spec §23.4 — pre-rendered `## Active stage: <id>`
  // blocks (one per pipeline stage active for the run). The daemon's
  // pipeline runner builds these from `loadAtomBodies()` +
  // `renderActiveStageBlock()` when the OD_BUNDLED_ATOM_PROMPTS env
  // flag is set; otherwise this stays undefined and the prompt
  // composer's hard-coded constants keep their precedence (back-compat).
  activeStageBlocks?: ReadonlyArray<string> | undefined;
  // Free-form instructions the user set at the global (user-level)
  // settings panel. Injected after personal memory and before the
  // project-level instructions.
  userInstructions?: string | undefined;
  // Free-form instructions the user set on this specific project.
  // Injected after user-level instructions and before the design system.
  projectInstructions?: string | undefined;
  // UI locale selected by the client. User-visible generated form copy
  // must follow this locale even when the user's initial prompt is brief.
  locale?: string | undefined;
  // Per-conversation mode. Design mode keeps the artifact-first agent
  // workflow; Plan mode creates an editable source-of-truth document first;
  // chat mode keeps the same context/tools but answers like a standard
  // multi-turn assistant unless the user explicitly asks to build.
  sessionMode?: ChatSessionMode | undefined;
  // True only for the first assistant-producing turn in the project. Initial
  // gallery/automation discovery overrides must not persist into later edits
  // or new conversations merely because their metadata remains on the project.
  isInitialProjectTurn?: boolean | undefined;
  // Run-scoped media policy. Defaults to enabled when omitted so existing
  // local OD behavior keeps the same media prompt contract.
  mediaExecution?: MediaExecutionPolicy | undefined;
  // Run-scoped BYOK media defaults selected in the chat UI.
  byokMediaDefaults?: ByokMediaDefaults | undefined;
  // Explicit handoff profile. Filesystem runs write project files through
  // native tools; text_artifact runs (BYOK/plain) deliver source through
  // assistant-text <artifact> blocks.
  executionProfile?: ExecutionProfile | undefined;
  // Whether the outgoing request text reads as a slide-deck brief (see
  // `detectDeckIntentSignal`). Only consulted for the freeform maybe-deck
  // branch: `false` skips the ~20K conditional framework injection,
  // `true` keeps it. Missing/false skips it. Deck-kind projects ignore this — their
  // framework is unconditional.
  freeformDeckSignal?: boolean | undefined;
  // Which always-on Design doctrine core to compose. `slim` is the default.
  // Explicit `classic` keeps the legacy DISCOVERY_AND_PHILOSOPHY +
  // designer-charter stack for Design-mode rollback only; Ask, Plan, and media
  // always retain their newer mode-specific contracts. `slim` swaps the Design
  // doctrine for the single rewritten charter in
  // `core-slim.ts` (every rule stated once, explicit precedence ladder,
  // ~6x smaller); the tail overrides it absorbed (filesystem handoff,
  // active-DS direction, mid-conversation clarifying questions) are then
  // skipped. OD_PROMPT_CORE=classic opts out for Design runs only.
  promptCoreVariant?: 'classic' | 'slim' | undefined;
  // Whether the visible conversation mentions generating media (see
  // `detectMediaIntentSignal`). Only consulted for non-media projects:
  // `false` skips the MEDIA_DISPATCH_HINT, `true`/`undefined` keep it.
  // Media surfaces always get the full media contract regardless.
  mediaHintSignal?: boolean | undefined;
  // Whether the visible conversation names a delivery platform (see
  // `detectPlatformIntentSignal`). ORed with the metadata-based platform
  // gate for PLATFORM_CONTRACTS_BLOCK under slim; absent = metadata only.
  platformHintSignal?: boolean | undefined;
}

export function composeSystemPrompt({
  agentId,
  includeCodexImagegenOverride = true,
  skillBody,
  skillName,
  skillMode,
  skillModes,
  designSystemBody,
  designSystemTitle,
  designSystemUsageMd,
  designSystemTokensCss,
  designSystemComponentsManifest,
  designSystemFixtureHtml,
  designSystemPullIndex,
  designSystemCorePullIndex,
  designSystemImportMode,
  craftBody,
  craftSections,
  memoryBody,
  memoryHooks,
  metadata,
  template,
  audioVoiceOptions,
  audioVoiceOptionsError,
  critique,
  critiqueBrand,
  critiqueSkill,
  pluginBlock,
  activeStageBlocks,
  streamFormat,
  locale,
  sessionMode,
  isInitialProjectTurn = true,
  userInstructions,
  projectInstructions,
  mediaExecution,
  byokMediaDefaults,
  executionProfile,
  freeformDeckSignal,
  promptCoreVariant = 'slim',
  mediaHintSignal,
  platformHintSignal,
}: ComposeInput): string {
  // Slim core collapses the discovery layer + designer charter + their tail
  // overrides into one charter document. Explicit classic keeps the legacy
  // layered composition as a Design-only comparison and rollback path.
  const isAskModeEarly = sessionMode === 'chat';
  const resolvedExecutionProfile =
    executionProfile ?? executionProfileFromStreamFormat(streamFormat);
  // Media surfaces (image / video / audio) must be resolved BEFORE the head
  // is built: the slim design charter owns optional design clarification and
  // HTML handoff, which are mutually exclusive with the media-generation
  // contract that is the sole workflow authority on these runs (classic
  // guaranteed this by gating its discovery layer on the same signal).
  const resolvedExclusiveSurfaceEarly = resolveExclusiveSurface({
    metadata,
    skillMode,
    skillModes,
  });
  const resolvedMediaSurfaceEarly: MediaSurface | null =
    resolvedExclusiveSurfaceEarly === 'image'
    || resolvedExclusiveSurfaceEarly === 'video'
    || resolvedExclusiveSurfaceEarly === 'audio'
      ? resolvedExclusiveSurfaceEarly
      : null;
  const isMediaSurfaceEarly = resolvedMediaSurfaceEarly !== null;
  const isClassicDesignCore =
    promptCoreVariant === 'classic'
    && !isAskModeEarly
    && sessionMode !== 'plan'
    && !isMediaSurfaceEarly;
  const isSlimCore = !isClassicDesignCore;
  const isSlimPlanHead = isSlimCore && sessionMode === 'plan';
  const isSlimCharterHead =
    isSlimCore && !isAskModeEarly && !isMediaSurfaceEarly && !isSlimPlanHead;
  const apiModeDirective = renderApiModeDirective({
    sessionMode,
    mediaSurface: resolvedMediaSurfaceEarly,
  });
  const askModeDirective = renderAskModeDirective(resolvedExecutionProfile);

  // Head ordering differs by variant, following prompt-caching prefix rules
  // (stable content first — see shared prompt-caching guidance):
  // - classic: injection resistance FIRST so no later section can override
  //   it, then mode overrides, then the layered discovery/charter stack.
  // - slim Design: the STATIC charter opens the document (it embeds security
  //   right after Precedence). Slim Plan opens with its compact planning
  //   foundation instead of the HTML build charter. Conversation-stable
  //   overrides (mode, locale) follow, project context after that, and
  //   turn-variable blocks last.
  // Slim ask mode opens with the ask override — it IS the charter for the
  // turn — with the security section reading as its first subsection, so the
  // ask document keeps the same identity-first H1 > H2 hierarchy as design
  // mode. Both blocks are static, so the swap is cache-neutral.
  // Plain-stream (BYOK/API) slim runs put the API-mode override BEFORE the
  // charter: its "every later instruction … is overridden" scope must cover
  // the charter's TodoWrite/render instructions, which classic guaranteed by
  // always composing the override first. Cache-neutral — plain runs use the
  // text_artifact charter variant and form their own prefix family anyway.
  const parts: string[] = isSlimPlanHead
    ? [
        ...(streamFormat === 'plain' ? [apiModeDirective, '\n\n---\n\n'] : []),
        renderSlimPlanFoundation(resolvedExecutionProfile),
        '\n\n---\n\n',
      ]
    : isSlimCharterHead
    ? [
        ...(streamFormat === 'plain' ? [apiModeDirective, '\n\n---\n\n'] : []),
        renderSlimCoreCharter(
          resolvedExecutionProfile,
          { webCloneFidelity: metadata?.intent === 'web-clone' },
        ),
        '\n\n---\n\n',
      ]
    : isSlimCore && isAskModeEarly
      ? [
          // Ask mode on a plain stream still leads with the API override so
          // its "overrides every rule below" scope covers the chat charter,
          // matching classic's authority order (API before CHAT).
          ...(streamFormat === 'plain' ? [apiModeDirective, '\n\n---\n\n'] : []),
          askModeDirective,
          '\n\n---\n\n',
          PROMPT_INJECTION_RESISTANCE,
          '\n\n---\n\n',
        ]
      : isSlimCore
        ? [
            // Slim MEDIA runs (non-ask): no design charter and no Ask charter
            // either — the Ask directive forbids creating media, which would
            // contradict the media-generation contract appended below as the
            // sole workflow authority. Keep classic's skeleton: API override
            // first on plain streams, then injection resistance.
            ...(streamFormat === 'plain' ? [apiModeDirective, '\n\n---\n\n'] : []),
            PROMPT_INJECTION_RESISTANCE,
            '\n\n---\n\n',
          ]
        : [PROMPT_INJECTION_RESISTANCE, '\n\n---\n\n'];
  // The slim charter's plan step is deliberately generic ("use your runtime's
  // plan/todo tool, else a numbered list") so it works on codex / opencode /
  // ACP agents that have no such tool. Claude-family runs (streamFormat
  // 'claude-stream-json': claude, codebuddy, amp) are the only ones with a
  // `TodoWrite` tool the host renders as a live Todos card — name the concrete
  // tool + its UI benefit here, for that family only.
  if (isSlimCharterHead && streamFormat === 'claude-stream-json') {
    parts.push(CLAUDE_PLAN_TOOL_NOTE, '\n\n---\n\n');
  }
  const activeDesignSystemBody = designSystemBody?.trim();
  const activeSkillModes = new Set(
    Array.isArray(skillModes)
      ? skillModes.filter(Boolean)
      : skillMode
        ? [skillMode]
        : [],
  );
  const resolvedExclusiveSurface = resolvedExclusiveSurfaceEarly;
  const resolvedMediaSurface: MediaSurface | null =
    resolvedExclusiveSurface === 'image'
    || resolvedExclusiveSurface === 'video'
    || resolvedExclusiveSurface === 'audio'
      ? resolvedExclusiveSurface
      : null;
  const isMediaSurface = resolvedMediaSurface !== null;
  const resolvedAudioKind: AudioKind | undefined =
    metadata?.audioKind === 'music'
    || metadata?.audioKind === 'speech'
    || metadata?.audioKind === 'sfx'
      ? metadata.audioKind
      : undefined;

  // API/BYOK mode (streamFormat === 'plain'): mirrors the same fix from
  // `@open-design/contracts`'s composer. The daemon hits this path for
  // any plain-stream adapter (e.g. DeepSeek), so without pinning the
  // override above DISCOVERY_AND_PHILOSOPHY here too, those daemon
  // agents still emit the `<todo-list>` / `[读取 X]` pseudo-tool
  // markup described in #313. Keep the wording byte-identical to the
  // contracts copy so both code paths produce the same observable
  // behaviour.
  // Turn-variable blocks (gated on per-message signals) are pushed LAST under
  // slim — after every conversation/project-stable section — so a signal flip
  // mid-conversation only invalidates the cached suffix, not the whole prompt.
  const slimTurnVariableParts: string[] = [];

  if (streamFormat === 'plain' && !isSlimCore) {
    // Slim runs (charter head AND ask head) already composed this first.
    parts.push(apiModeDirective);
    parts.push('\n\n---\n\n');
  }

  // Ask mode (`chat`) is the deliberately bare conversation mode: the
  // The Ask directive below IS the whole charter, and every artifact-oriented
  // block (the ~3k-token discovery layer, direction library, device frames, the
  // full designer charter, deck framework, media contracts, codex imagegen
  // override, critique panel, DS visual-direction override) is gated off so the
  // turn stays cheap. Memory, custom instructions, the active design system,
  // attached skills, plugins, MCP tools, and the clarifying-questions surface
  // are still composed in — Ask mode is light, not amnesiac.
  const isAskMode = sessionMode === 'chat';
  const isPlanMode = sessionMode === 'plan';
  const canExecuteMedia =
    !isAskMode
    && sessionMode !== 'plan'
    && streamFormat !== 'plain'
    && resolvedExecutionProfile === 'filesystem';

  if (sessionMode === 'plan') {
    parts.push(renderPlanModeDirective(resolvedExecutionProfile));
    parts.push('\n\n---\n\n');
  } else if (sessionMode === 'chat' && !isSlimCore) {
    // Slim ask already opened the document with this override (see head).
    parts.push(askModeDirective);
    parts.push('\n\n---\n\n');
  }

  // Skip the HTML-artifact discovery layer for media surfaces (image / video /
  // audio). DISCOVERY_AND_PHILOSOPHY is ~3 000 tokens of rules about question
  // forms, brand extraction, direction pickers, and HTML artifact checklist —
  // none of which apply to media generation. Including it forces the agent to
  // parse and override all of those rules before it can start, adding tokens
  // and LLM inference time. The MEDIA_GENERATION_CONTRACT (pushed below) is
  // the sole workflow authority for these surfaces.
  if (isInitialProjectTurn && !isAskMode && !isPlanMode && metadata?.examplePrompt === true) {
    parts.push(buildExamplePromptOverride(metadata.examplePromptTitle, metadata.examplePromptBrief));
    parts.push('\n\n---\n\n');
  } else if (
    isInitialProjectTurn
    && !isAskMode
    && !isPlanMode
    && metadata?.skipDiscoveryBrief === true
  ) {
    parts.push(SKIP_DISCOVERY_BRIEF_OVERRIDE);
    parts.push('\n\n---\n\n');
  }

  const localePrompt = renderUiLocalePrompt(locale, {
    includeQuickBriefSamples: !isSlimCore,
  });
  if (localePrompt) {
    parts.push(localePrompt);
    parts.push('\n\n---\n\n');
  }

  if (
    !isMediaSurfaceEarly
    && !isAskMode
    && (!isSlimCore || sessionMode !== 'plan')
  ) {
    if (!isSlimCore) {
      parts.push(renderDiscoveryAndPhilosophy(resolvedExecutionProfile), '\n\n---\n\n');
    }
    // Direction library is only useful when the agent must pick a visual
    // direction itself. When an active design system is present it is the
    // visual direction (see ACTIVE_DESIGN_SYSTEM_VISUAL_DIRECTION_OVERRIDE
    // below), so the ~6.7KB direction-card catalogue would just be dead
    // weight the model is told to ignore. Gate it on the composer-visible
    // active-DS signal (stable for the whole session, so the stable-prompt
    // fingerprint stays cacheable).
    if (!activeDesignSystemBody) {
      // Slim carries only the id+label index and the agent pulls the chosen
      // direction's full spec via `od tools directions --id <id>` — but ONLY
      // on filesystem runs. text_artifact runs (BYOK/plain adapters) have no
      // tools to dereference the index, so they keep the full inline library
      // like classic; anything less tells them to bind palettes they cannot
      // fetch. Classic keeps the inline full library everywhere.
      const canPullDirections = resolvedExecutionProfile !== 'text_artifact';
      parts.push(
        isSlimCore && canPullDirections
          ? renderDirectionIndexBlock()
          : renderDirectionSpecBlock(),
        '\n\n---\n\n',
      );
    }
    // Shared device-frame catalogue only applies to multi-device /
    // multi-target projects (same product across desktop+tablet+phone, or
    // multiple app screens side-by-side). A single-surface prototype never
    // uses it. Gate on the composer-visible platform signal (set at project
    // creation, stable for the session → fingerprint stays cacheable). In the
    // classic stack the per-platform contracts live inside
    // DISCOVERY_AND_PHILOSOPHY; the slim core moves them to the conditional
    // PLATFORM_CONTRACTS_BLOCK below so a default single-surface prototype
    // doesn't carry them.
    const isMultiTargetProject =
      metadata?.platform === 'responsive' ||
      metadata?.platformTargets?.includes('responsive') ||
      (metadata?.platformTargets?.length ?? 0) > 1;
    if (isMultiTargetProject) {
      parts.push(renderSharedFramesBlock(), '\n\n---\n\n');
    }
    // Trigger stability decides position. Metadata is fixed at project
    // creation → the block can sit here in the project-stable zone. The
    // conversation-text signal is turn-variable (a mid-session "make it an
    // iOS app" flips it on), so signal-only triggers defer the block to the
    // turn-variable suffix like the deck/media signals — an early insert
    // would break the cached prefix for every section after this line.
    const metadataPlatformSignal =
      isMultiTargetProject ||
      typeof metadata?.platform === 'string' ||
      (metadata?.platformTargets?.length ?? 0) > 0;
    const platformContracts = renderPlatformContractsBlock(resolvedExecutionProfile);
    if (isSlimCore && metadataPlatformSignal) {
      parts.push(platformContracts, '\n\n---\n\n');
    } else if (isSlimCore && (platformHintSignal ?? false)) {
      slimTurnVariableParts.push(`\n\n---\n\n${platformContracts}`);
    }
  }

  // Ask mode skips the multi-thousand-token designer charter entirely — the
  // The Ask directive above is its self-contained identity. Classic
  // Plan/Design keep the official charter; slim Design/Plan already opened
  // with their mode-specific foundation (see head above).
  if (!isAskMode && !isSlimCore) {
    parts.push(
      '# Identity and workflow charter (background)\n\n',
      renderOfficialDesignerPrompt(resolvedExecutionProfile, {
        // Website Clone runs swap the "don't recreate copyrighted designs"
        // guardrail for a faithful-reproduction + pre-deploy-checklist rule —
        // see WEB_CLONE_COPYRIGHT_GUARDRAIL_BULLET. Stable per project, so
        // the stable-prompt fingerprint stays cacheable.
        webCloneFidelity: metadata?.intent === 'web-clone',
      }),
    );
  }

  const dynamicContextModeScope = renderDynamicContextModeScope(sessionMode);
  if (dynamicContextModeScope) {
    parts.push(dynamicContextModeScope, '\n\n---\n\n');
  }

  if (isSlimCore && memoryBody && memoryBody.trim().length > 0) {
    parts.push(
      ...renderSlimMemoryBlocks(
        memoryBody,
        memoryHooks,
        sessionMode,
        resolvedMediaSurface,
      ),
    );
  }

  if (!isSlimCore && memoryBody && memoryBody.trim().length > 0) {
    parts.push(
      `\n\n## Personal memory (auto-extracted from past chats)\n\nThe following facts have been sedimented from this user's previous conversations and edited in the settings panel. Treat them as preferences and context, NOT hard rules: when they collide with the active design system tokens, the brand wins; when they collide with the active skill's workflow, the skill wins. They are still authoritative for tone, voice, terminology, and what the user already told you about themselves and their goals — never re-ask the user about something already captured here.\n\nUse memory as a task-intent gateway. When the user's request is short or underspecified, silently expand it into an internal task brief before acting: infer the task type, user/profile background, project/artifact context, delivery preferences, known feedback meanings, constraints, and validation/finish line. Proceed from that richer brief so the user does not need to repeat setup. Ask a clarifying question only when a critical target, permission, or conflict cannot be resolved from the current request plus memory. Do not dump the full internal brief unless the user asks to inspect it. Expanding intent this way changes only WHAT you know going in; it never shortcuts the standard build flow — you still plan with TodoWrite and still run the anti-slop / brand self-check on every artifact-producing turn.\n\n${memoryBody.trim()}`,
    );

    // Two-loop memory instruction blocks. These pair with the memory body
    // above (Workstream 1A renders a `### Profile` first and a
    // `### Verified rules` last), so they are only meaningful when memory
    // is present. Each loop is independently gated by its config flag; an
    // absent flag defaults ON. The card JSON examples below intentionally
    // use no backticks so they stay literal inside the template strings.
    if ((memoryHooks?.rewrite ?? true)) {
      parts.push(
        `\n\n## Intent gateway — turn short asks into a brief\n\nWhen the user's request is short or underspecified AND memory gives you enough to expand it, silently build an internal task brief (task type, audience, files/artifacts in play, delivery preferences, constraints, and what "done" means) before acting. Surface it as ONE collapsed card at the very start of your reply, then continue with the work without waiting for confirmation:\n\n<od-card type="task-brief">\n{ "summary": "<one line restating the expanded intent>", "fields": [ {"label": "Audience", "value": "…"}, {"label": "Deliverable", "value": "…"}, {"label": "Done means", "value": "…"} ] }\n</od-card>\n\nEmit at most one task-brief per turn. Skip it entirely when the request is already explicit or trivial (a greeting, a yes/no, a tiny edit). If you applied memory but skipped the brief, you may instead emit one compact chip: <od-card type="memory-applied">{ "summary": "Applied your profile and 2 rules", "used": [ {"type": "profile", "name": "Work profile"} ] }</od-card>. Never dump the brief as prose — only as the card.\n\nThe task-brief card REPLACES the turn-1 discovery question-form when memory already makes the intent clear — it does NOT replace the rest of the build flow. On every artifact-producing turn you STILL open with a TodoWrite plan (RULE 3) before writing files and update it live as you work, then run the anti-slop / brand self-check before shipping. The brief only expands intent; it is never the deliverable and never stands in for the TodoWrite plan or the self-check. Skipping the discovery form when intent is already understood is correct; skipping TodoWrite or the anti-slop gate is not.`,
      );
    }

    if ((memoryHooks?.verify ?? true)) {
      parts.push(
        `\n\n## Self-verify against your verified rules\n\nThe **Verified rules** above are enforceable checks, not soft preferences. After you finish producing or editing an artifact, evaluate it against every active rule, FIX any failure in place before ending your turn, then emit one scorecard:\n\n<od-card type="verify-scorecard">\n{ "status": "pass|partial|fail", "summary": "5/6 checks passed · 1 auto-fixed", "rows": [ {"rule": "<the check>", "status": "pass|fail|fixed", "note": "<what was wrong / what you fixed>"} ] }\n</od-card>\n\nPrefer fixing silently over asking. Leave a row as "fail" only when fixing it needs a decision you genuinely cannot make from the request plus memory. The daemon programmatically checks this scorecard after your turn — a missing scorecard or a rule left uncovered on an artifact turn is recorded as an enforcement failure — so always emit it when verified rules apply. Skip the scorecard entirely only when there are no verified rules or the turn produced no artifact.\n\nThe scorecard is ADDITIVE to — never a replacement for — the rest of the end-of-run flow. On an artifact turn you still run the existing anti-slop / brand self-check (the "N/N brand checks passed" gate) and still close with the normal handoff. Order the end of your turn as: (1) finish the anti-slop / brand self-check and fix any failure in place, (2) emit the verify-scorecard card, (3) close with the normal handoff — a single <artifact> block when this turn wrote a new canonical HTML file, otherwise a brief file-operation summary of what changed and what is still open. The scorecard only checks your verified rules; it does not absorb the anti-slop gate or the end-of-run summary.`,
      );
    }

    parts.push(
      `\n\n## Propose new verified rules from corrections\n\nWhen the user corrects your output in a way that implies a reusable, checkable rule, PROPOSE it — never save it silently. Emit a proposal card the user can Keep, Edit, or Discard:\n\n<od-card type="rule-proposal">\n{ "name": "<short name>", "description": "<one line>", "assertion": "<what must hold>", "check": "<how to verify it>", "rationale": "<why you inferred it>" }\n</od-card>\n\nPropose at most one rule per turn, and only when confident it generalizes beyond the current artifact. Do not claim in prose that a rule was recorded, saved, noted, added to memory, or will be remembered unless this same response includes the rule-proposal card for that rule; the rule becomes saved only after the user clicks Keep.`,
    );
  }

  if (userInstructions && userInstructions.trim().length > 0) {
    parts.push(
      `\n\n## Custom instructions (user-level)\n\nThe user has set the following persistent instructions. Apply them as defaults to every project. When a project-level instruction below contradicts a point here, the project-level version wins.\n\n${userInstructions.trim()}`,
    );
  }

  if (projectInstructions && projectInstructions.trim().length > 0) {
    parts.push(
      `\n\n## Custom instructions (project-level)\n\nThe user has set the following instructions for this specific project. They take precedence over user-level custom instructions whenever both address the same topic (e.g. if user-level says "use spaces" but project-level says "use tabs", use tabs).\n\n${projectInstructions.trim()}`,
    );
  }

  if (activeDesignSystemBody) {
    parts.push(
      ...renderDesignSystemPromptBlocks({
        title: designSystemTitle,
        body: activeDesignSystemBody,
        usageMd: designSystemUsageMd,
        tokensCss: designSystemTokensCss,
        componentsManifest: designSystemComponentsManifest,
        fixtureHtml: designSystemFixtureHtml,
        pullIndex: designSystemPullIndex,
        corePullIndex: designSystemCorePullIndex,
        importMode: designSystemImportMode,
        sessionMode,
        mediaSurface: resolvedMediaSurface,
        executionProfile: resolvedExecutionProfile,
      }),
    );
  }

  if (!isMediaSurface && craftBody && craftBody.trim().length > 0) {
    const sectionLabel =
      Array.isArray(craftSections) && craftSections.length > 0
        ? ` — ${craftSections.join(', ')}`
        : '';
    const craftModeUsage = isAskMode
      ? 'Use the following craft rules as reference for explanation and review. Do not apply them by creating or editing an artifact in Ask mode.'
      : isPlanMode
        ? 'Use the following craft rules as quality and acceptance constraints in the plan. Do not execute their build steps in Plan mode.'
        : 'Use the following craft rules to fill gaps in the active design system and raise execution quality.';
    const craftUsage =
      `${craftModeUsage} Explicit visual decisions in the active DESIGN.md override aesthetic craft defaults, including typography, tracking, palette usage, gradients, radius, and motion. Objective correctness gates such as legibility, contrast, focus visibility, overflow safety, and factual integrity remain binding.`;
    parts.push(
      `\n\n## Active craft references${sectionLabel}\n\n${craftUsage}\n\n${craftBody.trim()}`,
    );
  }

  if (skillBody && skillBody.trim().length > 0) {
    const scope = resolveActiveSkillPromptScope({
      sessionMode,
      mediaSurface: resolvedMediaSurface,
      executionProfile: resolvedExecutionProfile,
    });
    const preflight = scope.derivePreflight ? derivePreflight(skillBody) : '';
    const skillInstruction = `${scope.instruction}${preflight}`;
    const trimmedSkillBody = skillBody.trim();
    const scopedSkillBody = scope.placement === 'after'
      ? `${trimmedSkillBody}\n\n${skillInstruction}`
      : `${skillInstruction}\n\n${trimmedSkillBody}`;
    parts.push(
      `\n\n## Active skill${skillName ? ` — ${skillName}` : ''}\n\n${scopedSkillBody}`,
    );
  }

  if (
    !isAskMode
    && !isSlimCore
    && resolvedExecutionProfile === 'filesystem'
    && !isMediaSurface
  ) {
    parts.push(`\n\n${SEMANTIC_OUTPUT_FILE_NAMES}`);
  }

  if (pluginBlock && pluginBlock.trim().length > 0) {
    parts.push(pluginBlock);
  }

  // Plan §3.L2 / spec §23.4 — splice per-stage atom blocks immediately
  // after the active plugin block. Empty entries are skipped so a
  // pipeline whose stages don't resolve any bundled atom bodies
  // produces zero extra prompt mass. The active-skill body above
  // remains the precedence carrier; these blocks add the stage-by-
  // stage atom guidance that spec §23.3.2 calls out.
  if (
    !isAskMode
    && !isPlanMode
    && !isMediaSurface
    && Array.isArray(activeStageBlocks)
    && activeStageBlocks.length > 0
  ) {
    for (const block of activeStageBlocks) {
      if (typeof block === 'string' && block.trim().length > 0) {
        parts.push(block);
      }
    }
  }

  const metaBlock = renderMetadataBlock(
    metadata,
    template,
    audioVoiceOptions,
    audioVoiceOptionsError,
    isSlimCore ? 'facts' : 'classic',
    sessionMode,
  );
  if (metaBlock) parts.push(metaBlock);

  // Decks have a load-bearing framework (nav, counter, scroll JS, print
  // stylesheet for PDF stitching). Pin it last so it overrides any softer
  // wording earlier in the stack ("write a script that handles arrows…").
  //
  // We fire on either (a) the active skill is a deck skill OR (b) the
  // project metadata declares kind=deck. Case (b) catches projects created
  // without a skill (skill_id null) — without this, a deck-kind project
  // with no bound skill gets neither a skill seed nor the framework
  // skeleton, and the agent writes scaling / nav / print logic from scratch
  // with the same buggy `place-items: center` + transform pattern we keep
  // having to fix at runtime. Skill seeds (when present) win — they
  // already define their own opinionated framework (simple-deck's
  // scroll-snap, guizang-ppt's magazine layout) and re-pinning the generic
  // skeleton would conflict. The skill-seed path takes over via
  // `derivePreflight` above, so we only fire the generic skeleton when no
  // skill seed is on offer.
  const isDeckProject = resolvedExclusiveSurface === 'deck';
  const isFreeformProject = activeSkillModes.size === 0 && (!metadata || metadata.kind === 'other');
  const hasSkillSeed =
    !!skillBody && /assets\/template\.html/.test(skillBody);
  if (!isAskMode && sessionMode !== 'plan' && isDeckProject && !hasSkillSeed) {
    parts.push(`\n\n---\n\n${renderDeckFrameworkDirective(resolvedExecutionProfile)}`);
  } else if (
    !isAskMode &&
    sessionMode !== 'plan' &&
    isFreeformProject &&
    !hasSkillSeed &&
    freeformDeckSignal === true
  ) {
    // Freeform / kind=other projects skip the kind picker entirely and
    // land here. If the user's brief is a deck/keynote/slides ("讲解",
    // "presentation", "make a deck"), the agent used to invent its own
    // scale-to-fit + slide visibility + nav script from scratch and
    // shipped subtle CSS specificity bugs (per-slide layout classes
    // overriding `.slide { display:none }`). Inject the same framework
    // here, prefixed with a one-line conditional so the agent only
    // adopts it when the brief actually is a deck — otherwise the
    // directive is read as background reference and ignored.
    (isSlimCore ? slimTurnVariableParts : parts).push(
      `\n\n---\n\n## If this brief is a slide deck / keynote / presentation\n\nThe user did not pre-select a "Slide deck" surface, but their request may still call for one. **If — and only if — the brief reads as slides, keynote, presentation, deck, PPT, or 讲解, follow the framework below.** Otherwise ignore everything in this section and continue with the freeform output you would have written anyway.\n\n${renderDeckFrameworkDirective(resolvedExecutionProfile)}`,
    );
  }

  if (resolvedMediaSurface && canExecuteMedia) {
    const selectedModel = resolvedMediaSurface === 'image'
      ? metadata?.imageModel
      : resolvedMediaSurface === 'video'
        ? metadata?.videoModel
        : metadata?.audioModel;
    parts.push(renderMediaGenerationContract({
      surface: resolvedMediaSurface,
      model: selectedModel,
      audioKind: resolvedAudioKind,
      includeHyperframesGuide:
        selectedModel === 'hyperframes-html'
        && !skillBody?.includes('npx hyperframes init'),
      mediaExecution,
      byokMediaDefaults,
    }));
  } else if (!resolvedMediaSurface && canExecuteMedia && (mediaHintSignal ?? true)) {
    // Non-media projects (prototype, deck, etc.): inject a lightweight hint
    // so the agent uses `od media generate` if the user asks for an image/video
    // mid-session, rather than hunting for provider API keys in the environment.
    // Gated on the media-intent signal: most conversations never mention
    // media, and the transcript-scanned signal flips the hint on for the
    // rest of the session as soon as one does.
    (isSlimCore ? slimTurnVariableParts : parts).push(
      renderMediaDispatchHint(byokMediaDefaults),
    );
  }

  if (canExecuteMedia && includeCodexImagegenOverride && shouldAllowCodexImagegenOverride(metadata, mediaExecution)) {
    const codexImagegenOverride = renderCodexImagegenOverride(
      agentId,
      metadata,
    );
    if (codexImagegenOverride) {
      parts.push(codexImagegenOverride);
    }
  }

  // Critique Theater is a Design-only plain-stream protocol. Keep this
  // composer gate identical to the server's orchestrator gate: Ask must remain
  // conversational, Plan owns a Markdown handoff, media contracts forbid HTML,
  // and structured adapters cannot be parsed by the v1 critique orchestrator.
  // When eligible, pin the panel last so it overrides softer critique wording.
  const cfg = critique ?? defaultCritiqueConfig();
  if (isCritiqueRunEligible({
    enabled: cfg.enabled,
    hasBrand: critiqueBrand !== undefined,
    hasSkill: critiqueSkill !== undefined,
    sessionMode,
    isMediaSurface,
    streamFormat,
  }) && critiqueBrand && critiqueSkill) {
    parts.push('\n\n' + renderPanelPrompt({ cfg, brand: critiqueBrand, skill: critiqueSkill }));
  }

  // The three classic tail overrides below exist to re-assert rules the classic
  // layered stack states in softer or contradictory forms earlier. The slim
  // core owns in full. Slim re-pins only the concise host clarification gate
  // after dynamic skill/stage content: active-skill workflow has higher design
  // authority, so the late gate keeps mandatory discovery from overriding the
  // host's query-first interruption policy. Ask mode composes no core charter,
  // so it keeps the classic clarifying-questions tail.
  if (!isSlimCore && !isAskMode && activeDesignSystemBody && activeDesignSystemBody.length > 0) {
    parts.push(ACTIVE_DESIGN_SYSTEM_VISUAL_DIRECTION_OVERRIDE);
  }

  // Slim: turn-variable blocks land here, after every stable section. The
  // connected-external-MCP directive is deliberately NOT part of this document
  // anymore: server.ts re-sends it in the per-turn slice because live OAuth
  // token state must stay out of the cached stable prefix.
  parts.push(...slimTurnVariableParts);

  if (isSlimCharterHead) {
    parts.push(`\n\n---\n\n${HOST_CLARIFICATION_GATE}`);
  }

  if (!isSlimCore && resolvedExecutionProfile === 'filesystem') {
    parts.push(FILESYSTEM_HANDOFF_OVERRIDE);
  }

  if (isAskMode) {
    parts.push(`\n\n---\n\n${ASK_MODE_BOUNDARY}`);
  } else if (sessionMode === 'plan') {
    parts.push(`\n\n---\n\n${PLAN_MODE_BOUNDARY}`);
  }

  // Runs without the slim design charter still need the host's ONE
  // clarification surface on turn 1 and later. This includes media and Ask
  // mode, whose workflow-specific sections decide whether a pause is needed;
  // this protocol owns how that pause is presented.
  if (!isSlimCharterHead) parts.push(
    `\n\n---\n\n${HOST_QUESTION_FORM_PROTOCOL}`,
  );

  // Pinned LAST so recency bias reinforces the role-marker prohibition.
  parts.push(`\n\n---\n\n${HOST_ROLE_MARKER_GUARD}`);

  return parts.join('');
}

/**
 * Plain-stream execution rules are rendered by the shared mode-aware
 * `renderApiModeDirective()` so daemon and contracts/BYOK paths cannot drift.
 */
const CLAUDE_PLAN_TOOL_NOTE = `Your plan tool is \`TodoWrite\` — use it for the plan step above; the host renders it as a live Todos card. Mark each item \`in_progress\` when started and \`completed\` as it lands.`;

// Defense-in-depth against Claude Code's synthetic OAuth tools.
//
// When Claude Code's built-in HTTP MCP transport gets a 401 on its first
// initialize (transient propagation lag, edge cache miss, header
// re-canonicalization quirk, etc.), it injects two synthetic tools per
// server — `mcp__<server>__authenticate` and
// `mcp__<server>__complete_authentication` — that drive a per-process
// OAuth dance with a `localhost:<random>/callback` redirect_uri. That
// listener dies with the agent process, so the round-trip never
// completes, and meanwhile the model burns a turn pasting an
// unreachable URL into the chat. By the time the user is back, our
// daemon-issued Bearer is already in `.mcp.json` and the real tools
// (`generate_image`, `models_explore`, …) are reachable on the next
// turn — but the model doesn't know that and keeps escalating the
// fake auth flow.
//
// The fix is to tell the model up front: these specific servers are
// already authenticated by the daemon, do NOT call any
// `*_authenticate` / `*_complete_authentication` tool for them. If
// the real tools really are missing, surface that as a separate
// failure instead of pivoting to the synthetic flow.
export function renderConnectedExternalMcpDirective(
  connectedExternalMcp:
    | ReadonlyArray<{ id: string; label?: string | undefined }>
    | undefined,
): string {
  if (!connectedExternalMcp || connectedExternalMcp.length === 0) return '';
  const lines = connectedExternalMcp
    .map((s) => {
      const id = typeof s?.id === 'string' ? s.id.trim() : '';
      if (!id) return null;
      const label = typeof s?.label === 'string' && s.label.trim() ? s.label.trim() : id;
      return `- \`${id}\`${label !== id ? ` (${label})` : ''}`;
    })
    .filter((line): line is string => typeof line === 'string');
  if (lines.length === 0) return '';
  // No leading separator: callers place this in a `---`-joined slice.
  return [
    '## External MCP servers — already authenticated\n\n',
    'The following external MCP servers are already authenticated for this run via an OAuth Bearer token the daemon injected into `.mcp.json`. You can call their real tools directly:\n\n',
    lines.join('\n'),
    '\n\n',
    '**Do NOT call any tool whose name matches `mcp__<server>__authenticate` or `mcp__<server>__complete_authentication` for the servers above.** Those are synthetic fallback tools Claude Code exposes when its first HTTP connect briefly flipped the server into a needs-auth state. The flow they drive (a `localhost:<random>/callback` redirect) cannot complete in this environment, and the real tools (e.g. `generate_image`, `models_explore`, `balance`, …) are already reachable.\n\n',
    'If a real tool actually fails with an auth-related error, report the exact tool name and error text and stop — the user will reconnect the server in Settings → External MCP. Do not retry by invoking any `*_authenticate` tool.\n',
  ].join('');
}

const CODEX_IMAGEGEN_MODEL_IDS = new Set(
  IMAGE_MODELS.filter(
    (model) =>
      model?.provider === 'openai' &&
      typeof model?.id === 'string' &&
      model.id.startsWith('gpt-image-'),
  ).map((model) => model.id),
);

export function resolveCodexImagegenModelId(
  metadata: ProjectMetadata | undefined,
): string {
  const imageModel =
    typeof metadata?.imageModel === 'string' ? metadata.imageModel.trim() : '';
  return CODEX_IMAGEGEN_MODEL_IDS.has(imageModel) ? imageModel : '';
}

export function shouldRenderCodexImagegenOverride(
  agentId: string | null | undefined,
  metadata: ProjectMetadata | undefined,
): boolean {
  const normalizedAgentId =
    typeof agentId === 'string' ? agentId.trim().toLowerCase() : '';
  return (
    normalizedAgentId === 'codex' &&
    metadata?.kind === 'image' &&
    resolveCodexImagegenModelId(metadata).length > 0
  );
}

function shouldAllowCodexImagegenOverride(
  metadata: ProjectMetadata | undefined,
  mediaExecution: MediaExecutionPolicy | undefined,
): boolean {
  const mode = mediaExecution?.mode ?? 'enabled';
  if (mode !== 'enabled') return false;
  if (
    Array.isArray(mediaExecution?.allowedSurfaces) &&
    mediaExecution.allowedSurfaces.length > 0 &&
    !mediaExecution.allowedSurfaces.includes('image')
  ) {
    return false;
  }
  const model = resolveCodexImagegenModelId(metadata);
  if (
    model &&
    Array.isArray(mediaExecution?.allowedModels) &&
    mediaExecution.allowedModels.length > 0 &&
    !mediaExecution.allowedModels.includes(model)
  ) {
    return false;
  }
  return true;
}

export function renderCodexImagegenOverride(
  agentId: string | null | undefined,
  metadata: ProjectMetadata | undefined,
): string {
  if (!shouldRenderCodexImagegenOverride(agentId, metadata)) {
    return '';
  }
  const imageModel = resolveCodexImagegenModelId(metadata);

  return `

---

## Codex built-in imagegen override (load-bearing — Codex only)

The active agent is Codex and this image project selected \`${imageModel}\`.
For this specific case, use Codex's built-in image generation capability
instead of \`"$OD_NODE_BIN" "$OD_BIN" media generate\` for the first generation
attempt. This is an intentional exception to the media generation contract and
the active image skill's dispatcher wording.

Do not require, request, or mention \`OPENAI_API_KEY\` before trying the
built-in path. Reuse the project metadata, reference prompt template, aspect
ratio, style notes, and the user's current brief to form the final image
prompt. Generate the image with Codex built-in imagegen, then use the actual
output path returned by the built-in imagegen result as the source file first.
Only if the built-in result does not return a usable path should you search
\`\${CODEX_HOME:-$HOME/.codex}/generated_images/.../ig_*.png\` as a fallback
source. Never leave a project-referenced asset only under \`$CODEX_HOME\`.

When the user asked for one image, produce exactly one final project image
file. If Codex built-in imagegen returns multiple candidate files, previews, or
variants, select the single best match and import only that file into
\`$OD_PROJECT_DIR\`. Do not copy every generated variant, do not keep multiple
final image files, and do not present multiple outputs unless the user
explicitly asked for variants or more than one image.

Copy or move the selected generated file into \`$OD_PROJECT_DIR\` with a short
descriptive filename, then verify the exact destination file exists under
\`$OD_PROJECT_DIR\` before claiming success. If reading the source path,
creating the destination directory, copying/moving, or verifying the copied
asset fails, report the exact source path, destination path, and access/copy
error. Do not claim success, silently fall back, or ask about OpenAI/Azure
fallback after a generated image exists but the project copy fails; stop after
reporting the failure unless the user explicitly chooses fallback in a later
turn, because fallback may create a different image.

After the file exists under \`$OD_PROJECT_DIR\`, reply with the project-local
filename and a short summary of the prompt used.

If Codex built-in imagegen is unavailable or generation fails before producing
an image, surface the actual failure message and ask the user for one-time
confirmation before falling back to the existing OpenAI/Azure API-key provider
path via \`"$OD_NODE_BIN" "$OD_BIN" media generate --surface image --model ${imageModel}\`.
Do not silently fall back.`;
}

// `style: 'facts'` (slim core) keeps general project fields factual. Explicit
// media, live-artifact, and brand-extraction selections may still carry their
// narrow workflow meaning. The broad doctrine prose the classic variant grew
// here (responsive contract, cross-platform rule, and prototype delivery
// rules) is owned by the slim charter, mode directives, and
// PLATFORM_CONTRACTS_BLOCK instead.
function renderMetadataBlock(
  metadata: ProjectMetadata | undefined,
  template: ProjectTemplate | undefined,
  audioVoiceOptions: AudioVoiceOption[] | undefined,
  audioVoiceOptionsError: string | undefined,
  style: 'classic' | 'facts' = 'classic',
  sessionMode?: ChatSessionMode | undefined,
): string {
  const factsOnly = style === 'facts';
  if (!metadata) return '';
  const askContextOnly = factsOnly && sessionMode === 'chat';
  const planContextOnly = factsOnly && sessionMode === 'plan';
  const unknownValue = (classicValue: string): string => factsOnly ? '(unknown)' : classicValue;
  const lines: string[] = [];
  lines.push('\n\n## Project metadata');
  lines.push(
    factsOnly
      ? 'Structured choices from project creation. Known fields are authoritative. A missing field is an unresolved fact, not a mandatory question: infer a safe default from the query and applicable workflow, and ask only if that workflow says the decision is material.'
      : 'These are the structured choices the user made (or skipped) when creating this project. Treat known fields as authoritative; for any field marked "(unknown — ask)" you MUST include a matching question in your turn-1 discovery form.',
  );
  lines.push('');
  lines.push(`- **kind**: ${metadata.kind}`);
  if (metadata.platform) {
    lines.push(`- **platform**: ${metadata.platform}`);
  } else if (metadata.kind === 'prototype' || metadata.kind === 'template' || metadata.kind === 'other') {
    lines.push(`- **platform**: ${unknownValue('(unknown — ask: responsive web, desktop web, iOS app, Android app, tablet app, or desktop app?)')}`);
  }
  if (Array.isArray(metadata.platformTargets) && metadata.platformTargets.length > 0) {
    lines.push(`- **platformTargets**: ${metadata.platformTargets.join(', ')}`);
  }
  if (!factsOnly && (metadata.platform === 'responsive' || metadata.platformTargets?.includes('responsive'))) {
    lines.push(
      '- **responsive web contract**: `responsive` means one web product experience that adapts across modern browser/device ranges, not only legacy desktop/tablet/mobile buckets. It is not an iOS app, Android app, or native tablet app target. Show responsive behavior through real product layout changes; do not render viewport labels as user-facing product content. Cover 2025–2026 breakpoints: mobile compact 360px, mobile standard 390–430px, foldable/small tablet 600–744px, tablet portrait 768–834px, tablet landscape/large tablet 1024–1180px, laptop 1280–1366px, desktop 1440–1536px, and wide 1920px. Use fluid `clamp()` scales, container queries where useful, and explicit layout changes at semantic thresholds. Verify no horizontal scroll at 360px, 390px, 430px, 600px, 768px, 820px, 1024px, 1366px, 1440px, and 1920px unless the brief explicitly asks for a pan/board canvas.',
    );
  }
  if (!factsOnly && (metadata.platformTargets?.length ?? 0) > 1) {
    lines.push(
      '- **cross-platform deliverable rule**: each selected target keeps the same product goal but MUST be delivered as its own product screen/file when more than one concrete target is selected. Use clear files such as `landing.html` (if enabled), `mobile-ios.html`, `mobile-android.html`, `tablet.html`, `desktop.html`, plus shared `css/` and `js/` when useful. `index.html` may be a launcher/overview that links to these files, but it must not be the only place where mobile/tablet/desktop designs live. Do not collapse cross-platform work into a single tabbed demo, selector UI, comparison board, platform map, or labelled documentation section inside one mock product page.',
    );
  }
  if (!factsOnly && (metadata.kind === 'prototype' || metadata.kind === 'template' || metadata.kind === 'other')) {
    lines.push(
      '- **screen-file-first rule**: each distinct user-facing screen or surface MUST be delivered as its own HTML file unless the user explicitly asks for a single-page scroll or single-file artifact. Do not combine landing pages, product app screens, dashboards, history, pricing, settings, mobile app, tablet app, desktop app, or OS widget surfaces into one long page. Use `index.html` as a launcher/overview that links to screen files when more than one screen exists; it may summarize the product and show screen cards, but it must not contain the full design for every screen.',
    );
    lines.push(
      '- **product-realism rule**: final artifacts must look like real end-user product UI. Do not render project metadata, screen counts, target counts, state counts, "demo only" labels, "settings" panels for choosing platforms, "full design target" badges, viewport/device selector controls, theme/style knobs, platform output maps, behavior-spec sections, or design-process cards inside the product unless the user explicitly asks for a design spec/dashboard. Any navigation/tabs inside the artifact must be real product navigation, not designer controls for switching generated mockups.',
    );
    lines.push(
      '- **visual-system rule**: when the user does not specify colors, layout, or visual direction, you must still make an intentional product-appropriate visual system. Infer a palette from the product category and audience with at least: neutral surface tokens, a primary action color, a secondary/domain accent, and status colors. Avoid plain monochrome/unstyled greyscale outputs. Use tasteful gradients, illustrations, iconography, device/product mockups, and colored state moments where they clarify the product, while still avoiding generic beige/peach/pink/brown AI washes.',
    );
    lines.push(
      '- **app-specific modules rule**: include domain-specific in-app modules/components by default (cards, panels, controls, charts, lists, quick actions, status modules, mini players, checkout/cart summaries, etc. as appropriate). These are product UI modules, not OS home-screen widgets. Give each major module a clear purpose, states, and responsive behavior instead of generic card grids.',
    );
    lines.push(
      '- **CJX-ready UX rule**: the artifact must be implementation-ready, not a static screenshot. Structure CSS tokens/components/responsive sections clearly; include real JavaScript behavior for meaningful UX such as tabs, dialogs, drawers, filters, generation/copy actions, validation, playback controls, or state transitions. If keeping a self-contained semantic HTML file, put the CSS/JS in clearly labelled blocks; for complex UX, generate `css/` and `js/` files when useful.',
    );
    lines.push(
      '- **interaction-fidelity rule**: when the requested screen includes user input, generation, copying, validation, login, checkout, filtering, or any action verb, build real interactive controls for that screen. Do not substitute static text rows, prefilled-only mockups, screenshot-like device frames, or decorative state cards for editable inputs and working actions.',
    );
    lines.push(
      '- **artifact-output rule**: when you generate an HTML artifact, keep conversational prose concise and product-facing. Do not dump the full raw HTML source back into chat; the artifact/file is the source of truth and the assistant message should only summarize the result.',
    );
  }
  if (factsOnly && metadata.includeLandingPage) {
    lines.push('- **includeLandingPage**: true (separate responsive marketing surface)');
  }
  if (!factsOnly && metadata.includeLandingPage) {
    lines.push(
      '- **includeLandingPage**: true — create `landing.html` as a separate responsive marketing companion surface in addition to the selected product/app screens. Do not implement the landing page only as a section inside `index.html`, even for responsive-web-only projects. If there is a working product/app screen, create it as a separate file such as `app.html`, `dashboard.html`, or a domain-specific screen name. `index.html` should be a lightweight launcher/overview when multiple files exist. Include hero, value props, product screenshots/device mockups, proof/features, and an appropriate CTA such as waitlist, download, or contact sales.',
    );
  }
  if (factsOnly && metadata.includeOsWidgets) {
    lines.push('- **includeOsWidgets**: true (platform-native home/lock-screen surfaces outside the app)');
  }
  if (!factsOnly && metadata.includeOsWidgets) {
    lines.push(
      '- **includeOsWidgets**: true — add platform-native OS home-screen / lock-screen / quick-access widget surfaces where relevant. These are outside-the-app widgets (for example iOS WidgetKit, Android home screen widget, Live Activity/lock screen, tablet glance panel), not in-app cards. Include realistic widget sizes and direct quick actions for the domain.',
    );
  }
  if (metadata.intent === 'live-artifact') {
    lines.push(askContextOnly
      ? '- **intent**: live-artifact — the selected eventual deliverable is a data-backed live artifact/dashboard/report rather than a one-off static mockup; use this as answer and review context only.'
      : planContextOnly
        ? '- **intent**: live-artifact — plan a data-backed live artifact/dashboard/report, including compact source data and the later `live-artifact` registration handoff.'
        : '- **intent**: live-artifact — the user chose New live artifact. The first output should be a live artifact/dashboard/report, not a one-off static mockup. Prefer the `live-artifact` skill workflow when available, keep source data compact, and register through the daemon live-artifact tool path once that wrapper/tooling is available.');
    lines.push(
      '- **connector-source rule**: if the user names a connector/source (for example Notion) and daemon connector tools are available, list connectors before asking where the data comes from. When the named connector is `connected`, use its read-only tools and ask follow-up questions only for missing topic/page/database details, multiple equally plausible matches, or an unconnected/missing connector.',
    );
  }
  if (metadata.kind === 'brand') {
    lines.push(askContextOnly
      ? '- **brand extraction project**: the saved brand files are source material for explanation and review in Ask mode; do not restart extraction or edit them here.'
      : planContextOnly
        ? '- **brand extraction project**: base the plan on the saved brand files and identify later edits or extraction gaps without modifying the kit in Plan mode.'
        : '- **brand extraction project**: this project was created by the Brands extractor. Treat `brand.json`, `DESIGN.md`, `BRAND-SYSTEM.md`, `tokens.*.json`, `theme.json`, `kit.html`, `kit.dark.html`, and `artifacts/{landing,deck,poster,email,newsletter,form}.html` as the source of truth. Do not restart extraction from scratch unless the user explicitly asks; explain the extracted kit, then iterate the saved files when requested.');
    if (metadata.brandId) lines.push(`- **brandId**: ${metadata.brandId}`);
    if (metadata.brandSourceUrl) lines.push(`- **brandSourceUrl**: ${metadata.brandSourceUrl}`);
    if (metadata.brandDesignSystemId) lines.push(`- **brandDesignSystemId**: ${metadata.brandDesignSystemId}`);
  }

  if (metadata.kind === 'prototype') {
    lines.push(
      `- **fidelity**: ${metadata.fidelity ?? unknownValue('(unknown — ask: wireframe vs high-fidelity)')}`,
    );
  }
  if (metadata.kind === 'deck') {
    lines.push(
      `- **slideCount**: ${metadata.slideCount ?? unknownValue('(unknown — ask only if the Active plugin / Plugin inputs block does not already include slideCount)')}`,
    );
    lines.push(
      `- **speakerNotes**: ${typeof metadata.speakerNotes === 'boolean' ? metadata.speakerNotes : unknownValue('(unknown — ask: include speaker notes?)')}`,
    );
  }
  if (metadata.kind === 'template') {
    lines.push(
      `- **animations**: ${typeof metadata.animations === 'boolean' ? metadata.animations : unknownValue('(unknown — ask: include motion/animations?)')}`,
    );
    if (metadata.templateLabel) {
      lines.push(`- **template**: ${metadata.templateLabel}`);
    }
  }
  if (metadata.kind === 'image') {
    lines.push(
      `- **imageModel**: ${metadata.imageModel ?? unknownValue('(unknown — ask: which image model/provider to use)')}`,
    );
    lines.push(
      `- **aspectRatio**: ${metadata.imageAspect ?? unknownValue('(unknown — ask: 1:1, 16:9 for landscape, 9:16 for portrait)')}`,
    );
    if (metadata.imageStyle) {
      lines.push(`- **styleNotes**: ${metadata.imageStyle}`);
    }
    if (
      metadata.promptTemplate?.title &&
      typeof metadata.promptTemplate.prompt === 'string' &&
      metadata.promptTemplate.prompt.trim().length > 0
    ) {
      lines.push(`- **referenceTemplate**: ${metadata.promptTemplate.title}`);
    }
  }
  if (metadata.kind === 'video') {
    lines.push(
      `- **videoModel**: ${metadata.videoModel ?? unknownValue('(unknown — ask: which video model to use)')}`,
    );
    lines.push(
      `- **lengthSeconds**: ${typeof metadata.videoLength === 'number' ? metadata.videoLength : unknownValue('(unknown — ask: 3s / 5s / 10s)')}`,
    );
    lines.push(
      `- **aspectRatio**: ${metadata.videoAspect ?? unknownValue('(unknown — ask: 16:9, 9:16, 1:1)')}`,
    );
    if (
      metadata.promptTemplate?.title &&
      typeof metadata.promptTemplate.prompt === 'string' &&
      metadata.promptTemplate.prompt.trim().length > 0
    ) {
      lines.push(`- **referenceTemplate**: ${metadata.promptTemplate.title}`);
    }
  }
  if (metadata.kind === 'audio') {
    lines.push(
      `- **audioKind**: ${metadata.audioKind ?? unknownValue('(unknown — ask: music / speech / sfx)')}`,
    );
    lines.push(
      `- **audioModel**: ${metadata.audioModel ?? unknownValue('(unknown — ask: which audio model to use)')}`,
    );
    lines.push(
      `- **durationSeconds**: ${typeof metadata.audioDuration === 'number' ? metadata.audioDuration : unknownValue('(unknown — ask: target duration)')}`,
    );
    if (metadata.voice) {
      lines.push(`- **voice**: ${metadata.voice}`);
    } else if (metadata.audioKind === 'speech') {
      lines.push(`- **voice**: ${unknownValue('(unknown — ask: voice id / accent / pacing)')}`);
    }
    const voiceOptions = shouldRenderElevenLabsVoiceOptions(metadata, audioVoiceOptions)
      ? audioVoiceOptions ?? []
      : [];
    if (voiceOptions.length > 0) {
      lines.push(
        '- **ElevenLabs voice options**: Resolve from the current query when one option is a clear match. If the voice remains a material unresolved decision, emit one localized `<question-form id="elevenlabs-voice">` with top-level `lang` and a required `select` question whose id is `voice` and `allowCustom` is `false`. Localize the surrounding copy and visible descriptions as needed, but preserve each exact option `value` as the `voice_id` passed to `--voice`. Do not ask the user to type an id.',
      );
      if (voiceOptions.length > ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT) {
        lines.push(`- **ElevenLabs voice options**: showing the first ${ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT} of ${voiceOptions.length} available voices.`);
      }
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify({
        options: voiceOptions.slice(0, ELEVENLABS_VOICE_PROMPT_OPTION_LIMIT).map((option) => ({
          label: formatElevenLabsVoiceLabel(option),
          value: option.voiceId,
        })),
      }, null, 2));
      lines.push('```');
    } else {
      const audioVoiceOptionsPromptError = formatElevenLabsVoiceOptionsErrorForPrompt(audioVoiceOptionsError);
      if (audioVoiceOptionsPromptError) {
        lines.push(
          `- **ElevenLabs voice options**: ${audioVoiceOptionsPromptError}`,
        );
      }
    }
    if (metadata.audioKind === 'sfx') {
      lines.push(
        factsOnly
          ? '- **SFX brief factors**: resolve source/action, materials, intensity, acoustic space, timing/tail, loop intent, and avoid constraints from the query; ask only about material gaps. For ElevenLabs keep the prompt under 450 characters (target 180–320), use prompt influence 0.7 for a specified brief, and request looping only for seamless ambience/background/game audio. Do not ask for language or voice for SFX.'
          : '- **SFX discovery**: Ask about the sound source/action, materials, intensity, acoustic space, timing/tail, loop/non-loop, and "avoid" constraints. Do not ask for language or voice for SFX.',
      );
    }
  }

  if (metadata.inspirationDesignSystemIds && metadata.inspirationDesignSystemIds.length > 0) {
    lines.push(
      `- **inspirationDesignSystemIds**: ${metadata.inspirationDesignSystemIds.join(', ')} — the user picked these systems as *additional* inspiration alongside the primary one. Borrow palette accents, typographic personality, or component patterns from them; don't replace the primary system's tokens.`,
    );
  }

  if (Array.isArray(metadata.contextPlugins) && metadata.contextPlugins.length > 0) {
    lines.push('');
    lines.push('### @ plugin context');
    lines.push(
      'The user selected these plugins as additive context via @ mentions. Treat them as requested references to combine with the brief; only the explicit active plugin block, if present, is the executable/pinned plugin snapshot.',
    );
    for (const plugin of metadata.contextPlugins) {
      const id = typeof plugin.id === 'string' ? plugin.id : '';
      const title = typeof plugin.title === 'string' && plugin.title.trim().length > 0
        ? plugin.title.trim()
        : id;
      if (!id && !title) continue;
      const description = typeof plugin.description === 'string' && plugin.description.trim().length > 0
        ? ` — ${plugin.description.trim()}`
        : '';
      lines.push(`- ${title}${id ? ` (\`${id}\`)` : ''}${description}`);
    }
  }

  if (Array.isArray(metadata.contextMcpServers) && metadata.contextMcpServers.length > 0) {
    lines.push('');
    lines.push('### @ MCP context');
    lines.push(
      'The user selected these MCP servers as context. Prefer their tools when mounted and relevant before asking where data should come from.',
    );
    for (const server of metadata.contextMcpServers) {
      const id = typeof server.id === 'string' ? server.id : '';
      const label = typeof server.label === 'string' && server.label.trim().length > 0
        ? server.label.trim()
        : id;
      if (!id && !label) continue;
      const transport = typeof server.transport === 'string' && server.transport.trim().length > 0
        ? ` — ${server.transport.trim()}`
        : '';
      lines.push(`- ${label}${id ? ` (\`${id}\`)` : ''}${transport}`);
    }
  }

  if (Array.isArray(metadata.contextConnectors) && metadata.contextConnectors.length > 0) {
    lines.push('');
    lines.push('### @ connector context');
    lines.push(
      'The user selected these connectors as context. Use daemon connector tools through the OD CLI wrapper when data from these sources is needed; do not ask the user to identify a source that is already selected.',
    );
    for (const connector of metadata.contextConnectors) {
      const id = typeof connector.id === 'string' ? connector.id : '';
      const name = typeof connector.name === 'string' && connector.name.trim().length > 0
        ? connector.name.trim()
        : id;
      if (!id && !name) continue;
      const meta = [connector.provider, connector.status, connector.accountLabel]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' · ');
      lines.push(`- ${name}${id ? ` (\`${id}\`)` : ''}${meta ? ` — ${meta}` : ''}`);
    }
  }

  // Curated prompt template reference for image/video projects. Inlined
  // verbatim (with light truncation) so the agent can borrow structure,
  // mood and phrasing without a separate fetch. The user may have edited
  // the body before clicking Create — those edits land here and are now
  // authoritative for the brief.
  if (
    (metadata.kind === 'image' || metadata.kind === 'video') &&
    metadata.promptTemplate &&
    typeof metadata.promptTemplate.prompt === 'string' &&
    metadata.promptTemplate.prompt.trim().length > 0
  ) {
    const tpl = metadata.promptTemplate;
    lines.push('');
    lines.push(`### Reference prompt template — "${tpl.title ?? 'untitled'}"`);
    const meta = [];
    if (tpl.category) meta.push(`category: ${tpl.category}`);
    if (tpl.model) meta.push(`suggested model: ${tpl.model}`);
    if (tpl.aspect) meta.push(`aspect: ${tpl.aspect}`);
    if (Array.isArray(tpl.tags) && tpl.tags.length > 0) {
      meta.push(`tags: ${tpl.tags.join(', ')}`);
    }
    if (meta.length > 0) lines.push(meta.join(' · '));
    if (tpl.summary) {
      lines.push('');
      lines.push(tpl.summary);
    }
    lines.push('');
    lines.push(
      'The user picked this template as inspiration. Treat it as a structural and stylistic reference: borrow composition, palette cues, lighting language, lens/motion direction, and the level of detail. Adapt the wording to the user\'s actual subject and brief — do NOT generate the template subject verbatim. If a field above is unknown the user wants you to follow the template\'s defaults.',
    );
    // Escape triple-backticks so a user who pastes ``` into the editable
    // template body can't break out of the markdown fence below and inject
    // free-form instructions into the agent's system prompt.
    const safe = (tpl.prompt ?? '').replace(/```/g, '`\u200b`\u200b`');
    const truncated =
      safe.length > 4000
        ? `${safe.slice(0, 4000)}\n… (truncated ${safe.length - 4000} chars)`
        : safe;
    lines.push('');
    lines.push('```text');
    lines.push(truncated);
    lines.push('```');
    if (tpl.source) {
      const author = tpl.source.author ? ` by ${tpl.source.author}` : '';
      lines.push('');
      lines.push(
        `Source: ${tpl.source.repo}${author} — license ${tpl.source.license ?? 'unspecified'}. Preserve attribution if you echo the template language directly.`,
      );
    }
  }

  if (metadata.kind === 'template' && template && template.files.length > 0) {
    lines.push('');
    lines.push(
      `### Template reference — "${template.name}"${template.description ? ` (${template.description})` : ''}`,
    );
    lines.push(
      'These HTML snapshots are what the user wants to start FROM. Read them as a stylistic + structural reference. You may copy structure, palette, typography, and component patterns; you may adapt them to the new brief; do NOT ship them verbatim. The agent should still produce its own artifact, just one that visibly inherits this template\'s design language.',
    );
    for (const f of template.files) {
      // Cap each file at ~12k chars so a giant template doesn't blow out
      // the system prompt budget. The agent gets enough to read structure.
      const truncated =
        f.content.length > 12000
          ? `${f.content.slice(0, 12000)}\n<!-- … truncated (${f.content.length - 12000} chars omitted) -->`
          : f.content;
      lines.push('');
      lines.push(`#### \`${f.name}\``);
      lines.push('```html');
      lines.push(truncated);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

function shouldRenderElevenLabsVoiceOptions(
  metadata: ProjectMetadata,
  audioVoiceOptions: AudioVoiceOption[] | undefined,
): boolean {
  return metadata.kind === 'audio'
    && metadata.audioKind === 'speech'
    && metadata.audioModel === 'elevenlabs-v3'
    && !metadata.voice
    && Array.isArray(audioVoiceOptions)
    && audioVoiceOptions.length > 0;
}

function formatElevenLabsVoiceLabel(option: AudioVoiceOption): string {
  const labels = option.labels && typeof option.labels === 'object'
    ? Object.values(option.labels)
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];
  const bits = [...labels];
  if (bits.length > 0) return `${option.name} — ${bits.join(' · ')}`;
  const category = typeof option.category === 'string' ? option.category.trim() : '';
  return category ? `${option.name} — ${category}` : option.name;
}

/**
 * Detect the seed/references pattern shipped by the upgraded
 * web-prototype / mobile-app / simple-deck / guizang-ppt skills, and
 * inject a hard pre-flight rule that lists which side files to Read
 * before doing anything else. The skill body's own workflow already says
 * this — but skills get truncated under context pressure and the agent
 * sometimes skips Step 0. A short up-front directive helps.
 *
 * Returns an empty string when the skill ships no side files (legacy
 * SKILL.md-only skills) so we don't add noise.
 */
function derivePreflight(skillBody: string): string {
  const refs: string[] = [];
  if (/assets\/template\.html/.test(skillBody)) refs.push('`assets/template.html`');
  if (/references\/layouts\.md/.test(skillBody)) refs.push('`references/layouts.md`');
  if (/references\/themes\.md/.test(skillBody)) refs.push('`references/themes.md`');
  if (/references\/components\.md/.test(skillBody)) refs.push('`references/components.md`');
  if (/references\/checklist\.md/.test(skillBody)) refs.push('`references/checklist.md`');
  // The hyperframes skill ships an html-in-canvas reference next to the
  // VFX catalog blocks. The chat handler at server.ts:4138 routes through
  // this composer (not the contracts copy), so the case must live here
  // too — otherwise live agent runs miss the preflight directive even
  // when the skill body explicitly lists the file.
  if (/references\/html-in-canvas\.md|html-in-canvas\.md/.test(skillBody)) {
    refs.push('`references/html-in-canvas.md`');
  }
  if (refs.length === 0) return '';
  return ` **Pre-flight (do this before any other tool):** Read ${refs.join(', ')} via the path written in the skill-root preamble. The seed template defines the class system you'll paste into; the layouts file is the only acceptable source of section/screen/slide skeletons; the checklist is your P0/P1/P2 gate before final handoff. Skipping this step is the #1 reason output regresses to generic AI-slop.`;
}
