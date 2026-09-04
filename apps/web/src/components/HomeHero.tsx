// Lovart-style centered hero for the entry Home view.
//
// The prompt textarea is the canonical creation surface: the user
// either types freely or selects a type below to reveal matching
// starters, then presses Run / Enter to spawn a project. The hero is
// kept dependency-free (no plugin list / project list) so it can be
// composed with the recent-projects strip and plugins section
// without owning their data lifecycles.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import type {
  ConnectorDetail,
  DesignSystemSummary,
  InputFieldSpec,
  InstalledPluginRecord,
  McpServerConfig,
  WorkspaceCollabContext,
  WorkspaceContextItem,
} from '@open-design/contracts';
import { DesignSystemPicker } from './DesignSystemPicker';
import type { SkillSummary } from '../types';
import { Icon, type IconName } from './Icon';
import { useAnalytics } from '../analytics/provider';
import {
  trackContextLinkResult,
  trackFigmaHelpModalSurfaceView,
  trackHomeChatComposerClick,
  trackProjectReferenceModalSurfaceView,
} from '../analytics/events';
import {
  chipsForGroup,
  HOME_APPLY_TEMPLATE_EVENT,
  orderedCreateChips,
  type ChipGroup,
  type HomeHeroChip,
} from './home-hero/chips';
import { homeHeroChipLabel } from './home-hero/chip-labels';
import { RotatingTitleWord } from './home-hero/RotatingTitleWord';
import { ScenarioArt } from './home-hero/ScenarioArt';
import { useEdgeAutoScroll, EdgeScrollZones } from './home-hero/EdgeAutoScroll';
import {
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import { useI18n, useT } from '../i18n';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';
import {
  examplePresetSeedPrompt,
  pluginPresetQuery,
  renderPluginPresetQuery,
  promptLocaleKind,
  type PromptLocaleKind,
} from './plugins-home/presetSeedPrompt';
import type { Locale } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { readHomeGuideStage, writeHomeGuideStage } from './home-hero/firstRunGuide';
import { curatedPluginPriorityForChip } from './plugins-home/curatedPriority';
import { comparePluginGalleryOrder } from './plugins-home/pluginPopularity';
import { notifyCompletionFeedbackGesture } from '../utils/notifications';
import { inferPluginPreview } from './plugins-home/preview';
import { ComposerPlusMenu, PLUS_SUBMENU_RESOURCE_KIND } from './ComposerPlusMenu';
import { ContextChipHoverCard } from './ContextChipHoverCard';
import { workspaceContextDetailLine, workspaceContextKindLabel } from './workspace-context';
import { FigmaHelpModal } from './FigmaHelpModal';
import { TemplatePicker } from './home-hero/TemplatePicker';
import { TypePillRow } from './home-hero/TypePillRow';
import { LibraryPicker } from './LibraryPicker';
import { assetTitle } from './LibraryAssetMeta';
import { libraryAssetRawUrl } from '../providers/registry';
import type { LibraryAsset } from '@open-design/contracts';
import { WorkingDirPicker } from './WorkingDirPicker';
import {
  ProjectReferenceModal,
  type ProjectReferenceSelection,
} from './ProjectReferenceModal';
import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
  type CaretRect,
} from './composer/LexicalComposerInput';
import { CaretFloatingLayer } from './composer/CaretFloatingLayer';
import { PlaceholderCarousel } from './home-hero/PlaceholderCarousel';
import {
  buildPlaceholderScenarios,
  PLACEHOLDER_BASE_HINT_KEY,
  type PlaceholderScenario,
} from './home-hero/placeholderScenarios';

export interface HomeHeroSubmitHandler {
  (): void;
}

// The homepage prompt input now shares the project composer's Lexical
// editor, so the forwarded handle is a small focus surface rather than a
// raw <textarea>. HomeView drives `focusEnd()` after seeding a prompt
// example / picking a plugin.
export interface HomeHeroHandle {
  focus(): void;
  focusEnd(): void;
  // Flash the send button twice — fired after a plugin Use action or an
  // example-prompt card seeds the composer, to pull the eye to the next step.
  pulseSend(): void;
}

export interface ExamplePromptInfo {
  title: string;
  artifactType: string;
  brief: Record<string, string>;
}

interface Props {
  workspaceContext?: WorkspaceCollabContext | null;
  active?: boolean;
  // Arms the first-run guidance trail (prototype chip → first preset
  // card sheen). Tri-state: true = brand-new user (no projects), false =
  // existing user, undefined = projects still loading — the guide neither
  // arms nor completes until the answer is known.
  firstRunGuide?: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: HomeHeroSubmitHandler;
  // Send pressed on an EMPTY composer while the placeholder carousel is
  // showing: the host seeds the prompt with `scenario.text`, binds the
  // scenario's template, and creates the project -- one-click "just start".
  onSubmitScenario?: (scenario: PlaceholderScenario) => void;
  activePluginTitle: string | null;
  // True when the active plugin chip shows a user-picked plugin (Community card
  // or example-prompt preset) rather than a task-type chip's default plugin —
  // an explicit pick owns its own clear (×) button even when a task chip is set.
  activePluginIsExplicit?: boolean;
  activePluginRecord?: InstalledPluginRecord | null;
  activeChipId: string | null;
  // Prototype's selected second-level scene is owned by HomeView so action
  // metadata and persistence stay aligned with the visible filter selection.
  activePrototypeSubtypeId?: string | null;
  onClearActivePlugin: () => void;
  onClearActiveChip?: () => void;
  activeSkillId?: string | null;
  activeSkillTitle?: string | null;
  activeSkillRecord?: SkillSummary | null;
  onClearActiveSkill?: () => void;
  selectedPluginContexts?: InstalledPluginRecord[];
  selectedMcpContexts?: McpServerConfig[];
  selectedConnectorContexts?: ConnectorDetail[];
  // Context-only selections (staged through the plain `Use` action, no inline
  // @mention pill). These have no in-prompt representation, so the active row
  // renders a removable chip for each — otherwise a kept-in-payload context
  // would be invisible and unremovable (silent context drift).
  contextOnlyPlugins?: InstalledPluginRecord[];
  contextOnlyMcpServers?: McpServerConfig[];
  contextOnlyConnectors?: ConnectorDetail[];
  contextWorkspaceItems?: WorkspaceContextItem[];
  onRemovePluginContext?: (pluginId: string) => void;
  onRemoveMcpContext?: (serverId: string) => void;
  onRemoveConnectorContext?: (connectorId: string) => void;
  onAddWorkspaceContext?: (item: WorkspaceContextItem) => void;
  onRemoveWorkspaceContext?: (id: string) => void;
  onAddConnector?: () => void;
  onAddMcp?: () => void;
  onOpenPluginDetails?: (record: InstalledPluginRecord) => void;
  onOpenSkillDetails?: (skill: SkillSummary) => void;
  pluginInputFields?: InputFieldSpec[];
  pluginInputValues?: Record<string, unknown>;
  pluginInputTemplate?: string | null;
  onPluginInputValuesChange?: (values: Record<string, unknown>) => void;
  inlineEditableInputNames?: string[];
  footerInputNames?: string[];
  designSystems?: DesignSystemSummary[];
  // Persistent design-system selection, surfaced as a borderless picker in the
  // row below the composer (next to the working-directory picker) so it is
  // available for every product kind. `null` = "No design system".
  selectedDesignSystemId?: string | null;
  onDesignSystemChange?: (id: string | null) => void;
  stagedFiles?: File[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  /** Opens the "Import from Figma" dialog; omit to hide the menu entry. */
  onImportFigma?: () => void;
  pluginOptions: InstalledPluginRecord[];
  pluginsLoading: boolean;
  skillOptions?: SkillSummary[];
  skillsLoading?: boolean;
  mcpOptions?: McpServerConfig[];
  mcpLoading?: boolean;
  connectorOptions?: ConnectorDetail[];
  pendingPluginId: string | null;
  pendingChipId: string | null;
  submitDisabled?: boolean;
  // True while the submitted run is being handed to project creation. This is
  // a logical single-flight guard only: the optimistic route owns progress, so
  // the Home arrow must stay visually stable until that route unmounts it.
  submitting?: boolean;
  onPickPlugin: (record: InstalledPluginRecord, nextPrompt: string | null) => void;
  onPickExamplePlugin?: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  onPickSkill?: (skill: SkillSummary, nextPrompt: string | null) => void;
  onPickMcp?: (server: McpServerConfig, nextPrompt: string) => void;
  onPickConnector?: (connector: ConnectorDetail, nextPrompt: string) => void;
  onPickChip: (chip: HomeHeroChip) => void;
  contextItemCount: number;
  error: string | null;
  showActivePluginChip?: boolean;
  workingDir?: string | null;
  recentDirs?: string[];
  onPickWorkingDir?: () => Promise<string | null> | string | null | void;
  onPickLocalCodeDir?: () => Promise<string | null> | string | null | void;
  onSelectRecentWorkingDir?: (dir: string) => void;
  onClearWorkingDir?: () => void;
  onExamplePromptStatusChange?: (info: ExamplePromptInfo | null) => void;
  // "…or start a blank project" — creates an empty project directly (no dialog,
  // no design system / template / prompt) and enters it. Omit to hide the link.
  onStartBlankProject?: () => void;
  executionSwitcher?: ReactNode;
  // Personalized first-run starting point (spec §7). Rendered directly under
  // the composer card — before the template section — so a brand-new user sees
  // their recommended entry without scrolling.
  recommendationSlot?: ReactNode;
  /**
   * `page` is Home's own full column — headline, composer, type row, examples.
   * `dock` is the composer ALONE, for surfaces that want Home's input without
   * Home's page (the community view's bottom bar). Everything the composer
   * itself does — @mentions, staged files, the working-directory row, submit —
   * is identical between the two; only the page furniture around it differs.
   */
  variant?: 'page' | 'dock';
  /**
   * Dock only: bump this to fold the bar back to its collapsed default. The
   * community view raises it on every tab change (per product: tab 之间的切换
   * 的时候这个输入框默认是收起来的) — the gallery under the bar has become a
   * different gallery, so the bar goes back to its resting state instead of
   * staying open over content the user has not looked at yet. A counter rather
   * than a boolean: two folds in a row are two distinct events, and a flag
   * would need clearing to fire twice.
   */
  collapseSignal?: number;
}

type HomeMentionTab = 'all' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

// In the combined "All" overview, every surface is capped to a handful of top
// matches so no single section floods the picker. The dedicated "Design files"
// tab is exempt: staged files are the user's own finite content, so that tab
// lists every match (the results panel scrolls) and its count reflects the true
// total rather than the truncated preview.
const HOME_MENTION_ALL_TAB_PREVIEW = 6;

// The template chip leads the prompt's first line and shares it with the text,
// so a long template name would eat the line before the prompt starts. Cut it
// to a fixed count of characters (not a width) so every name yields the same
// short lead, and let the chip's `title` carry the full one. Counted in code
// points, so an emoji or a surrogate pair spends one slot, not two.
const LEAD_CHIP_TITLE_MAX_CHARS = 8;
// Full-width CJK punctuation whose glyph sits in the left half of a full-em
// advance, leaving the rest blank. A headline ending in one of these needs the
// optical nudge above; anything else centres honestly.
const FULL_WIDTH_TRAILING_PUNCTUATION = /[？！。，、；：）】」』]$/u;

/** The slot a headline translation writes to opt into the rotating noun. A
 *  locale whose `homeHero.title` has no `{word}` renders as a plain sentence,
 *  which is what the 17 non-Chinese ones do today. */
const TITLE_WORD_SLOT = '{word}';
/** Separator for `homeHero.titleWords`, the comma-separated list the headline
 *  cycles through. One key rather than a set of chip labels because grammar is
 *  per-language: Chinese takes the composer's own singular type names
 *  (「设计点文档」), English needs plurals for the sentence to read at all
 *  ("Let’s create wireframes?" — "a Image" is what article-splicing gets
 *  you). Each locale therefore owns both halves of its own sentence. */
const TITLE_WORD_SEPARATOR = ',';

function endsWithFullWidthPunctuation(value: string): boolean {
  return FULL_WIDTH_TRAILING_PUNCTUATION.test(value.trim());
}

function leadChipTitle(title: string): string {
  const chars = Array.from(title);
  if (chars.length <= LEAD_CHIP_TITLE_MAX_CHARS) return title;
  return `${chars.slice(0, LEAD_CHIP_TITLE_MAX_CHARS).join('').trimEnd()}…`;
}

interface HomeMentionOption {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  meta: string;
  pluginRecord?: InstalledPluginRecord;
  disabled?: boolean;
  onPick: () => void;
}

interface HomeMentionSection {
  id: Exclude<HomeMentionTab, 'all'>;
  label: string;
  options: HomeMentionOption[];
}

interface SelectedPromptExample {
  label: string;
  promptText: string;
}

const EMPTY_PLUGIN_CONTEXTS: InstalledPluginRecord[] = [];
const EMPTY_MCP_CONTEXTS: McpServerConfig[] = [];
const EMPTY_CONNECTOR_CONTEXTS: ConnectorDetail[] = [];
const EMPTY_INPUT_FIELDS: InputFieldSpec[] = [];
const EMPTY_PLUGIN_INPUT_VALUES: Record<string, unknown> = {};
const EMPTY_INPUT_NAMES: string[] = [];
const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];
const EMPTY_STAGED_FILES: File[] = [];
const EMPTY_SKILLS: SkillSummary[] = [];
const EMPTY_MCP_OPTIONS: McpServerConfig[] = [];
const EMPTY_CONNECTOR_OPTIONS: ConnectorDetail[] = [];
const EMPTY_WORKSPACE_ITEMS: WorkspaceContextItem[] = [];

export const HomeHero = forwardRef<HomeHeroHandle, Props>(function HomeHero(
  {
    workspaceContext = null,
    active = true,
    prompt,
    onPromptChange,
    onSubmit,
    onSubmitScenario = () => undefined,
    firstRunGuide,
    activePluginTitle,
    activePluginIsExplicit = false,
    activePluginRecord = null,
    activeSkillId = null,
    activeSkillTitle = null,
    activeSkillRecord = null,
    activeChipId,
    onClearActivePlugin,
    onClearActiveChip = onClearActivePlugin,
    onClearActiveSkill = () => undefined,
    selectedPluginContexts = EMPTY_PLUGIN_CONTEXTS,
    contextOnlyPlugins = EMPTY_PLUGIN_CONTEXTS,
    contextOnlyMcpServers = EMPTY_MCP_OPTIONS,
    contextOnlyConnectors = EMPTY_CONNECTOR_OPTIONS,
    contextWorkspaceItems = EMPTY_WORKSPACE_ITEMS,
    onRemovePluginContext = () => undefined,
    onRemoveMcpContext = () => undefined,
    onRemoveConnectorContext = () => undefined,
    onAddWorkspaceContext = () => undefined,
    onRemoveWorkspaceContext = () => undefined,
    onAddConnector = () => undefined,
    onAddMcp = () => undefined,
    onOpenPluginDetails = () => undefined,
    onOpenSkillDetails = () => undefined,
    pluginInputFields = EMPTY_INPUT_FIELDS,
    pluginInputValues = EMPTY_PLUGIN_INPUT_VALUES,
    onPluginInputValuesChange = () => undefined,
    footerInputNames = EMPTY_INPUT_NAMES,
    designSystems = EMPTY_DESIGN_SYSTEMS,
    selectedDesignSystemId = null,
    onDesignSystemChange,
    stagedFiles = EMPTY_STAGED_FILES,
    onAddFiles = () => undefined,
    onImportFigma,
    onRemoveFile = () => undefined,
    pluginOptions,
    pluginsLoading,
    skillOptions = EMPTY_SKILLS,
    skillsLoading = false,
    mcpOptions = EMPTY_MCP_OPTIONS,
    mcpLoading = false,
    connectorOptions = EMPTY_CONNECTOR_OPTIONS,
    pendingPluginId,
    pendingChipId,
    submitDisabled = false,
    submitting = false,
    onPickPlugin,
    onPickExamplePlugin = () => undefined,
    onPickSkill = () => undefined,
    onPickMcp = () => undefined,
    onPickConnector = () => undefined,
    onPickChip,
    activePrototypeSubtypeId,
    contextItemCount,
    error,
    showActivePluginChip = true,
    workingDir = null,
    recentDirs = [],
    onPickWorkingDir,
    onPickLocalCodeDir,
    onSelectRecentWorkingDir,
    onClearWorkingDir,
    onExamplePromptStatusChange,
    onStartBlankProject,
    executionSwitcher,
    recommendationSlot,
    variant = 'page',
    collapseSignal,
  },
  ref,
) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  // Docked = the composer without Home's page around it. Read in the render
  // below to drop the furniture (headline, type row, example grid) rather than
  // to change how the composer itself behaves.
  const isDock = variant === 'dock';
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionTab, setMentionTab] = useState<HomeMentionTab>('all');
  const [hoveredPlugin, setHoveredPlugin] = useState<InstalledPluginRecord | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // Border beam on the prompt card (styles/home/composer-beam.css). Mirrors
  // border-beam's own active/fading contract so blur fades the light out over
  // 0.5s instead of cutting it; `fading` clears when that keyframe ends.
  const [beamPhase, setBeamPhase] = useState<'idle' | 'active' | 'fading'>('idle');
  /* Does the composer card hold focus? Drives the docked bar's unfold (below).
     Its own state rather than a read of `beamPhase`: that one is an ANIMATION
     lifecycle (active -> fading -> idle) and lingers through the fade-out, so
     the bar would stay open for half a second after the caret left. */
  const [composerFocused, setComposerFocused] = useState(false);
  /* Docked only: the HOST folded the bar back down. Two things raise it —
     scrolling the page (per product: 滑动这个页面就会收起来，点击后展开) and the
     community view switching tabs (`collapseSignal` below). Its own flag rather
     than blurring the editor — a blur would take the caret with it, so anyone
     who scrolls mid-thought would have to click back in to keep typing. Cleared
     by a focus on the card, or by a pointer landing anywhere on the bar (see
     the composer card's `onPointerDownCapture`): the caret is often still in
     the field when the user clicks back, and then no focus event fires. */
  const [forcedCollapsed, setForcedCollapsed] = useState(false);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [projectReferenceOpen, setProjectReferenceOpen] = useState(false);
  const [figmaHelpOpen, setFigmaHelpOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const homeHeroRef = useRef<HTMLElement | null>(null);
  // Two-flash attention pulse on the send button; armed via the
  // imperative `pulseSend()` handle, cleared when the animation ends.
  const [sendAttention, setSendAttention] = useState(false);
  // First-run guidance trail (see home-hero/firstRunGuide.ts): which rail
  // chip is pulsing, and whether the first example-prompt card is pulsing.
  const [guidePulseChipId, setGuidePulseChipId] = useState<string | null>(null);
  const [guidePulseFirstPreset, setGuidePulseFirstPreset] = useState(false);
  const [selectedPromptExample, setSelectedPromptExample] = useState<SelectedPromptExample | null>(null);
  const [previewHomeFileKey, setPreviewHomeFileKey] = useState<string | null>(null);
  const [stagedFilePreviewUrls, setStagedFilePreviewUrls] = useState<Map<string, string>>(() => new Map());
  // Lexical-driven @-trigger state (replaces the old end-anchored
  // getContextMention regex) + the caret box the popover anchors to.
  const [mentionTrigger, setMentionTrigger] = useState<{ query: string } | null>(null);
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
  // The scenario the placeholder carousel is currently showing. A Send on an
  // empty composer submits THIS scenario's text + template (see handleSend).
  const [carouselScenario, setCarouselScenario] = useState<PlaceholderScenario | null>(null);
  // The beam's light rides `offset-path`, and a `path()` cannot be written in
  // terms of the element's own size — border-beam measures the box in JS for
  // exactly this reason. A ResizeObserver (rather than the original's window
  // resize listener) also catches the card growing as the prompt wraps.
  useEffect(() => {
    const node = beamRef.current;
    if (!node) return;
    const syncPath = () => {
      node.style.setProperty(
        '--beam-path',
        `path("M 0 0 H ${node.offsetWidth} V ${node.offsetHeight} H 0 V 0")`,
      );
    };
    syncPath();
    // jsdom has no ResizeObserver; the one sync above is the whole answer in a
    // test render, where nothing resizes. Guarded the same way the row-measure
    // observer further down already is — unguarded, this throws out of a
    // passive effect and takes the whole HomeHero render with it.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncPath);
    observer.observe(node);
    return () => observer.disconnect();
  }, [beamPhase]);
  const editorRef = useRef<LexicalComposerInputHandle | null>(null);
  const promptEditorRef = useRef<HTMLDivElement | null>(null);
  // A single-line chip row leads the prompt's FIRST line and every wrapped line
  // returns to the chip's own left edge. A float cannot do that — its band is
  // as tall as the chip (~28px), so it would push the second line right as well
  // — so the row is taken out of flow and the first line is indented past it.
  // These publish the measurements that indent needs (see the effect below).
  const chipRowRef = useRef<HTMLDivElement | null>(null);
  const promptFlowRef = useRef<HTMLDivElement | null>(null);
  const mentionPickerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutsMenuRef = useRef<HTMLDivElement>(null);
  const canSubmit =
    (prompt.trim().length > 0 || stagedFiles.length > 0) && !submitDisabled && !submitting;
  const previewHomeFile = useMemo(() => {
    if (!previewHomeFileKey) return null;
    return stagedFiles.find((file, index) => homeFileKey(file, index) === previewHomeFileKey) ?? null;
  }, [previewHomeFileKey, stagedFiles]);
  const previewHomeFileUrl = previewHomeFileKey ? stagedFilePreviewUrls.get(previewHomeFileKey) ?? null : null;
  const placeholder = activePluginTitle || activeSkillTitle
    ? t('homeHero.placeholderActive')
    : t('homeHero.placeholder');
  const mentionActive = Boolean(mentionTrigger);
  const mentionQuery = mentionTrigger?.query ?? '';
  // Scenarios the carousel cycles, with copy resolved through `t()` so the
  // typed placeholder AND the submitted query follow the locale. With a
  // create-template chip selected we narrow to that template's scenarios (so
  // the suggestions match the picked output and a submit keeps that template);
  // with nothing bound we cycle the full set. Memoised by chip + locale so the
  // reference only changes on a real switch, which restarts the carousel.
  const carouselScenarios = useMemo<PlaceholderScenario[]>(() => buildPlaceholderScenarios({
    activeChipId,
    // The scene narrows the parent's lines; it is not a template of its own, so
    // prompt-example and label fallbacks still key off the parent task type.
    activePrototypeSubtypeId: activeChipId === 'prototype' ? activePrototypeSubtypeId ?? null : null,
    resolveTextKey: (key) => t(key),
    examplesForChip: (chipId) => homeHeroChipPromptExamples(chipId, locale),
    fallbackForChip: (chipId) => fallbackPlaceholderScenarioText(chipId, locale, t),
  }), [activeChipId, activePrototypeSubtypeId, locale, t]);
  // The placeholder carousel runs while the composer is empty and nothing
  // OTHER than a create-template chip is bound. A selected template keeps it
  // alive (showing that template's scenarios); only an explicit plugin/skill
  // pick — which owns its own placeholder — or a non-empty composer stops it.
  // Template types without curated carousel lines fall back to their localized
  // prompt examples, then to a localized chip-label prompt. That keeps every
  // create template submittable from an empty composer instead of silently
  // disabling Send.
  // #118: once the caret is in the editor, the animating placeholder reads as a
  // second cursor. Tracked with native focusin/focusout on the wrapper rather
  // than an editor prop, so this works for the Lexical editor without widening
  // its API. `carouselActive` deliberately stays true — Send must still submit
  // the current scenario from an empty composer.
  const [promptFocused, setPromptFocused] = useState(false);
  useEffect(() => {
    const node = promptEditorRef.current;
    if (!node) return;
    const onIn = () => setPromptFocused(true);
    const onOut = (ev: FocusEvent) => {
      // focusout fires for moves *within* the editor too; only a target outside
      // the wrapper is a real blur.
      if (node.contains(ev.relatedTarget as Node | null)) return;
      setPromptFocused(false);
    };
    node.addEventListener('focusin', onIn);
    node.addEventListener('focusout', onOut);
    return () => {
      node.removeEventListener('focusin', onIn);
      node.removeEventListener('focusout', onOut);
    };
  }, []);

  useEffect(() => {
    if (!isDock) return undefined;
    const onScroll = () => setForcedCollapsed(true);
    // Bind the SCROLLING ELEMENT itself. The entry page scrolls inside
    // `.entry-main--scroll`, not the window, and an element's scroll event does
    // not bubble — `window` never hears it. A capture-phase listener on
    // `document` does not either: measured on this page, it took 0 hits while
    // the pane's scrollTop moved. `.entry-main--scroll` is the same handle
    // HomeView and InlineModelSwitcher already reach for; window stays bound
    // for any host where the page itself is the scroller.
    const pane =
      homeHeroRef.current?.closest('.entry-main--scroll')
      ?? document.querySelector('.entry-main--scroll');
    pane?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      pane?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isDock]);

  /* The host's other fold: the community view raises `collapseSignal` on every
     tab change, and the bar returns to its collapsed default (per product: tab
     之间的切换的时候这个输入框默认是收起来的). Folding rather than clearing —
     whatever the user has already put in the field survives in the one-line
     pill, exactly as it does after a scroll. Runs on mount too: the bar's
     resting state IS collapsed, so the first pass changes nothing. */
  useEffect(() => {
    if (!isDock) return;
    setForcedCollapsed(true);
  }, [collapseSignal, isDock]);

  const carouselActive =
    active &&
    !submitting &&
    !submitDisabled &&
    prompt.trim().length === 0 &&
    stagedFiles.length === 0 &&
    !activeSkillTitle &&
    !activePluginIsExplicit &&
    !mentionActive &&
    carouselScenarios.length > 0;
  // Empty composer, but the carousel is offering a runnable scenario from the
  // CURRENT pool: Send stays highlighted and submits that scenario instead of
  // sitting disabled. The membership check guards the brief window after a
  // template switch before the carousel reports the new pool's first scenario.
  const carouselSubmittable =
    carouselActive &&
    !pluginsLoading &&
    carouselScenario !== null &&
    carouselScenarios.some((scenario) => scenario.id === carouselScenario.id);
  const sendEnabled = canSubmit || carouselSubmittable;
  function handleSend() {
    if (submitting || submitDisabled) return;
    if (canSubmit) {
      notifyCompletionFeedbackGesture();
      onSubmit();
      return;
    }
    if (carouselSubmittable && carouselScenario) {
      notifyCompletionFeedbackGesture();
      onSubmitScenario(carouselScenario);
    }
  }
  const fileMatches = useMemo(
    () =>
      mentionActive
        ? stagedFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => fileMatchesQuery(file, mentionQuery))
        : [],
    [mentionActive, mentionQuery, stagedFiles],
  );
  const pluginMatches = useMemo(
    () =>
      mentionActive
        ? pluginOptions.filter((plugin) => pluginMatchesQuery(plugin, mentionQuery, locale))
        : [],
    [locale, mentionActive, mentionQuery, pluginOptions],
  );
  const skillMatches = useMemo(
    () =>
      mentionActive
        ? skillOptions.filter((skill) => skillMatchesQuery(skill, mentionQuery, locale))
        : [],
    [locale, mentionActive, mentionQuery, skillOptions],
  );
  const mcpMatches = useMemo(
    () =>
      mentionActive
        ? mcpOptions.filter((server) => mcpServerMatchesQuery(server, mentionQuery)).slice(0, 6)
        : [],
    [mcpOptions, mentionActive, mentionQuery],
  );
  const connectorMatches = useMemo(
    () =>
      mentionActive
        ? connectorOptions.filter((connector) => connectorMatchesQuery(connector, mentionQuery)).slice(0, 6)
        : [],
    [connectorOptions, mentionActive, mentionQuery],
  );
  const pickerOpen = active && mentionActive;
  const tabs: Array<{ id: HomeMentionTab; label: string; count: number }> = [
    // The All overview previews at most HOME_MENTION_ALL_TAB_PREVIEW files, so
    // its badge counts the previewed slice — not the full staged total — to keep
    // the count aligned with what that tab actually renders. The dedicated files
    // tab below lists every match and reports the true total.
    { id: 'all', label: t('common.all'), count: Math.min(fileMatches.length, HOME_MENTION_ALL_TAB_PREVIEW) + pluginMatches.length + skillMatches.length + mcpMatches.length + connectorMatches.length },
    { id: 'files', label: t('chat.mentionTabFiles'), count: fileMatches.length },
    { id: 'plugins', label: t('entry.navPlugins'), count: pluginMatches.length },
    { id: 'skills', label: t('homeHero.skills'), count: skillMatches.length },
    { id: 'mcp', label: 'MCP', count: mcpMatches.length },
    { id: 'connectors', label: 'Connectors', count: connectorMatches.length },
  ];
  const showFiles = mentionTab === 'all' || mentionTab === 'files';
  const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
  const showSkills = mentionTab === 'all' || mentionTab === 'skills';
  const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
  const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
  const visibleSections: HomeMentionSection[] = [
    showFiles
      ? {
          id: 'files',
          label: t('chat.mentionSectionFiles'),
          options: (mentionTab === 'files' ? fileMatches : fileMatches.slice(0, HOME_MENTION_ALL_TAB_PREVIEW)).map(({ file, index }) => ({
            id: `file-${index}-${file.name}`,
            icon: isImageFile(file) ? 'image' : 'file',
            title: file.name,
            description: file.type || t('chat.mentionTabFiles'),
            meta: formatFileSize(file.size),
            onPick: () => pickFile(file),
          })),
        }
      : null,
    showPlugins
      ? {
          id: 'plugins',
          label: t('entry.navPlugins'),
          options: pluginMatches.map((plugin) => ({
            id: `plugin-${plugin.id}`,
            icon: 'sparkles',
            title: localizePluginTitle(locale, plugin),
            description: localizePluginDescription(locale, plugin) || plugin.id,
            meta: pendingPluginId === plugin.id ? t('homeHero.applying') : getPluginSourceLabel(plugin),
            pluginRecord: plugin,
            disabled: pendingPluginId !== null,
            onPick: () => pickPlugin(plugin),
          })),
        }
      : null,
    showSkills
      ? {
          id: 'skills',
          label: t('homeHero.skills'),
          options: skillMatches.map((skill) => ({
            id: `skill-${skill.id}`,
            icon: skill.id === activeSkillId ? 'check' : 'file',
            title: localizeSkillName(locale, skill),
            description: localizeSkillDescription(locale, skill) || skill.id,
            meta: skill.id === activeSkillId ? t('common.active') : skill.mode,
            onPick: () => pickSkill(skill),
          })),
        }
      : null,
    showMcp
      ? {
          id: 'mcp',
          label: 'MCP',
          options: mcpMatches.map((server) => ({
            id: `mcp-${server.id}`,
            icon: 'link',
            title: server.label || server.id,
            description: server.url || server.command || server.id,
            meta: server.transport,
            onPick: () => pickMcp(server),
          })),
        }
      : null,
    showConnectors
      ? {
          id: 'connectors',
          label: 'Connectors',
          options: connectorMatches.map((connector) => ({
            id: `connector-${connector.id}`,
            icon: 'link',
            title: connector.name,
            description: connector.description || connector.provider || connector.id,
            meta: connector.accountLabel ?? connector.provider,
            onPick: () => pickConnector(connector),
          })),
        }
      : null,
  ].filter((section): section is HomeMentionSection => Boolean(section?.options.length));
  const visiblePickerOptions = visibleSections.flatMap((section) => section.options);
  const visibleLoading =
    (mentionTab === 'all' && (pluginsLoading || skillsLoading || mcpLoading)) ||
    (mentionTab === 'plugins' && pluginsLoading) ||
    (mentionTab === 'skills' && skillsLoading) ||
    (mentionTab === 'mcp' && mcpLoading);
  const promptMentionEntities = useMemo(
    () =>
      buildHomeMentionEntities({
        activePluginRecord,
        activeSkillId,
        activeSkillTitle,
        mcpOptions,
        pluginOptions,
        connectorOptions,
        contextWorkspaceItems,
        selectedPluginContexts,
        stagedFiles,
        skillOptions,
      }),
    [
      activePluginRecord,
      activeSkillId,
      activeSkillTitle,
      mcpOptions,
      pluginOptions,
      connectorOptions,
      contextWorkspaceItems,
      selectedPluginContexts,
      stagedFiles,
      skillOptions,
    ],
  );
  const fieldByName = useMemo(
    () => new Map(pluginInputFields.map((field) => [field.name, field])),
    [pluginInputFields],
  );
  const footerInputNameSet = useMemo(
    () => new Set(footerInputNames),
    [footerInputNames],
  );
  const footerInputFields = useMemo(
    () => footerInputNames
      .map((name) => fieldByName.get(name))
      .filter((field): field is InputFieldSpec => Boolean(field)),
    [fieldByName, footerInputNames],
  );
  const activeCreateChip = useMemo(
    () => activeChipId
      ? chipsForGroup('create').find((chip) => chip.id === activeChipId) ?? null
      : null,
    [activeChipId],
  );
  // Footer Template picker options: the ordered create-scenario chips (pure
  // project-type templates — Slides / Prototype / Wireframe / Document / …).
  // Excludes action chips (Brand Kit / Figma) that navigate away instead of
  // seeding a template, so the dropdown matches the rail's template set.
  const templateChips = useMemo(
    () => orderedCreateChips().filter((chip) => chip.action.kind === 'apply-scenario'),
    [],
  );
  // A surface outside the hero (e.g. the workspace tabs-bar) can hand off a
  // template pick through this window event; apply the chip exactly as if it
  // was clicked here. Deliberately depless (re-subscribes each render) so the
  // listener always sees the current handlers without threading them through
  // refs.
  useEffect(() => {
    function onApplyTemplate(event: Event) {
      const chipId = (event as CustomEvent<{ chipId?: string }>).detail?.chipId;
      if (!chipId) return;
      const chip = templateChips.find((item) => item.id === chipId);
      if (chip) handlePickTaskChip(chip);
    }
    window.addEventListener(HOME_APPLY_TEMPLATE_EVENT, onApplyTemplate);
    return () => window.removeEventListener(HOME_APPLY_TEMPLATE_EVENT, onApplyTemplate);
  });
  const activeExamplePlugins = useMemo(
    () =>
      activeChipId
        ? homeHeroExamplePluginsForChip(activeChipId, pluginOptions, locale)
        : [],
    [activeChipId, locale, pluginOptions],
  );
  // The examples are the picked type's curated showcase, full stop. There is
  // no sub-category filter over them any more (see the row's removal below),
  // so nothing narrows this further.
  const filteredExamplePlugins = activeExamplePlugins;
  // 示例提示词 is a first-screen showcase, not a catalog: only the first five
  // cards ride the row (Community owns the full, browsable list), so it stays a
  // glanceable strip instead of a long edge-scrolling rail.
  const examplePluginPresets = useMemo(
    () => filteredExamplePlugins.slice(0, HOME_HERO_MAX_PLUGIN_PRESETS),
    [filteredExamplePlugins],
  );

  // First-run guide, beat 1: pulse the Prototype chip for brand-new users only
  // when Home could not bind a default type. A successfully seeded default has
  // already completed that choice, so skip the redundant pulse and let beat 2
  // guide the user to its first example card.
  // The settle delay lets the hero finish its entrance before the sheen.
  useEffect(() => {
    if (firstRunGuide !== true) return;
    if (readHomeGuideStage() !== 'chip') return;
    if (activeChipId) {
      writeHomeGuideStage('card');
      setGuidePulseChipId(null);
      return;
    }
    const arm = window.setTimeout(() => setGuidePulseChipId('prototype'), 900);
    const disarm = window.setTimeout(() => setGuidePulseChipId(null), 3600);
    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(disarm);
    };
  }, [firstRunGuide, activeChipId]);

  // Users with existing projects never see the trail — complete ANY
  // unfinished stage silently. A chip pick during the loading window can
  // move the stage to 'card' before we know the user is not new, so 'chip'
  // alone is not enough to close off.
  useEffect(() => {
    if (firstRunGuide !== false) return;
    if (readHomeGuideStage() !== 'done') writeHomeGuideStage('done');
  }, [firstRunGuide]);

  const activePromptExamples = useMemo(
    () => activeChipId && activeExamplePlugins.length === 0
      ? homeHeroChipPromptExamples(activeChipId, locale)
      : [],
    [activeChipId, activeExamplePlugins.length, locale],
  );

  // Beat 2: once the picked chip's example cards render, pulse the first
  // card exactly once, then the trail is done (the send pulse takes over
  // after a card pick).
  useEffect(() => {
    if (firstRunGuide !== true) return;
    if (readHomeGuideStage() !== 'card') return;
    // Either card surface counts: plugin preset tiles, or the static
    // prompt-example fallback a presetless chip renders instead.
    const hasExampleCards =
      filteredExamplePlugins.length > 0 || activePromptExamples.length > 0;
    if (!activeChipId || !hasExampleCards) return;
    const arm = window.setTimeout(() => {
      setGuidePulseFirstPreset(true);
      writeHomeGuideStage('done');
    }, 500);
    const disarm = window.setTimeout(() => setGuidePulseFirstPreset(false), 3200);
    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(disarm);
    };
  }, [firstRunGuide, activeChipId, filteredExamplePlugins.length, activePromptExamples.length]);
  const authoringLayoutActive =
    activeChipId === 'create-plugin' || pendingChipId === 'create-plugin';
  const promptMaxHeight = authoringLayoutActive
    ? HOME_HERO_AUTHORING_PROMPT_MAX_HEIGHT
    : HOME_HERO_PROMPT_MAX_HEIGHT;
  const inputCardStyle = {
    '--home-hero-prompt-max-height': `${promptMaxHeight}px`,
  } as CSSProperties;

  useEffect(() => {
    if (selectedIndex >= visiblePickerOptions.length) setSelectedIndex(0);
  }, [selectedIndex, visiblePickerOptions.length]);

  useEffect(() => {
    if (!pickerOpen) setHoveredPlugin(null);
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const isInsideMentionSurface = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return (
        promptEditorRef.current?.contains(target) ||
        mentionPickerRef.current?.contains(target)
      );
    };
    const closePicker = () => {
      setMentionTrigger(null);
      setMentionTab('all');
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!isInsideMentionSurface(event.target)) closePicker();
    };
    const closeOnOutsideMouse = (event: MouseEvent) => {
      if (!isInsideMentionSurface(event.target)) closePicker();
    };
    const closeOnOutsideFocus = (event: FocusEvent) => {
      if (!isInsideMentionSurface(event.target)) closePicker();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('mousedown', closeOnOutsideMouse, true);
    document.addEventListener('focusin', closeOnOutsideFocus);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('mousedown', closeOnOutsideMouse, true);
      document.removeEventListener('focusin', closeOnOutsideFocus);
    };
  }, [pickerOpen]);

  useEffect(() => {
    setSelectedPromptExample(null);
  }, [activeChipId]);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && shortcutsMenuRef.current?.contains(target)) return;
      // The dropdown is portaled to <body>, so it's outside shortcutsMenuRef;
      // recognize it explicitly or a click on a menu item would close the menu
      // before the item's handler runs.
      if (target instanceof Element && target.closest('[data-shortcuts-panel]')) return;
      setShortcutsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShortcutsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [shortcutsOpen]);

  useEffect(() => {
    const urls = new Map<string, string>();
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      stagedFiles.forEach((file, index) => {
        if (isImageFile(file)) urls.set(homeFileKey(file, index), URL.createObjectURL(file));
      });
    }
    setStagedFilePreviewUrls(urls);
    return () => {
      if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stagedFiles]);

  useEffect(() => {
    if (previewHomeFileKey && !previewHomeFile) setPreviewHomeFileKey(null);
  }, [previewHomeFileKey, previewHomeFile]);

  useEffect(() => {
    if (!previewHomeFileKey) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreviewHomeFileKey(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewHomeFileKey]);

  // Shared by the imperative pulseSend() handle (plugin Use / preset picks
  // routed through HomeView) and the component-internal static
  // prompt-example path — every "composer just got seeded" flow shows the
  // same Send cue.
  function triggerSendAttention() {
    // Drop the class for a frame so a pulse requested mid-animation
    // restarts instead of being swallowed.
    setSendAttention(false);
    requestAnimationFrame(() => setSendAttention(true));
  }

  useImperativeHandle(
    ref,
    (): HomeHeroHandle => ({
      focus() {
        editorRef.current?.focus();
      },
      focusEnd() {
        editorRef.current?.focus();
      },
      pulseSend() {
        triggerSendAttention();
      },
    }),
    [],
  );

  // Insert an atomic @mention pill at the active trigger and return the
  // editor's new serialized text. The pill replaces the in-flight `@query`
  // (Lexical's insertMention handles the range), so callers can forward the
  // resulting text to the host pick handler without computing offsets.
  function insertHomeMention(token: string, entity: InlineMentionEntity): string {
    editorRef.current?.insertMention({ token, entity });
    return editorRef.current?.getText() ?? prompt;
  }

  function pickPlugin(record: InstalledPluginRecord) {
    const token = pluginMentionText(record);
    const next = insertHomeMention(token, {
      id: record.id,
      kind: 'plugin',
      label: record.title,
      token,
    });
    onPickPlugin(record, next);
  }

  function pickFile(file: File) {
    const token = inlineMentionToken(file.name);
    insertHomeMention(token, { id: file.name, kind: 'file', label: file.name, token });
    setSelectedIndex(0);
    // The file is already staged; the editor's onChange has updated the
    // prompt text, so there is nothing else to forward to the host.
  }

  function pickSkill(skill: SkillSummary) {
    const token = inlineMentionToken(skill.name);
    const next = insertHomeMention(token, {
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token,
    });
    onPickSkill(skill, next);
  }

  function pickMcp(server: McpServerConfig) {
    const label = server.label || server.id;
    const token = inlineMentionToken(label);
    const next = insertHomeMention(token, { id: server.id, kind: 'mcp', label, token });
    onPickMcp(server, next);
  }

  function pickConnector(connector: ConnectorDetail) {
    const token = inlineMentionToken(connector.name);
    const next = insertHomeMention(token, {
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token,
    });
    onPickConnector(connector, next);
  }

  /* 引用其它项目 / 关联本地代码 attach context; they do NOT write into the
     prompt (per product: 这4个选项选中后都是在工作目录显示，不要在上边的输入框
     展示). Both are answers to the working-directory question — "what may the
     agent read besides this thread" — so the picked thing belongs in that row
     with the folder, not as an @mention the user then has to edit around. */
  function addWorkspaceContextItem(item: WorkspaceContextItem) {
    onAddWorkspaceContext(item);
    dismissMentionPicker();
  }

  function handleReferenceProjects(selections: ProjectReferenceSelection[]) {
    for (const selection of selections) {
      const path = selection.resolvedDir.trim();
      const label = selection.project.name || selection.project.id;
      addWorkspaceContextItem(
        {
          id: `project:${selection.project.id}`,
          kind: 'project',
          label,
          title: label,
          path: selection.project.id,
          ...(path ? { absolutePath: path } : {}),
        }
      );
    }
    setProjectReferenceOpen(false);
    trackContextLinkResult(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      context_kind: 'project',
      result: 'success',
      count: selections.length,
    });
  }

  async function handleLinkLocalCodeContext() {
    const selected = await onPickLocalCodeDir?.();
    if (!selected) {
      trackContextLinkResult(analytics.track, {
        page_name: 'home',
        area: 'chat_composer',
        context_kind: 'local_code',
        result: 'cancelled',
      });
      return;
    }
    const label = selected.split(/[/\\]/).filter(Boolean).pop() || selected;
    addWorkspaceContextItem(
      {
        id: `local-code:${selected}`,
        kind: 'local-code',
        label,
        title: label,
        path: selected,
        absolutePath: selected,
      }
    );
    trackContextLinkResult(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      context_kind: 'local_code',
      result: 'success',
      count: 1,
    });
  }

  // Both context actions now live in the working-dir menu (2026-08-19) —
  // same question as the folder rows: what may the agent read besides this
  // thread. They stay reachable when that chip is absent (a host without
  // folder picking) by falling back to the "+" menu, so no configuration
  // loses them.
  function referenceProjectAction() {
    trackHomeChatComposerClick(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      element: 'plus_pick',
      resource_kind: 'workspace',
      resource_id: 'reference-project',
    });
    trackProjectReferenceModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'project_reference_modal',
    });
    setProjectReferenceOpen(true);
  }

  const linkLocalCodeAction = onPickLocalCodeDir
    ? () => {
        trackHomeChatComposerClick(analytics.track, {
          page_name: 'home',
          area: 'chat_composer',
          element: 'plus_pick',
          resource_kind: 'workspace',
          resource_id: 'local-code',
        });
        void handleLinkLocalCodeContext();
      }
    : undefined;

  function openDesignSystemPicker() {
    const trigger = homeHeroRef.current?.querySelector<HTMLButtonElement>(
      '[data-testid="home-hero-design-system-trigger"]',
    );
    if (!trigger || trigger.disabled) return;
    window.requestAnimationFrame(() => {
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      trigger.focus({ preventScroll: true });
    });
  }

  // Lexical reports the active @-trigger derived from the caret. HomeHero
  // has no slash surface, so only the mention branch is wired.
  function handleTrigger({
    mention: nextMention,
    anchorRect,
  }: {
    mention: { q: string } | null;
    slash: { q: string } | null;
    anchorRect: CaretRect | null;
  }) {
    if (!active) {
      setCaretRect(null);
      setMentionTrigger(null);
      setMentionTab('all');
      return;
    }
    setCaretRect(anchorRect);
    if (nextMention) {
      setMentionTrigger((prev) => {
        if (!prev || prev.query !== nextMention.q) setSelectedIndex(0);
        return { query: nextMention.q };
      });
    } else {
      setMentionTrigger(null);
      setMentionTab('all');
    }
  }

  function dismissMentionPicker() {
    setMentionTrigger(null);
    setMentionTab('all');
    setHoveredPlugin(null);
    setSelectedIndex(0);
  }

  useEffect(() => {
    if (!active) dismissMentionPicker();
  }, [active]);

  // Routes popover navigation keys from the Lexical editor over the visible
  // picker option union. Returns true when consumed so the editor can
  // preventDefault.
  function handlePopoverKey(
    key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape',
  ): boolean {
    if (!mentionActive) return false;
    if (key === 'Escape') {
      setMentionTrigger(null);
      return true;
    }
    if (visiblePickerOptions.length === 0) return false;
    if (key === 'ArrowDown') {
      setSelectedIndex((idx) => (idx + 1) % visiblePickerOptions.length);
      return true;
    }
    if (key === 'ArrowUp') {
      setSelectedIndex(
        (idx) => (idx - 1 + visiblePickerOptions.length) % visiblePickerOptions.length,
      );
      return true;
    }
    if (key === 'Tab' || key === 'Enter') {
      const selected = visiblePickerOptions[selectedIndex] ?? visiblePickerOptions[0];
      if (selected && !selected.disabled) selected.onPick();
      return true;
    }
    return false;
  }

  function handleFiles(files: File[]) {
    if (files.length === 0) return;
    onAddFiles(files);
  }

  // "Import from library": the home composer has no project yet, so we fetch
  // each picked asset's bytes and stage them as regular files. They ride the
  // existing upload-on-submit path into the new project's design files.
  async function importLibraryAssets(assets: LibraryAsset[]) {
    const files: File[] = [];
    for (const asset of assets) {
      const file = await fileFromLibraryAsset(asset);
      if (file) files.push(file);
    }
    handleFiles(files);
  }

  function removeFileChip(index: number, file: File) {
    const nextPrompt = stripHomeMentionToken(prompt, file.name);
    if (nextPrompt !== prompt) onPromptChange(nextPrompt);
    onRemoveFile(index);
  }

  function usePromptExample(example: string) {
    trackHomeChatComposerClick(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      element: 'example_prompt',
      chip_id: activeChipId ?? 'prototype',
    });
    setSelectedPromptExample({
      label: promptExampleChipLabel(example),
      promptText: example,
    });
    onExamplePromptStatusChange?.({
      title: promptExampleChipLabel(example),
      artifactType: activeChipId ?? 'prototype',
      brief: briefForChipId(activeChipId ?? 'prototype'),
    });
    onPromptChange(example);
    editorRef.current?.setText(example);
    setSelectedIndex(0);
    requestAnimationFrame(() => editorRef.current?.focus());
    triggerSendAttention();
  }

  function pickExamplePluginPreset(record: InstalledPluginRecord, chipId: string, promptText: string) {
    trackHomeChatComposerClick(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      element: 'example_prompt',
      chip_id: chipId,
      plugin_id: record.sourceMarketplaceEntryName ?? record.id,
      plugin_type: record.marketplaceTrust ?? 'official',
    });
    setSelectedPromptExample({
      label: record.title,
      promptText,
    });
    onExamplePromptStatusChange?.({
      title: record.title,
      artifactType: chipId,
      brief: briefForPluginPreset(record, chipId),
    });
    onPickExamplePlugin(record, chipId, promptText);
  }

  // The task-type rail (原型 / 幻灯片 / HyperFrames / 视频 / …). Records which
  // task type the user picked before delegating to the host's chip handler.
  function handlePickTaskChip(chip: HomeHeroChip) {
    trackHomeChatComposerClick(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      element: 'task_chip',
      chip_id: chip.id,
    });
    // First chip pick completes the guide's first beat; the preset-card
    // pulse arms once the example cards for this chip render.
    if (readHomeGuideStage() === 'chip') {
      writeHomeGuideStage('card');
      setGuidePulseChipId(null);
    }
    onPickChip(chip);
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    setDragActive(false);
    handleFiles(files);
  }

  function openActivePluginDetails() {
    if (activePluginRecord) onOpenPluginDetails(activePluginRecord);
  }

  function openActiveSkillDetails() {
    if (activeSkillRecord) onOpenSkillDetails(activeSkillRecord);
  }

  // Inline-backed plugin/MCP/connector contexts already render as @mention pills
  // in the editor. This row should mount only for content that has a visible chip
  // here; the aggregate context count is just an aria label when the row exists.
  const showActivePluginRow = Boolean(showActivePluginChip && activePluginTitle);
  // The active-template chip is NOT part of this row any more — it leads the
  // prompt text instead (see `.home-hero__lead-chip`).
  /* The working-directory row names ONE pick on its trigger: the most recent
     workspace item, since a directory (which outranks it) is named by the
     picker itself. Anything before that rides beside the trigger as a chip —
     the row can still show everything attached, it just leads with the answer
     the user gave last. */
  const workdirSelection = workingDir
    ? null
    : contextWorkspaceItems[contextWorkspaceItems.length - 1] ?? null;
  const workdirOverflowItems = workdirSelection
    ? contextWorkspaceItems.slice(0, -1)
    : contextWorkspaceItems;
  /* One slot, last pick wins (per product: 还是用户选择，但是只保留最新的一个).
     The working directory and the referenced projects / linked checkouts are
     separate pieces of state and nothing below can see both — the picker is
     handed `selection` only when there is NO directory (above), so a directory
     plus a linked checkout rendered happily side by side. This is the one place
     that holds both, so the rule belongs here.
     Enforced AFTER the fact rather than by clearing before a pick: every one of
     these rows opens something the user can still cancel (a native folder
     dialog, the project modal), and pre-clearing would throw away a good
     selection the moment they backed out of choosing its replacement. When both
     are occupied the one that did NOT just change is dropped; when neither did
     (nothing to compare) the host's own state is left alone. */
  const workspaceItemsKey = contextWorkspaceItems.map((item) => item.id).join('|');
  const prevWorkingDirRef = useRef(workingDir);
  const prevWorkspaceItemsKeyRef = useRef(workspaceItemsKey);
  useEffect(() => {
    const prevDir = prevWorkingDirRef.current;
    const prevKey = prevWorkspaceItemsKeyRef.current;
    prevWorkingDirRef.current = workingDir;
    prevWorkspaceItemsKeyRef.current = workspaceItemsKey;
    const dirChanged = workingDir !== prevDir;
    const itemsChanged = workspaceItemsKey !== prevKey;
    if (workingDir && contextWorkspaceItems.length > 0) {
      if (dirChanged && !itemsChanged) {
        for (const item of contextWorkspaceItems) onRemoveWorkspaceContext?.(item.id);
      } else if (itemsChanged && !dirChanged) {
        onClearWorkingDir?.();
      }
      return;
    }
    // No directory, but several attachments stacked up: keep the newest only.
    if (!workingDir && contextWorkspaceItems.length > 1) {
      for (const item of contextWorkspaceItems.slice(0, -1)) onRemoveWorkspaceContext?.(item.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingDir, workspaceItemsKey]);
  /* Workspace items (referenced projects / linked local code) are deliberately
     absent: they render in the working-directory row below the card, not in
     this band (see the row for why). */
  const showActiveContextRow =
    stagedFiles.length > 0 ||
    Boolean(activeSkillTitle) ||
    contextOnlyPlugins.length > 0 ||
    contextOnlyMcpServers.length > 0 ||
    contextOnlyConnectors.length > 0;
  useEffect(() => {
    const flow = promptFlowRef.current;
    if (!flow) return;
    const clear = () => {
      flow.classList.remove('is-chip-inline');
      flow.style.removeProperty('--home-hero-chip-w');
      flow.style.removeProperty('--home-hero-chip-text-left');
      flow.style.removeProperty('--home-hero-chip-lead');
    };
    const row = chipRowRef.current;
    if (!row) {
      clear();
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const rect = row.getBoundingClientRect();
      // Inline mode only fits a SINGLE line of chips: the row is taken out of
      // flow there, so a wrapped (multi-line) row would overlap the prompt text
      // instead of pushing it down. Anything taller falls back to the stacked
      // row above the editor.
      if (rect.width <= 0 || rect.height > 36) {
        clear();
        return;
      }
      // Wrapped lines align with the chip's own content edge (its icon), not
      // its border box — measured so a padding/border change can't desync it.
      const content = row.querySelector('.home-hero__active-icon, .home-hero__active-label');
      const textLeft = content ? content.getBoundingClientRect().left - rect.left : 0;
      // The chip is taller than one line of prompt text, so both starting at the
      // flow's top would leave the first line riding high against it. Drop the
      // text by half the difference instead of lifting the chip: a negative
      // offset would be clipped by this flow's own `overflow`.
      const editable = flow.querySelector('.composer-editable, [contenteditable="true"]');
      const lineHeight = editable ? parseFloat(getComputedStyle(editable).lineHeight) : Number.NaN;
      const lead = Number.isFinite(lineHeight) ? Math.max(0, (rect.height - lineHeight) / 2) : 0;
      flow.style.setProperty('--home-hero-chip-w', `${rect.width}px`);
      flow.style.setProperty('--home-hero-chip-text-left', `${Math.max(0, textLeft)}px`);
      flow.style.setProperty('--home-hero-chip-lead', `${lead}px`);
      flow.classList.add('is-chip-inline');
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return clear;
    const observer = new ResizeObserver(apply);
    observer.observe(row);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [showActivePluginRow]);
  /* Headline: a locale opts into the rotating noun by writing `{word}` into
     its own `homeHero.title`. Splitting on the placeholder keeps the whole
     sentence — particles, punctuation, word order — inside the translation
     rather than hard-coding a lead/tail pair per language. The nouns reuse the
     composer's own type labels, so the headline can never name a kind the type
     row does not offer. */
  const titleTemplate = t('homeHero.title');
  const titleSlotIndex = titleTemplate.indexOf(TITLE_WORD_SLOT);
  const titleParts =
    titleSlotIndex === -1
      ? null
      : {
          lead: titleTemplate.slice(0, titleSlotIndex),
          tail: titleTemplate.slice(titleSlotIndex + TITLE_WORD_SLOT.length),
        };
  const titleRotatingWords = t('homeHero.titleWords')
    .split(TITLE_WORD_SEPARATOR)
    .map((word) => word.trim())
    .filter(Boolean);
  /* Once a type is picked below, the headline stops rotating and names it (per
     product) — the sentence and the selected pill must agree. Same label source
     as the pill itself (`homeHeroChipLabel`), so the two can never drift. */
  const titlePinnedWord = activeChipId ? homeHeroChipLabel(activeChipId, t) : null;
  /* The rotating slot is aria-hidden, so the headline names itself here — the
     sentence with the pinned type, or with its first noun while it rotates. */
  const titleAriaLabel = titleParts
    ? `${titleParts.lead}${titlePinnedWord ?? titleRotatingWords[0] ?? ''}${titleParts.tail}`
    : undefined;
  let optionRenderIndex = 0;

  return (
    <section
      ref={homeHeroRef}
      className={`home-hero${isDock ? ' home-hero--dock' : ''}`}
      data-testid="home-hero"
      data-variant={variant}
      /* Docked only: an untouched, unfocused composer shows its input line and
         the send button and nothing else. It unfolds on EITHER trigger —
         something to send, or the caret arriving.
         `carouselActive` answers the first already: it is what decides whether
         the rotating scenario may play, i.e. whether the field holds anything
         the USER put there (typed text, a staged file, an explicit
         plugin/skill, an open @mention).
         Focus is the second (per product 2026-08-26, reversing the earlier
         "开始输入 only" rule — parking the caret now does open the bar).
         Scrolling the page folds it again (per product 2026-08-27) — and that
         branch is UNCONDITIONAL: it folds whatever is in the field, typed text
         included, because the ask is that scrolling always puts the bar back
         down. Only the first branch still asks `carouselActive`; it is what
         keeps a field with content open once the caret leaves it. */
      data-collapsed={
        isDock && ((carouselActive && !composerFocused) || forcedCollapsed) ? 'true' : undefined
      }
    >
      {/* Hero header: one plain question. The animated pixel-scan wordmark that
          used to stand here is gone (per product) — the headline carries the
          moment instead, with no motion behind it. */}
      {/* The headline is box-centred like everything else in this column, but a
          line that ENDS in full-width CJK punctuation carries ~half an em of
          blank inside that last glyph's advance — so the ink reads ~0.27em
          left of the composer card below it. The modifier pulls the margin box
          in by that blank (see home-hero.css); flex cross-axis centring then
          lands the ink on the card's own centre line. Keyed off the string, not
          the locale: any translation that ends in ？！。 gets it, and Latin
          headlines (a narrow "?") are left alone. */}
      {isDock ? null : (
        <>
          <h1
            className={
              'home-hero__title' +
              (endsWithFullWidthPunctuation(t('homeHero.title'))
                ? ' home-hero__title--optical-trim'
                : '')
            }
            aria-label={titleAriaLabel}
          >
            {/* A locale opts into the rotating noun by putting `{word}` in its
                own headline string — en / zh-CN / zh-TW do; the other 16 keep a
                plain sentence and fall straight through to the `else`. Nothing
                here knows which locale is which, so any translation can join
                later by editing one string. */}
            {titleParts ? (
              <>
                {titleParts.lead}
                <RotatingTitleWord words={titleRotatingWords} pinned={titlePinnedWord} />
                {titleParts.tail}
              </>
            ) : (
              t('homeHero.title')
            )}
          </h1>
          {/* One quiet line under the headline (per product). */}
          <p className="home-hero__subtitle">{t('homeHero.subtitle')}</p>
        </>
      )}

      {/* #5517 wraps the input card + workdir row into one visible composer
          card so they read as a single surface. */}
      <div
        className="home-hero__composer-card"
        data-testid="home-hero-composer-card"
        /* Docked: a pointer anywhere on the bar opens it (per product: 我的鼠标
           只要点击这个模块包含输入框就展开). `onFocus` below cannot carry this on
           its own — a scroll folds the bar WITHOUT blurring the editor (that is
           deliberate: the caret has to survive a scroll), so the caret is
           usually STILL in the field when the user clicks back, no focus event
           fires, and the bar had no way to reopen. Capture phase, because the
           editor handles its own pointerdown.
           Anything focusable in the bar keeps its own click — only the inert
           parts hand the caret to the field, which is also what makes the
           reopen stick: `carouselActive && !composerFocused` would fold it
           straight back if nothing took focus. */
        onPointerDownCapture={
          isDock
            ? (event) => {
                setForcedCollapsed(false);
                const target = event.target;
                if (
                  target instanceof Element &&
                  target.closest(
                    'button, a, input, textarea, select, [role="button"], [contenteditable="true"]',
                  )
                ) {
                  return;
                }
                editorRef.current?.focus();
              }
            : undefined
        }
        /* Focus anywhere in the BAR holds it open — not just in the input card
           (per product: 没有输入时点工作目录，面板没弹出，直接收起来了). The
           工作目录 trigger, the execution switcher and the pickers' panels are
           SIBLINGS of the input card, so tracking focus on that card alone read
           a click on any of them as a blur: on an empty field `carouselActive`
           is still true, the bar folded, `display: none` took the row away
           mid-click, and the panel never got to open.
           focusin/focusout bubble, so this outer box hears every one of them,
           and `contains()` stops a move BETWEEN the bar's own controls from
           counting as leaving. The beam stays on the input card's own handlers
           below — it traces THAT box, not this one. */
        onFocus={() => {
          setComposerFocused(true);
          setForcedCollapsed(false);
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          setComposerFocused(false);
        }}
      >
      <div
        className={`home-hero__input-card${
          authoringLayoutActive ? ' home-hero__input-card--compact-authoring' : ''
        }${dragActive ? ' is-drag-active' : ''}`}
        style={inputCardStyle}
        onFocus={() => {
          setBeamPhase('active');
        }}
        onBlur={(event) => {
          // focusout bubbles; ignore focus moving BETWEEN the card's own
          // controls (editor → plus menu → send button).
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          setBeamPhase((phase) => (phase === 'active' ? 'fading' : phase));
        }}
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes('Files')) setDragActive(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <div className="home-hero__prompt-flow" ref={promptFlowRef}>
        {showActiveContextRow ? (
          <AttachmentBand
            ariaLabel={
              contextItemCount > 0
                ? t('homeHero.contextItemsResolved', { n: contextItemCount })
                : undefined
            }
          >
            {stagedFiles.length > 0 ? (
              <span className="home-hero__active-file-group" data-testid="home-hero-staged-files">
                {stagedFiles.map((file, index) => {
                  const key = homeFileKey(file, index);
                  const previewUrl = stagedFilePreviewUrls.get(key) ?? null;
                  const fileBody = (
                    <>
                      {previewUrl ? (
                        <img
                          className="home-hero__active-thumb"
                          src={previewUrl}
                          alt=""
                          aria-hidden
                          draggable={false}
                        />
                      ) : (
                        <span className="home-hero__active-icon" aria-hidden>
                          <Icon name={isImageFile(file) ? 'image' : 'file'} size={12} />
                        </span>
                      )}
                      {/* Name over type · size (per product): two lines inside the
                          chip instead of one run, so the band stays a single
                          row of fixed-height chips. */}
                      <span className="home-hero__active-file-text">
                        <span className="home-hero__active-label">{file.name}</span>
                        <span className="home-hero__active-meta">{formatFileMeta(file)}</span>
                      </span>
                    </>
                  );
                  return (
                    <span
                      key={key}
                      className="home-hero__active-chip home-hero__active-chip--context home-hero__active-chip--file"
                      title={`${file.name} · ${formatFileSize(file.size)}`}
                    >
                      {previewUrl ? (
                        <button
                          type="button"
                          className="home-hero__active-chip-body home-hero__active-file-body"
                          onClick={() => setPreviewHomeFileKey(key)}
                          aria-label={`Preview ${file.name}`}
                        >
                          {fileBody}
                        </button>
                      ) : (
                        <span className="home-hero__active-file-body">
                          {fileBody}
                        </span>
                      )}
                      {/* No tooltip on this one: the × already sits inside a
                          chip that names the file, so the floating 移除文件
                          bubble was covering the chip above it for no new
                          information. `aria-label` still carries the action. */}
                      <button
                        type="button"
                        className="home-hero__active-clear"
                        onClick={() => removeFileChip(index, file)}
                        aria-label={t('chat.removeAria', { name: file.name })}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </span>
                  );
                })}
              </span>
            ) : null}
            {activeSkillTitle ? (
              <span
                className="home-hero__active-chip home-hero__active-chip--skill"
                data-testid="home-hero-active-skill"
              >
                <button
                  type="button"
                  className="home-hero__active-chip-body"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    openActiveSkillDetails();
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    openActiveSkillDetails();
                  }}
                  onClick={openActiveSkillDetails}
                  disabled={!activeSkillRecord}
                  title={activeSkillRecord ? activeSkillRecord.description || activeSkillTitle : undefined}
                >
                  <span className="home-hero__active-icon" aria-hidden>
                    <Icon name="sparkles" size={12} />
                  </span>
                  <span className="home-hero__active-label">{t('homeHero.skillPrefix', { title: activeSkillTitle })}</span>
                </button>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={onClearActiveSkill}
                  aria-label={t('homeHero.clearActiveSkill')}
                  title={t('homeHero.clearActiveSkill')}
                  data-tooltip={t('homeHero.clearActiveSkill')}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ) : null}
            {contextOnlyPlugins.map((plugin) => (
              <ContextChipHoverCard
                key={`ctx-plugin-${plugin.id}`}
                className="home-hero__active-chip home-hero__active-chip--context"
                data-testid={`home-hero-context-plugin-${plugin.id}`}
                typeLabel="Plugin"
                detail={plugin.id}
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="sliders" size={12} />
                </span>
                <span className="home-hero__active-label">{plugin.title}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={() => {
                    trackHomeChatComposerClick(analytics.track, {
                      page_name: 'home',
                      area: 'chat_composer',
                      element: 'context_remove',
                      resource_kind: 'plugin',
                      resource_id: plugin.id,
                    });
                    onRemovePluginContext(plugin.id);
                  }}
                  aria-label={t('chat.removeAria', { name: plugin.title })}
                  title={t('common.close')}
                  data-tooltip={t('common.close')}
                  data-testid={`home-hero-context-clear-${plugin.id}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </ContextChipHoverCard>
            ))}
            {contextOnlyMcpServers.map((server) => {
              const label = server.label || server.id;
              return (
                <ContextChipHoverCard
                  key={`ctx-mcp-${server.id}`}
                  className="home-hero__active-chip home-hero__active-chip--context"
                  data-testid={`home-hero-context-mcp-${server.id}`}
                  typeLabel="MCP server"
                  detail={server.url || server.id}
                >
                  <span className="home-hero__active-icon" aria-hidden>
                    <Icon name="sliders" size={12} />
                  </span>
                  <span className="home-hero__active-label">{label}</span>
                  <button
                    type="button"
                    className="home-hero__active-clear od-tooltip"
                    onClick={() => {
                      trackHomeChatComposerClick(analytics.track, {
                        page_name: 'home',
                        area: 'chat_composer',
                        element: 'context_remove',
                        resource_kind: 'mcp',
                        resource_id: server.id,
                      });
                      onRemoveMcpContext(server.id);
                    }}
                    aria-label={t('chat.removeAria', { name: label })}
                    title={t('common.close')}
                    data-tooltip={t('common.close')}
                    data-testid={`home-hero-context-clear-${server.id}`}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </ContextChipHoverCard>
              );
            })}
            {contextOnlyConnectors.map((connector) => (
              <ContextChipHoverCard
                key={`ctx-connector-${connector.id}`}
                className="home-hero__active-chip home-hero__active-chip--context"
                data-testid={`home-hero-context-connector-${connector.id}`}
                typeLabel="Connector"
                detail={connector.provider || connector.id}
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="link" size={12} />
                </span>
                <span className="home-hero__active-label">{connector.name}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={() => {
                    trackHomeChatComposerClick(analytics.track, {
                      page_name: 'home',
                      area: 'chat_composer',
                      element: 'context_remove',
                      resource_kind: 'connector',
                      resource_id: connector.id,
                    });
                    onRemoveConnectorContext(connector.id);
                  }}
                  aria-label={t('chat.removeAria', { name: connector.name })}
                  title={t('common.close')}
                  data-tooltip={t('common.close')}
                  data-testid={`home-hero-context-clear-${connector.id}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </ContextChipHoverCard>
            ))}
          </AttachmentBand>
        ) : null}
        <div className="home-hero__prompt-surface">
          {/* The selected-template chip leads the prompt's first line and never
              shares the attachment row above (per product), so it lives here —
              beside the text it belongs to — rather than with staged files. */}
          {showActivePluginRow ? (
            <div ref={chipRowRef} className="home-hero__lead-chip">
                <span className="home-hero__active-chip" data-testid="home-hero-active-plugin">
                  <button
                    type="button"
                    className="home-hero__active-chip-body"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      openActivePluginDetails();
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      openActivePluginDetails();
                    }}
                    onClick={openActivePluginDetails}
                    disabled={!activePluginRecord}
                    title={activePluginRecord ? t('homeHero.pluginTitle', { title: activePluginRecord.title }) : undefined}
                  >
                    <span className="home-hero__active-icon" aria-hidden>
                      {/* Same mark the example rows below lead with
                          (`.home-hero__plugin-preset-row-icon`): picking a row
                          moves that exact object into the prompt, so it must
                          keep its glyph on the way. 12px, matching the × that
                          takes this slot on hover — the swap must not resize
                          the chip. */}
                      <Icon name="sparkles-filled" size={12} />
                    </span>
                    <span className="home-hero__active-label">
                      {leadChipTitle(activePluginTitle ?? '')}
                    </span>
                  </button>
                  {activeCreateChip && !activePluginIsExplicit ? null : (
                    <button
                      type="button"
                      className="home-hero__active-clear"
                      onClick={() => {
                        trackHomeChatComposerClick(analytics.track, {
                          page_name: 'home',
                          area: 'chat_composer',
                          element: 'plugin_chip_clear',
                          chip_id: activePluginRecord?.id,
                        });
                        onClearActivePlugin();
                      }}
                      /* No tooltip: the × sits inside the chip it clears, so a
                         floating label only covered the chip above it. The
                         aria-label still names the action for screen readers. */
                      aria-label={t('homeHero.clearActivePlugin')}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
            </div>
          ) : null}
          <div ref={promptEditorRef} className="home-hero__prompt-editor home-hero__lexical">
            <LexicalComposerInput
              ref={editorRef}
              testId="home-hero-input"
              draft={prompt}
              // While the carousel animates, blank the editor's own placeholder
              // so it doesn't double under the overlay; keep the base hint as
              // the accessible/tooltip label.
              placeholder={carouselActive ? '' : placeholder}
              title={carouselActive ? t(PLACEHOLDER_BASE_HINT_KEY) : placeholder}
              knownEntities={promptMentionEntities}
              onChange={(plainText) => {
                // A programmatic seed (host setPrompt → draft prop →
                // SeedingPlugin) echoes back through Lexical's onChange. The
                // old <textarea> never fired onChange for a controlled-value
                // change, so skip the echo here: otherwise seeding would run
                // the host's handlePromptChange — flipping promptEditedByUser
                // (spurious "replace prompt?" dialogs) and re-extracting plugin
                // inputs from the seeded text. Real user edits always differ
                // from the current prompt.
                if (plainText === prompt) return;
                onPromptChange(plainText);
                if (selectedPromptExample && plainText !== selectedPromptExample.promptText) {
                  setSelectedPromptExample(null);
                  onExamplePromptStatusChange?.(null);
                }
              }}
              onTrigger={handleTrigger}
              onEnterSend={handleSend}
              onPasteFiles={handleFiles}
              // Backspace with the caret before the first character eats the
              // template chip leading the line — same effect as its ×, which
              // is easy to miss while typing. Guarded exactly like that ×: an
              // implicit create-chip template has no × to click, so the key
              // falls through to Lexical's own (no-op) handling instead.
              onBackspaceAtStart={() => {
                if (!showActivePluginRow) return false;
                if (activeCreateChip && !activePluginIsExplicit) return false;
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'plugin_chip_clear',
                  chip_id: activePluginRecord?.id,
                });
                onClearActivePlugin();
                return true;
              }}
              popoverOpen={pickerOpen && visiblePickerOptions.length > 0}
              onPopoverKey={handlePopoverKey}
              comboboxAria={{
                expanded: pickerOpen,
                activeId: pickerOpen ? `home-hero-option-${selectedIndex}` : null,
              }}
            />
            <PlaceholderCarousel
              active={carouselActive}
              paused={promptFocused}
              scenarios={carouselScenarios}
              onScenarioChange={setCarouselScenario}
            />
          </div>
        </div>
        </div>
        <CaretFloatingLayer caret={caretRect} open={pickerOpen}>
          <div
            ref={mentionPickerRef}
            id="home-hero-context-picker"
            className="home-hero__plugin-picker home-hero__plugin-picker--floating"
            role="listbox"
            aria-label={t('homeHero.contextSearchResults')}
            data-testid="home-hero-plugin-picker"
          >
            <div className="home-hero__mention-tabs" role="tablist" aria-label={t('homeHero.contextSurfaces')}>
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={mentionTab === item.id}
                  className={`home-hero__mention-tab${mentionTab === item.id ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setMentionTab(item.id);
                    setSelectedIndex(0);
                  }}
                >
                  <span>{item.label}</span>
                  {item.count > 0 ? <span>{item.count}</span> : null}
                </button>
              ))}
            </div>
            <div className="home-hero__plugin-picker-results">
              {visibleLoading && visiblePickerOptions.length === 0 ? (
                <div className="home-hero__plugin-picker-empty">{t('homeHero.loadingContext')}</div>
              ) : null}
              {!visibleLoading && visiblePickerOptions.length === 0 ? (
                <div className="home-hero__plugin-picker-empty">
                  {mentionQuery ? (
                    <>{t('homeHero.noResults', { query: mentionQuery })}</>
                  ) : (
                    <>{t('homeHero.searchPrompt')}</>
                  )}
                </div>
              ) : null}
              {visibleSections.map((section) => (
                <div key={section.id} className="home-hero__mention-section">
                  <div className="home-hero__mention-section-label">{section.label}</div>
                  {section.options.map((item) => {
                    const optionIndex = optionRenderIndex;
                    optionRenderIndex += 1;
                    return (
                      <button
                        key={item.id}
                        id={`home-hero-option-${optionIndex}`}
                        type="button"
                        role="option"
                        aria-selected={optionIndex === selectedIndex}
                        className={`home-hero__plugin-option${
                          optionIndex === selectedIndex ? ' is-active' : ''
                        }`}
                        onMouseEnter={() => {
                          setSelectedIndex(optionIndex);
                          setHoveredPlugin(item.pluginRecord ?? null);
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (!item.disabled) item.onPick();
                        }}
                        disabled={item.disabled}
                      >
                        <span className="home-hero__plugin-option-icon" aria-hidden>
                          <Icon name={item.icon} size={13} />
                        </span>
                        <span className="home-hero__plugin-option-main">
                          <span>{item.title}</span>
                          <span>{item.description}</span>
                        </span>
                        <span className="home-hero__plugin-option-meta">
                          {item.meta}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {hoveredPlugin ? (
                <div
                  className="home-hero__plugin-hover-card"
                  data-testid="home-hero-plugin-hover-card"
                >
                  <div>
                    <span className="home-hero__plugin-hover-kicker">
                      {getPluginSourceLabel(hoveredPlugin)}
                    </span>
                    <strong>{localizePluginTitle(locale, hoveredPlugin)}</strong>
                    <p>{localizePluginDescription(locale, hoveredPlugin) || hoveredPlugin.id}</p>
                  </div>
                  <div className="home-hero__plugin-hover-meta">
                    <span>{t('homeHero.parameters', { n: (hoveredPlugin.manifest?.od?.inputs ?? []).length })}</span>
                    {getPluginQueryPreview(hoveredPlugin) ? (
                      <span>{getPluginQueryPreview(hoveredPlugin)}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      dismissMentionPicker();
                      onOpenPluginDetails(hoveredPlugin);
                    }}
                  >
                    {t('homeHero.details')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </CaretFloatingLayer>
        <div className="home-hero__input-foot">
          <input
            ref={fileInputRef}
            data-testid="home-hero-file-input"
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              handleFiles(files);
              event.target.value = '';
            }}
          />
          <div className="home-hero__foot-left">
            {/* Upload entry: an icon-only disc, lifted out of the accessory row
                below into the head of this one (per product) but keeping that
                row's leading position. Sized and filled like the model chip
                across the row. */}
            <ComposerPlusMenu
              workspaceContext={workspaceContext}
              triggerTestId="home-hero-plus-trigger"
              placementPreference="down"
              onOpen={() =>
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'plus_menu_open',
                })
              }
              onSubmenuOpen={(submenu) => {
                // Home never passes the working-dir submenu (it keeps its own
                // footer picker), so only the resource submenus reach here.
                if (submenu === 'workingDir') return;
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'plus_submenu_open',
                  resource_kind: PLUS_SUBMENU_RESOURCE_KIND[submenu],
                });
              }}
              skills={skillOptions}
              onPickSkill={(skill) => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'plus_pick',
                  resource_kind: 'skill',
                  resource_id: skill.id,
                });
                pickSkill(skill);
              }}
              onAttachFiles={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
              onReferenceProject={onPickWorkingDir ? undefined : referenceProjectAction}
              onLinkLocalCode={onPickWorkingDir ? undefined : linkLocalCodeAction}
              onSelectFromLibrary={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'library',
                });
                setLibraryPickerOpen(true);
              }}
              onImportFigma={onImportFigma ? () => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'figma_import',
                });
                onImportFigma();
              } : undefined}
              onShowFigmaHelp={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'figma_help',
                });
                trackFigmaHelpModalSurfaceView(analytics.track, {
                  page_name: 'home',
                  area: 'figma_help_modal',
                });
                setFigmaHelpOpen(true);
              }}
              onOpenDesignSystems={onDesignSystemChange ? () => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'design_system_open',
                });
                openDesignSystemPicker();
              } : undefined}
            />
            {/* The design system is a PERMANENT head-of-row control sitting
                directly after the upload disc (per product: 设计系统常驻在
                添加附件后面) — it no longer rides with the type pill, so it
                is there before anything is picked. Styled as that disc's twin
                (same 36px puck, same 16px glyph). */}
            {onDesignSystemChange ? (
              <DesignSystemPicker
                variant="home"
                designSystems={designSystems}
                selectedId={selectedDesignSystemId}
                onChange={onDesignSystemChange}
              />
            ) : null}
            {/* Task type follows the two icon controls: it picks WHAT is being
                made, and the pair before it answers "with what" / "in what
                style". */}
            <TemplatePicker
              templates={templateChips}
              activeChipId={activeChipId}
              onClearTemplate={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'task_chip_clear',
                  chip_id: activeChipId ?? undefined,
                });
                onClearActiveChip?.();
              }}
              labelFor={(id) => homeHeroChipLabel(id, t)}
            />
            {libraryPickerOpen ? (
              <LibraryPicker
                onClose={() => setLibraryPickerOpen(false)}
                onConfirm={(assets) => importLibraryAssets(assets)}
              />
            ) : null}
            {projectReferenceOpen ? (
              <ProjectReferenceModal
                workspaceContext={workspaceContext}
                onClose={() => {
                  // Only the dismiss paths (X / backdrop / Escape / Cancel)
                  // land here — a confirmed pick closes via
                  // handleReferenceProjects, which reports 'success'.
                  trackContextLinkResult(analytics.track, {
                    page_name: 'home',
                    area: 'chat_composer',
                    context_kind: 'project',
                    result: 'cancelled',
                  });
                  setProjectReferenceOpen(false);
                }}
                onSelect={handleReferenceProjects}
              />
            ) : null}
            {figmaHelpOpen ? (
              <FigmaHelpModal onClose={() => setFigmaHelpOpen(false)} />
            ) : null}
            {footerInputFields.length > 0 ? (
              <div className="home-hero__footer-options" data-testid="home-hero-footer-options">
                {footerInputFields.map((field) => (
                  <FooterInputOption
                    key={field.name}
                    field={field}
                    value={pluginInputValues[field.name]}
                    designSystems={designSystems}
                    onChange={(value) => {
                      onPluginInputValuesChange({
                        ...pluginInputValues,
                        [field.name]: value,
                      });
                    }}
                    t={t}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="home-hero__foot-right">
            {executionSwitcher ? (
              <div className="home-hero__execution-switcher">
                {executionSwitcher}
              </div>
            ) : null}
            <button
              type="button"
              className={`home-hero__submit${sendAttention ? ' home-hero__attention-sheen' : ''}`}
              data-testid="home-hero-submit"
              onClick={handleSend}
              onAnimationEnd={() => setSendAttention(false)}
              disabled={!sendEnabled}
              // No tooltip: the arrow is the composer's only send affordance,
              // and the 运行 bubble landed on the prompt text right above it.
              // Progress appears in the destination Chat frame, so this action
              // never flashes a transient loading name/state before unmount.
              aria-label={t('homeHero.run')}
              aria-busy={false}
            >
              {/* The supplied send mark: the glyph fills half of its 32 box in
                  the source file, and the icon carries that padding itself, so
                  it renders at the button's full size rather than inset —
                  which is why this tracks the disc (36, see
                  `.home-hero__submit`) instead of the file's own 32. */}
              <Icon name="arrow-up-fill" size={36} />
            </button>
          </div>
        </div>
        {beamPhase === 'idle' ? null : (
          <div
            ref={beamRef}
            className="home-hero__composer-beam"
            data-beam="composer"
            data-active={beamPhase === 'active' ? '' : undefined}
            data-fading={beamPhase === 'fading' ? '' : undefined}
            aria-hidden
            onAnimationEnd={(event) => {
              if (event.animationName.includes('beam-fade-out')) setBeamPhase('idle');
            }}
          >
            {/* The travelling light — a real node, since it carries its own
                offset-path animation. */}
            <div data-beam-bloom />
          </div>
        )}
      </div>

      {/* Accessory row under the composer card: just the working directory now
          — the upload entry moved up into the card's send cluster (per product)
          and the design system sits beside the type pill (per product:
          绿色 pill 后面跟设计系统 icon). */}
      <div className="home-hero__workdir-row">
        {onPickWorkingDir ? (
          <WorkingDirPicker
            className="home-hero__working-dir-picker"
            /* Docked at the foot of the community view, a downward panel opens
               straight off the bottom of the window — so this one hangs UP and
               over the composer instead. Home's copy of the same picker sits
               mid-column with room below it and keeps opening down. */
            placement={isDock ? 'up' : 'down'}
            emptyLabel={t('homeWorkingDir.triggerShort')}
            workingDir={workingDir}
            recentDirs={recentDirs}
            onPickDirectory={() => {
              trackHomeChatComposerClick(analytics.track, {
                page_name: 'home',
                area: 'chat_composer',
                element: 'working_dir',
              });
              void onPickWorkingDir();
            }}
            onSelectRecent={(dir) => {
              trackHomeChatComposerClick(analytics.track, {
                page_name: 'home',
                area: 'chat_composer',
                element: 'working_dir_recent',
              });
              onSelectRecentWorkingDir?.(dir);
            }}
            onClear={() => {
              trackHomeChatComposerClick(analytics.track, {
                page_name: 'home',
                area: 'chat_composer',
                element: 'working_dir_clear',
              });
              onClearWorkingDir?.();
            }}
            // Analytics keep the original `plus_pick` element name so the
            // funnel stays continuous across the move.
            onReferenceProject={referenceProjectAction}
            onLinkLocalCode={linkLocalCodeAction}
            /* All four menu rows answer one question — what may the agent read
               besides this thread — so they all report the same way: the
               trigger takes the pick's name, and its hover × clears it (per
               product: 工作目录会换成后边的文件名…和现在选择最近使用的文件夹的
               逻辑一样). The LAST attached item is the one named; a directory
               outranks it. */
            selection={
              workdirSelection
                ? {
                    label: workdirSelection.label,
                    icon: workdirSelection.kind === 'local-code' ? 'terminal' : 'folder',
                    title: workdirSelection.absolutePath ?? workdirSelection.title,
                    onClear: () => {
                      trackHomeChatComposerClick(analytics.track, {
                        page_name: 'home',
                        area: 'chat_composer',
                        element: 'context_remove',
                        resource_kind: 'workspace',
                        resource_id: workdirSelection.id,
                      });
                      onRemoveWorkspaceContext(workdirSelection.id);
                    },
                  }
                : null
            }
          />
        ) : null}
        {/* Only the OVERFLOW: with several projects referenced at once the
            trigger can name one, so the rest ride beside it rather than
            disappearing. A single pick — the normal case — leaves this empty. */}
        {workdirOverflowItems.map((item) => (
          <ContextChipHoverCard
            key={`ctx-workspace-${item.id}`}
            className="home-hero__active-chip home-hero__active-chip--context"
            data-testid={`home-hero-context-workspace-${item.id}`}
            typeLabel={workspaceContextKindLabel(item.kind)}
            detail={workspaceContextDetailLine(item)}
          >
            <span className="home-hero__active-icon" aria-hidden>
              <Icon name={item.kind === 'local-code' ? 'terminal' : 'folder'} size={12} />
            </span>
            <span className="home-hero__active-label">{item.label}</span>
            <button
              type="button"
              className="home-hero__active-clear od-tooltip"
              onClick={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'context_remove',
                  resource_kind: 'workspace',
                  resource_id: item.id,
                });
                // Nothing to strip from the prompt any more: attaching one of
                // these no longer writes a mention into it.
                onRemoveWorkspaceContext(item.id);
              }}
              aria-label={t('chat.removeAria', { name: item.label })}
              title={t('common.close')}
              data-tooltip={t('common.close')}
              data-testid={`home-hero-context-clear-${item.id}`}
            >
              <Icon name="close" size={12} />
            </button>
          </ContextChipHoverCard>
        ))}
      </div>
      </div>

      {/* Creation types, horizontal, under the working-directory row (per
          product, 2026-08-21). They spent a round as a dropdown pill inside the
          composer's foot row; out here the whole catalog is one glance.

          The row is the EMPTY state's whole job: an untouched Home shows this
          and nothing else. Picking a type retires it — the composer's pill now
          names the choice, the categories below narrow it, and the examples
          answer it, so a second full catalog under all three was just repeating
          the question. The pill's × brings the row back. */}
      {activeChipId || isDock ? null : (
        <TypePillRow
          chips={templateChips}
          activeChipId={activeChipId}
          disabled={pluginsLoading || pendingChipId !== null || pendingPluginId !== null}
          labelFor={(id) => homeHeroChipLabel(id, t)}
          onPick={handlePickTaskChip}
        />
      )}

      {/* No second-level category row under a picked type (per product,
          2026-08-25): picking a type already narrows the examples, and a
          second filter strip between the composer and them re-asked a
          question the pill had just answered. The examples below now show the
          picked type's full set. */}

      {isDock ? null : recommendationSlot}

      {isDock ? null : examplePluginPresets.length > 0 && activeChipId ? (
        <PluginPromptPresets
          chipId={activeChipId}
          plugins={examplePluginPresets}
          activePluginId={activePluginRecord?.id ?? null}
          pendingPluginId={pendingPluginId}
          locale={locale}
          onPick={pickExamplePluginPreset}
          onPreview={onOpenPluginDetails}
          pulseFirstPreset={guidePulseFirstPreset}
          workspaceContext={workspaceContext}
        />
      ) : activePromptExamples.length > 0 ? (
        <div
          className="home-hero__prompt-examples"
          data-testid="home-hero-prompt-examples"
        >
          <div
            className={`home-hero__prompt-examples-grid${activeChipId === 'web-clone' ? ' home-hero__prompt-examples-grid--sites' : ''}`}
          >
            {activePromptExamples.map((example, index) =>
              webCloneExampleSite(example) ? (
                <WebClonePromptExampleCard
                  key={example}
                  example={example}
                  pulse={guidePulseFirstPreset && index === 0}
                  onPick={usePromptExample}
                />
              ) : (
                <button
                  key={example}
                  type="button"
                  className={`home-hero__prompt-example${guidePulseFirstPreset && index === 0 ? ' home-hero__attention-sheen' : ''}`}
                  data-testid="home-hero-prompt-example"
                  onClick={() => usePromptExample(example)}
                >
                  <span>{example}</span>
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="home-hero__error">
          {error}
        </div>
      ) : null}
      {previewHomeFile && previewHomeFileUrl ? createPortal(
        <div
          className="staged-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={previewHomeFile.name}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewHomeFileKey(null);
          }}
        >
          <div className="staged-preview-card">
            <div className="staged-preview-head">
              <span title={previewHomeFile.name}>{previewHomeFile.name}</span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => setPreviewHomeFileKey(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={previewHomeFileUrl} alt={previewHomeFile.name} />
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
});

// The still each row leads with: the daemon-baked poster when the plugin has
// one, otherwise a plain image-template poster. Plugins with neither (HTML-only
// previews) get an empty slot rather than a live iframe — the row is a label,
// and rendering a sandboxed page per row costs far more than it is worth.
function presetPreviewPoster(
  record: InstalledPluginRecord,
  workspaceContext: WorkspaceCollabContext | null,
): string | null {
  const opts = { preferBaked: true, workspaceContext };
  const baked = inferPluginPreview(record, opts);
  if (baked.kind === 'media' && baked.poster) return baked.poster;
  const plain = inferPluginPreview(record, { workspaceContext });
  return plain.kind === 'media' ? plain.poster : null;
}

function PluginPromptPresets({
  activePluginId,
  chipId,
  locale,
  onPick,
  onPreview,
  pendingPluginId,
  plugins,
  pulseFirstPreset = false,
  workspaceContext = null,
}: {
  activePluginId: string | null;
  chipId: string;
  locale: Locale;
  onPick: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  // Opens the example's own preview — the same details/preview modal the rest
  // of the home surface raises (`onOpenPluginDetails`).
  onPreview: (record: InstalledPluginRecord) => void;
  pendingPluginId: string | null;
  plugins: InstalledPluginRecord[];
  workspaceContext?: WorkspaceCollabContext | null;
  // First-run guide: the first card carries the attention sheen.
  pulseFirstPreset?: boolean;
}) {
  // The list stays a list (per product, 2026-08-21) — no thumbnail grid — and
  // the poster rides in the row itself, on the left. The cursor-following
  // preview card that used to rise on hover is gone (per product: 去掉 hover
  // 展示的弹窗): every row already shows its own still, and the floating copy
  // covered the rows either side of the one being read. The eye badge on the
  // poster stays — that is a control, and still the way into the full preview.
  return (
    <div
      className="home-hero__prompt-examples home-hero__plugin-presets-wrap"
      data-testid="home-hero-plugin-presets"
    >
      {/* Still a list, not a thumbnail grid — but each row leads with the
          example's own poster, then its title on the first line and the prompt
          it seeds on the second. */}
      <div className="home-hero__plugin-presets" role="list">
        {plugins.map((record, index) => (
          <PluginPromptPresetRow
            key={record.id}
            chipId={chipId}
            locale={locale}
            record={record}
            poster={presetPreviewPoster(record, workspaceContext)}
            onPreview={() => onPreview(record)}
            active={activePluginId === record.id}
            pending={pendingPluginId === record.id}
            disabled={pendingPluginId !== null}
            pulse={pulseFirstPreset && index === 0}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

// One example per row: the template's own name on top — the same label the
// composer's chip carries once the row is picked — and under it the very text
// the composer would be seeded with (`examplePresetSeedPrompt`), so the row
// both names the example and shows the prompt it applies.
function PluginPromptPresetRow({
  active,
  chipId,
  disabled,
  locale,
  onPick,
  onPreview,
  pending,
  poster,
  pulse = false,
  record,
}: {
  active: boolean;
  chipId: string;
  disabled: boolean;
  locale: Locale;
  onPick: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  onPreview: () => void;
  pending: boolean;
  // The row's own still; null for plugins that have none.
  poster: string | null;
  pulse?: boolean;
  record: InstalledPluginRecord;
}) {
  const { t } = useI18n();
  const seedPrompt = examplePresetSeedPrompt(record, locale, () =>
    pluginPresetPromptPreview(record, locale, chipId),
  ).text;
  // Collapse the seed's own line breaks: the detail is a single line, and a
  // multi-paragraph seed would otherwise leave its tail invisible mid-clip.
  const line = seedPrompt.replace(/\s+/g, ' ').trim();
  const title = localizePluginTitle(locale, record).trim() || line;
  return (
    <button
      type="button"
      className={`home-hero__plugin-preset-row${active ? ' is-active' : ''}${pending ? ' is-pending' : ''}${pulse ? ' home-hero__attention-sheen' : ''}`}
      data-testid="home-hero-plugin-preset"
      data-plugin-id={record.id}
      role="listitem"
      disabled={disabled}
      title={`${title}\n${line}`}
      onClick={() => onPick(record, chipId, seedPrompt)}
    >
      {/* The example's own poster, left of the text, so a row shows what it
          produces without the pointer going anywhere. The slot is rendered
          even when a plugin has no poster, so every title in the list still
          starts on one column. */}
      {/* The WHOLE poster opens the preview (per product), not just the eye
          badge on it — the badge is only the affordance that says so, and it
          lets clicks through to this box. A `span`, not a `button`: the row
          itself IS a button, and a nested one is invalid nesting React warns
          about — so this carries the role explicitly and stops its click from
          reaching the row, which would otherwise seed the composer instead of
          opening the preview. */}
      <span
        className="home-hero__plugin-preset-row-thumb"
        role="button"
        tabIndex={-1}
        aria-label={t('common.preview')}
        title={t('common.preview')}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          onPreview();
        }}
      >
        {poster ? (
          <img src={poster} alt="" draggable={false} loading="lazy" decoding="async" />
        ) : null}
        {/* Icon-only: the poster has no room for the 预览 word beside it, so
            the label lives on the box above instead. */}
        <span className="home-hero__plugin-preset-row-preview" aria-hidden>
          <svg viewBox="0 0 24 24" fill="currentColor" focusable="false" aria-hidden>
            <path d="M12.0003 3C17.3924 3 21.8784 6.87976 22.8189 12C21.8784 17.1202 17.3924 21 12.0003 21C6.60812 21 2.12215 17.1202 1.18164 12C2.12215 6.87976 6.60812 3 12.0003 3ZM12.0003 19C16.2359 19 19.8603 16.052 20.7777 12C19.8603 7.94803 16.2359 5 12.0003 5C7.7646 5 4.14022 7.94803 3.22278 12C4.14022 16.052 7.7646 19 12.0003 19ZM12.0003 16.5C9.51498 16.5 7.50026 14.4853 7.50026 12C7.50026 9.51472 9.51498 7.5 12.0003 7.5C14.4855 7.5 16.5003 9.51472 16.5003 12C16.5003 14.4853 14.4855 16.5 12.0003 16.5ZM12.0003 14.5C13.381 14.5 14.5003 13.3807 14.5003 12C14.5003 10.6193 13.381 9.5 12.0003 9.5C10.6196 9.5 9.50026 10.6193 9.50026 12C9.50026 13.3807 10.6196 14.5 12.0003 14.5Z" />
          </svg>
        </span>
      </span>
      <span className="home-hero__plugin-preset-row-body">
        <span className="home-hero__plugin-preset-row-head">
          {/* The mark leads the name (not the row): the prompt line under it
              stays flush with the chip cluster's left edge above. */}
          <Icon
            name="sparkles-filled"
            size={13}
            className="home-hero__plugin-preset-row-icon"
          />
          <span className="home-hero__plugin-preset-row-title">{title}</span>
          <svg
            className="home-hero__plugin-preset-row-arrow"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
            focusable="false"
          >
            <path d="M16.0037 9.41421L7.39712 18.0208L5.98291 16.6066L14.5895 8H7.00373V6H18.0037V17H16.0037V9.41421Z" />
          </svg>
        </span>
        <span className="home-hero__plugin-preset-row-text">{line}</span>
      </span>
    </button>
  );
}

const FIRST_PARTY_WEB_CLONE_SITE_ICONS: Record<string, string> = {
  'open-design.ai': '/logo.svg',
};

function webCloneFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}`;
}

// A Website-clone text example ("Website URL to clone: https://open-design.ai") —
// pull the site out so the card can show the site's own mark + bare domain
// instead of the raw prompt line. First-party bundled examples use local assets
// so the first screen is stable without waiting on a remote favicon service.
// Returns null for non-URL examples so the generic text card renders unchanged.
function webCloneExampleSite(example: string): { domain: string; iconUrl: string; fallbackIconUrl?: string } | null {
  const match = example.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  let hostname: string;
  try {
    hostname = new URL(match[0]).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!hostname || !hostname.includes('.')) return null;
  const firstPartyIcon = FIRST_PARTY_WEB_CLONE_SITE_ICONS[hostname];
  return {
    domain: hostname,
    iconUrl: firstPartyIcon ?? webCloneFaviconUrl(hostname),
    ...(firstPartyIcon ? { fallbackIconUrl: webCloneFaviconUrl(hostname) } : {}),
  };
}

function WebClonePromptExampleCard({
  example,
  pulse,
  onPick,
}: {
  example: string;
  pulse: boolean;
  onPick: (example: string) => void;
}) {
  const [iconStage, setIconStage] = useState<'primary' | 'fallback' | 'failed'>('primary');
  const site = webCloneExampleSite(example);
  const domain = site?.domain ?? example;
  const monogram = (domain.replace(/[^a-z0-9]/i, '')[0] ?? '?').toUpperCase();
  let iconUrl: string | null = null;
  if (site && iconStage === 'primary') {
    iconUrl = site.iconUrl;
  } else if (site && iconStage === 'fallback') {
    iconUrl = site.fallbackIconUrl ?? null;
  }
  return (
    <button
      type="button"
      className={`home-hero__prompt-example home-hero__prompt-example--site${pulse ? ' home-hero__attention-sheen' : ''}`}
      data-testid="home-hero-prompt-example"
      onClick={() => onPick(example)}
      title={domain}
    >
      <span className="home-hero__site-badge" aria-hidden>
        {site && iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            loading="eager"
            fetchPriority="high"
            onError={() => {
              setIconStage((stage) => (stage === 'primary' && site.fallbackIconUrl ? 'fallback' : 'failed'));
            }}
          />
        ) : (
          <span className="home-hero__site-monogram">{monogram}</span>
        )}
      </span>
      <span className="home-hero__site-domain">{domain}</span>
    </button>
  );
}

function promptExampleChipLabel(example: string): string {
  const normalized = example.replace(/\s+/g, ' ').trim();
  const [beforeDash] = normalized.split(/\s[—-]\s/u, 1);
  const candidate = beforeDash?.trim() || normalized;
  return candidate.length > 64 ? `${candidate.slice(0, 61).trimEnd()}...` : candidate;
}

function homeFileKey(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

const LIBRARY_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'text/html': 'html',
  'text/css': 'css',
  'text/plain': 'txt',
  'application/json': 'json',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};

/** Fetch a library asset's bytes and wrap them in a named File for staging. */
async function fileFromLibraryAsset(asset: LibraryAsset): Promise<File | null> {
  try {
    const resp = await fetch(libraryAssetRawUrl(asset.id));
    if (!resp.ok) return null;
    const blob = await resp.blob();
    let name =
      asset.relPath?.split('/').pop() ||
      assetTitle(asset).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) ||
      `library-${asset.id.slice(0, 8)}`;
    if (!/\.[a-z0-9]{1,8}$/i.test(name)) {
      const ext = LIBRARY_MIME_EXT[(blob.type || asset.mime || '').toLowerCase()];
      if (ext) name = `${name}.${ext}`;
    }
    return new File([blob], name, { type: blob.type || asset.mime || 'application/octet-stream' });
  } catch {
    return null;
  }
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name);
}

/**
 * The staged-file chip's second line — "PNG · 1.7 MB". The extension is the
 * label people recognise; a name without a usable one falls back to the MIME
 * subtype's leading token (`image/svg+xml` → SVG) and, failing that, to the
 * size alone.
 */
function formatFileMeta(file: File): string {
  const size = formatFileSize(file.size);
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1];
  const kind = ext ?? file.type.split('/')[1]?.split(/[+;]/)[0];
  return kind ? `${kind.toUpperCase()} · ${size}` : size;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) {
      return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${bytes} B`;
}

// Cards shown in the 示例提示词 row. The showcase set behind it is much larger
// (18 for most chips, the whole library for decks) — the row shows the first
// five and leaves the rest to Community.
const HOME_HERO_MAX_PLUGIN_PRESETS = 5;
const HOME_HERO_PROMPT_MAX_HEIGHT = 180;
const HOME_HERO_AUTHORING_PROMPT_MAX_HEIGHT = 132;

function pluginMentionText(record: InstalledPluginRecord): string {
  return inlineMentionToken(record.title);
}

function buildHomeMentionEntities({
  activePluginRecord,
  activeSkillId,
  activeSkillTitle,
  connectorOptions,
  contextWorkspaceItems,
  mcpOptions,
  pluginOptions,
  selectedPluginContexts,
  stagedFiles,
  skillOptions,
}: {
  activePluginRecord: InstalledPluginRecord | null;
  activeSkillId: string | null;
  activeSkillTitle: string | null;
  connectorOptions: ConnectorDetail[];
  contextWorkspaceItems: WorkspaceContextItem[];
  mcpOptions: McpServerConfig[];
  pluginOptions: InstalledPluginRecord[];
  selectedPluginContexts: InstalledPluginRecord[];
  stagedFiles: File[];
  skillOptions: SkillSummary[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
  for (const item of contextWorkspaceItems) {
    entities.push({
      id: item.id,
      kind: 'workspace',
      label: item.label,
      token: inlineMentionToken(item.label),
      title: `Workspace: ${item.label}`,
    });
  }
  const fileSeen = new Set<string>();
  for (const file of stagedFiles) {
    if (fileSeen.has(file.name)) continue;
    fileSeen.add(file.name);
    entities.push({
      id: file.name,
      kind: 'file',
      label: file.name,
      token: inlineMentionToken(file.name),
      title: `File: ${file.name}`,
    });
  }
  const pluginSeen = new Set<string>();
  for (const plugin of [...selectedPluginContexts, ...pluginOptions]) {
    if (pluginSeen.has(plugin.id)) continue;
    pluginSeen.add(plugin.id);
    entities.push({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.title,
      token: pluginMentionText(plugin),
      title: `Plugin: ${plugin.title}`,
    });
  }
  if (activePluginRecord && !pluginSeen.has(activePluginRecord.id)) {
    entities.push({
      id: activePluginRecord.id,
      kind: 'plugin',
      label: activePluginRecord.title,
      token: pluginMentionText(activePluginRecord),
      title: `Plugin: ${activePluginRecord.title}`,
    });
  }
  const skillSeen = new Set<string>();
  for (const skill of skillOptions) {
    if (skillSeen.has(skill.id)) continue;
    skillSeen.add(skill.id);
    entities.push({
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token: inlineMentionToken(skill.name),
      title: `Skill: ${skill.name}`,
    });
    if (skill.id !== skill.name) {
      entities.push({
        id: skill.id,
        kind: 'skill',
        label: skill.id,
        token: inlineMentionToken(skill.id),
        title: `Skill: ${skill.name}`,
      });
    }
  }
  if (activeSkillId && activeSkillTitle && !skillSeen.has(activeSkillId)) {
    entities.push({
      id: activeSkillId,
      kind: 'skill',
      label: activeSkillTitle,
      token: inlineMentionToken(activeSkillTitle),
      title: `Skill: ${activeSkillTitle}`,
    });
  }
  for (const server of mcpOptions) {
    const label = server.label || server.id;
    entities.push({
      id: server.id,
      kind: 'mcp',
      label,
      token: inlineMentionToken(label),
      title: `MCP: ${label}`,
    });
    if (server.id !== label) {
      entities.push({
        id: server.id,
        kind: 'mcp',
        label: server.id,
        token: inlineMentionToken(server.id),
        title: `MCP: ${label}`,
      });
    }
  }
  for (const connector of connectorOptions) {
    entities.push({
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token: inlineMentionToken(connector.name),
      title: `Connector: ${connector.name}`,
    });
    if (connector.id !== connector.name) {
      entities.push({
        id: connector.id,
        kind: 'connector',
        label: connector.id,
        token: inlineMentionToken(connector.id),
        title: `Connector: ${connector.name}`,
      });
    }
  }
  return entities;
}

function FooterInputOption({
  field,
  value,
  designSystems,
  onChange,
  t,
}: {
  field: InputFieldSpec;
  value: unknown;
  designSystems: DesignSystemSummary[];
  onChange: (value: unknown) => void;
  t: ReturnType<typeof useT>;
}) {
  const label = footerInputLabel(field, t);
  if (field.name === 'speakerNotes') {
    const checked = footerSpeakerNotesEnabled(value);
    return (
      <button
        type="button"
        className={`home-hero__footer-switch${checked ? ' is-on' : ''}`}
        aria-label={label}
        aria-pressed={checked}
        data-testid="home-hero-footer-option-speakerNotes"
        onClick={() => onChange(checked ? 'no speaker notes' : 'include speaker notes')}
      >
        <span>{t('homeHero.footer.speakerNotes')}</span>
        <i aria-hidden />
      </button>
    );
  }
  if (field.name === 'designSystem') {
    // The composer binds its design-system choice as a TITLE string in the
    // plugin input (used by the apply query template). The shared picker is
    // id-based, so adapt: "不指定 / No design system" (or an unset value) maps
    // to a null id; otherwise resolve the title to its system id.
    const noneTitle = t('designSystemPicker.noneTitle');
    const currentTitle = value === undefined || value === null ? '' : String(value).trim();
    const selectedId =
      currentTitle && currentTitle !== noneTitle && currentTitle !== 'the active project design system'
        ? designSystems.find((system) => system.title === currentTitle)?.id ?? null
        : null;
    return (
      <DesignSystemPicker
        variant="footer"
        label={label}
        designSystems={designSystems}
        selectedId={selectedId}
        onChange={(id) =>
          onChange(id == null ? noneTitle : designSystems.find((system) => system.id === id)?.title ?? noneTitle)
        }
      />
    );
  }
  if (field.type === 'select' && Array.isArray(field.options)) {
    return (
      <FooterSelectOption
        fieldName={field.name}
        label={label}
        value={value === undefined || value === null ? '' : String(value)}
        options={[
          ...(field.placeholder ? [{ value: '', label: field.placeholder }] : []),
          ...field.options.map((option) => ({
            value: option,
            label: footerInputValueLabel(field, option, t),
            icon: footerInputValueIcon(field, option),
            modelIcon: field.name === 'model' ? modelOptionIcon(option, footerInputValueLabel(field, option, t)) : undefined,
            ratioIcon: field.name === 'ratio' ? ratioOptionIcon(option) : undefined,
          })),
        ]}
        onChange={onChange}
      />
    );
  }
  return (
    <label className="home-hero__footer-option home-hero__footer-option--text" data-field-name={field.name}>
      <span>{label}</span>
      <input
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder ?? ''}
        aria-label={label}
        data-testid={`home-hero-footer-option-${field.name}`}
      />
    </label>
  );
}

function FooterSelectOption({
  fieldName,
  label,
  value,
  options,
  searchable = false,
  searchPlaceholder,
  onChange,
}: {
  fieldName: string;
  label: string;
  value: string;
  options: FooterSelectItemOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  onChange: (value: unknown) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const visibleOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => (
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query) ||
      (option.description ?? '').toLowerCase().includes(query) ||
      (option.meta ?? '').toLowerCase().includes(query) ||
      (option.group ?? '').toLowerCase().includes(query)
    ));
  }, [options, search]);
  const groupedOptions = useMemo(() => {
    const groups: { label: string | null; options: FooterSelectItemOption[] }[] = [];
    for (const option of visibleOptions) {
      const groupLabel = option.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.label === groupLabel) {
        last.options.push(option);
      } else {
        groups.push({ label: groupLabel, options: [option] });
      }
    }
    return groups;
  }, [visibleOptions]);
  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  return (
    <div
      ref={ref}
      className={`home-hero__footer-option home-hero__footer-option--select${open ? ' is-open' : ''}`}
      data-field-name={fieldName}
    >
      <span>{label}</span>
      <button
        type="button"
        className="home-hero__footer-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={`home-hero-footer-option-${fieldName}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {selected?.preview ? <DesignSystemOptionPreview option={selected.preview} compact /> : null}
        {selected?.icon ? <FooterOptionIcon name={selected.icon} compact /> : null}
        {selected?.modelIcon ? <ModelOptionIcon icon={selected.modelIcon} compact /> : null}
        {selected?.ratioIcon ? <RatioOptionIcon icon={selected.ratioIcon} compact /> : null}
        <span className="home-hero__footer-select-label">{selected?.label ?? value}</span>
        <Icon name="chevron-down" size={12} aria-hidden />
      </button>
      {open ? (
        <div
          className={`home-hero__footer-select-menu${searchable ? ' home-hero__footer-select-menu--searchable' : ''}`}
          role="listbox"
          data-testid={`home-hero-footer-option-${fieldName}-menu`}
        >
          {searchable ? (
            <div className="home-hero__footer-select-search">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder ?? label}
                autoFocus
                data-testid={`home-hero-footer-option-${fieldName}-search`}
              />
              <div className="home-hero__footer-select-count">
                {t('homeHero.footer.availableCount', { n: visibleOptions.length })}
              </div>
            </div>
          ) : null}
          {groupedOptions.length === 0 ? (
            <div className="home-hero__footer-select-empty">{t('homeHero.footer.noMatches')}</div>
          ) : (
            groupedOptions.map((group, index) => (
              <div
                className="home-hero__footer-select-group"
                key={`${group.label ?? 'ungrouped'}:${group.options[0]?.value ?? index}`}
              >
                {group.label ? (
                  <div className="home-hero__footer-select-group-label">{group.label}</div>
                ) : null}
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={`home-hero__footer-select-item${option.value === value ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(option.submitValue ?? option.value);
                      setOpen(false);
                    }}
                  >
                    {option.preview ? <DesignSystemOptionPreview option={option.preview} /> : null}
                    {option.icon ? <FooterOptionIcon name={option.icon} /> : null}
                    {option.modelIcon ? <ModelOptionIcon icon={option.modelIcon} /> : null}
                    {option.ratioIcon ? <RatioOptionIcon icon={option.ratioIcon} /> : null}
                    <span className="home-hero__footer-select-copy">
                      <span className="home-hero__footer-select-label">{option.label}</span>
                      {option.description ? (
                        <span className="home-hero__footer-select-description">{option.description}</span>
                      ) : null}
                    </span>
                    {option.meta ? <span className="home-hero__footer-select-meta">{option.meta}</span> : null}
                    {option.value === value ? <Icon name="check" size={14} aria-hidden /> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

interface FooterSelectItemOption {
  value: string;
  submitValue?: string;
  label: string;
  group?: string;
  icon?: IconName;
  description?: string;
  meta?: string;
  modelIcon?: ModelOptionIconSpec;
  ratioIcon?: RatioOptionIconSpec;
  preview?: {
    title: string;
    swatches?: string[];
    logoUrl?: string;
  };
}

interface ModelOptionIconSpec {
  label: string;
  tone:
    | 'openai'
    | 'dalle'
    | 'seed'
    | 'sense'
    | 'grok'
    | 'google'
    | 'router'
    | 'flux'
    | 'elevenlabs'
    | 'fishaudio'
    | 'minimax'
    | 'suno'
    | 'audio'
    | 'custom';
  src?: string;
}

interface RatioOptionIconSpec {
  width: number;
  height: number;
  tone: 'square' | 'wide' | 'tall' | 'standard' | 'portrait' | 'custom';
}

function FooterOptionIcon({
  name,
  compact = false,
}: {
  name: IconName;
  compact?: boolean;
}) {
  return (
    <span
      className={`home-hero__footer-option-icon${compact ? ' home-hero__footer-option-icon--compact' : ''}`}
      aria-hidden
    >
      <Icon name={name} size={13} />
    </span>
  );
}

function ModelOptionIcon({
  icon,
  compact = false,
}: {
  icon: ModelOptionIconSpec;
  compact?: boolean;
}) {
  return (
    <span
      className={`home-hero__model-option-icon home-hero__model-option-icon--${icon.tone}${compact ? ' home-hero__model-option-icon--compact' : ''}`}
      aria-hidden
    >
      {icon.src ? <img src={icon.src} alt="" draggable={false} /> : icon.label}
    </span>
  );
}

function RatioOptionIcon({
  icon,
  compact = false,
}: {
  icon: RatioOptionIconSpec;
  compact?: boolean;
}) {
  return (
    <span
      className={`home-hero__ratio-option-icon home-hero__ratio-option-icon--${icon.tone}${compact ? ' home-hero__ratio-option-icon--compact' : ''}`}
      aria-hidden
    >
      <i style={{ width: icon.width, height: icon.height }} />
    </span>
  );
}

function DesignSystemOptionPreview({
  option,
  compact = false,
}: {
  option: { title: string; swatches?: string[]; logoUrl?: string };
  compact?: boolean;
}) {
  const swatches = (option.swatches ?? []).filter(Boolean).slice(0, compact ? 2 : 3);
  const initial = option.title.trim().charAt(0).toUpperCase() || 'D';
  return (
    <span
      className={`home-hero__ds-option-preview${compact ? ' home-hero__ds-option-preview--compact' : ''}`}
      aria-hidden
    >
      {option.logoUrl ? (
        <img src={option.logoUrl} alt="" loading="lazy" />
      ) : swatches.length > 0 ? (
        swatches.map((swatch, index) => (
          <i key={`${swatch}-${index}`} style={{ background: swatch }} />
        ))
      ) : (
        <b>{initial}</b>
      )}
    </span>
  );
}

function footerInputLabel(field: InputFieldSpec, t: ReturnType<typeof useT>): string {
  switch (field.name) {
    case 'designSystem':
      return t('homeHero.footer.designSystem');
    case 'fidelity':
      return t('newproj.fidelityLabel');
    case 'speakerNotes':
      return t('homeHero.footer.speakerNotes');
    case 'model':
      return t('newproj.modelLabel');
    case 'ratio':
      return t('homeHero.footer.ratio');
    case 'duration':
      return t('homeHero.footer.duration');
    case 'resolution':
      return t('homeHero.footer.resolution');
    default:
      return field.label ?? field.name;
  }
}

function footerInputValueLabel(field: InputFieldSpec, value: string, t: ReturnType<typeof useT>): string {
  if (field.name === 'fidelity') {
    if (value === 'wireframe') return t('newproj.fidelityWireframe');
    if (value === 'high-fidelity') return t('newproj.fidelityHigh');
  }
  if (field.name === 'speakerNotes') {
    return footerSpeakerNotesEnabled(value) ? t('homeHero.footer.speakerNotes') : t('homeHero.footer.noSpeakerNotes');
  }
  return optionLabelMap(field)[value] ?? value;
}

function footerSpeakerNotesEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  return !(
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'none' ||
    normalized.includes('no speaker')
  );
}

function footerInputValueIcon(field: InputFieldSpec, value: string): IconName | undefined {
  if (field.name === 'fidelity') {
    if (value === 'wireframe') return 'grid';
    if (value === 'high-fidelity') return 'sparkles';
  }
  return undefined;
}

function modelOptionIcon(value: string, label: string): ModelOptionIconSpec {
  const normalized = `${value} ${label}`.toLowerCase();
  if (normalized.includes('dall-e')) return { label: 'OpenAI', tone: 'dalle', src: '/model-icons/openai.svg' };
  if (normalized.includes('gpt-image') || normalized.includes('openai') || normalized.includes('sora')) {
    return { label: 'OpenAI', tone: 'openai', src: '/model-icons/openai.svg' };
  }
  if (normalized.includes('seedream') || normalized.includes('seededit') || normalized.includes('seedance') || normalized.includes('doubao') || normalized.includes('bytedance')) {
    return { label: 'ByteDance', tone: 'seed', src: '/model-icons/bytedance.svg' };
  }
  if (normalized.includes('senseaudio')) return { label: 'SA', tone: 'sense' };
  if (normalized.includes('grok') || normalized.includes('xai') || normalized.includes('xai/')) {
    return { label: 'xAI', tone: 'grok', src: '/model-icons/x.svg' };
  }
  if (normalized.includes('gemini') || normalized.includes('imagen') || normalized.includes('veo') || normalized.includes('google') || normalized.includes('nano-banana')) {
    return { label: 'Google Gemini', tone: 'google', src: '/model-icons/google-gemini.svg' };
  }
  if (normalized.includes('flux') || normalized.includes('bfl') || normalized.includes('black-forest')) {
    return { label: 'FLUX', tone: 'flux', src: '/model-icons/flux.svg' };
  }
  if (normalized.includes('openrouter')) return { label: 'OpenRouter', tone: 'router', src: '/model-icons/openrouter.svg' };
  if (normalized.includes('imagerouter') || normalized.includes('/')) return { label: 'IR', tone: 'router' };
  if (normalized.includes('eleven')) {
    return { label: 'ElevenLabs', tone: 'elevenlabs', src: '/model-icons/elevenlabs.svg' };
  }
  if (normalized.includes('fish')) {
    return { label: 'Fish Audio', tone: 'fishaudio', src: '/model-icons/fishaudio.svg' };
  }
  if (normalized.includes('minimax')) {
    return { label: 'MiniMax', tone: 'minimax', src: '/model-icons/minimax.svg' };
  }
  if (normalized.includes('suno')) return { label: 'Suno', tone: 'suno', src: '/model-icons/suno.svg' };
  if (
    normalized.includes('udio') ||
    normalized.includes('audio') ||
    normalized.includes('voice')
  ) {
    return { label: modelInitials(label), tone: 'audio' };
  }
  return { label: modelInitials(label || value), tone: 'custom' };
}

function modelInitials(input: string): string {
  const cleaned = input
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/^(gpt|model)[-_ ]*/i, '')
    .trim();
  const parts = cleaned.split(/[^a-z0-9]+/i).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
    : (parts[0] ?? cleaned).slice(0, 2);
  return initials.toUpperCase() || 'M';
}

function ratioOptionIcon(value: string): RatioOptionIconSpec {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
  const rawWidth = Number(match?.[1] ?? 1);
  const rawHeight = Number(match?.[2] ?? 1);
  const ratioWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1;
  const ratioHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
  const maxEdge = 17;
  const scale = maxEdge / Math.max(ratioWidth, ratioHeight);
  const width = Math.max(8, Math.round(ratioWidth * scale));
  const height = Math.max(8, Math.round(ratioHeight * scale));
  const normalized = `${ratioWidth}:${ratioHeight}`;
  const tone = (() => {
    if (normalized === '1:1') return 'square';
    if (normalized === '16:9') return 'wide';
    if (normalized === '9:16') return 'tall';
    if (normalized === '4:3') return 'standard';
    if (normalized === '3:4') return 'portrait';
    return ratioWidth > ratioHeight ? 'wide' : ratioHeight > ratioWidth ? 'tall' : 'custom';
  })();
  return { width, height, tone };
}

function optionLabelMap(field: InputFieldSpec): Record<string, string> {
  const labels = (field as { optionLabels?: unknown }).optionLabels;
  return labels && typeof labels === 'object' && !Array.isArray(labels)
    ? labels as Record<string, string>
    : {};
}

function stripHomeMentionToken(value: string, label: string): string {
  const token = inlineMentionToken(label);
  return value.replace(
    new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
    '$1',
  );
}

function fileMatchesQuery(file: File, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [file.name, file.type || '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string, locale: Locale): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    localizePluginTitle(locale, plugin),
    plugin.id,
    plugin.sourceKind,
    plugin.manifest?.description ?? '',
    localizePluginDescription(locale, plugin),
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function skillMatchesQuery(skill: SkillSummary, query: string, locale: Locale): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    skill.id,
    skill.name,
    localizeSkillName(locale, skill),
    skill.description,
    localizeSkillDescription(locale, skill),
    skill.mode,
    skill.surface ?? '',
    ...skill.triggers,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    server.id,
    server.label ?? '',
    server.transport,
    server.url ?? '',
    server.command ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function connectorMatchesQuery(connector: ConnectorDetail, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    connector.id,
    connector.name,
    connector.provider,
    connector.category,
    connector.description ?? '',
    connector.accountLabel ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPluginSourceLabel(plugin: InstalledPluginRecord): string {
  return plugin.sourceKind === 'bundled' ? 'Official' : 'My plugin';
}

function getPluginQueryPreview(plugin: InstalledPluginRecord): string {
  const raw = plugin.manifest?.od?.useCase?.query;
  const value =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw.en ?? raw['zh-CN'] ?? Object.values(raw).find((entry): entry is string => (
            typeof entry === 'string' && entry.length > 0
          )) ?? ''
        : '';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed;
}

interface RailGroupProps {
  group: ChipGroup;
  activeChipId: string | null;
  pendingChipId: string | null;
  pendingPluginId: string | null;
  pluginsLoading: boolean;
  onPickChip: (chip: HomeHeroChip) => void;
  variant?: 'rail' | 'tabs';
  // First-run guide: this chip carries the attention sheen.
  pulseChipId?: string | null;
  // Hover-preview hook: the create rail reports which chip the pointer is over
  // (or null on leave) so the footer Template picker can preview it.
  onHoverChip?: (chipId: string | null) => void;
  children?: ReactNode;
}

function RailGroup({
  group,
  activeChipId,
  pendingChipId,
  pendingPluginId,
  pluginsLoading,
  onPickChip,
  variant = 'rail',
  pulseChipId = null,
  onHoverChip,
  children,
}: RailGroupProps) {
  const t = useT();
  // The inline create rail leads with the slide deck and runs through the core
  // build scenarios in a fixed order (see `orderedCreateChips`); every other
  // group renders in catalog order.
  const chips = useMemo(
    () => (group === 'create' ? orderedCreateChips() : chipsForGroup(group)),
    [group],
  );
  const isTabs = variant === 'tabs';

  // Edge auto-scroll so the overflowing scenario rail stays reachable without a
  // trackpad (see EdgeAutoScroll). Only the tabs variant scrolls; for the
  // legacy rail variant scrollRef stays unattached and the hook is inert.
  const edgeScroll = useEdgeAutoScroll(chips.length);

  const cards = chips.map((chip) => {
    const isActive = activeChipId === chip.id;
    const isPending = pendingChipId === chip.id;
    const disabled = pluginsLoading || isPending || pendingPluginId !== null;
    const nextStep = homeHeroChipTitle(chip, t);
    // Card variant (the default create rail): an illustrated scenario card —
    // an intent thumbnail (ScenarioArt) + title + one-line description. The
    // full "what happens next" sentence stays on the native `title` tooltip
    // instead of an inline line that resized the card on hover. The legacy
    // `rail`/pill markup is kept for any caller that still asks for `variant="rail"`.
    if (isTabs) {
      const description = homeHeroChipDescription(chip.id, t);
      const cardCls = ['home-hero__type-tab', `home-hero__type-tab--${group}`, 'home-hero__scenario-card'];
      if (isActive) cardCls.push('is-active');
      if (isPending) cardCls.push('is-pending');
      if (pulseChipId === chip.id) cardCls.push('home-hero__attention-sheen');
      return (
        <button
          key={chip.id}
          type="button"
          className={cardCls.join(' ')}
          data-chip-id={chip.id}
          data-testid={`home-hero-rail-${chip.id}`}
          onClick={() => onPickChip(chip)}
          onMouseEnter={() => onHoverChip?.(chip.id)}
          disabled={disabled}
          role="tab"
          aria-selected={isActive}
          title={nextStep}
        >
          <span className="home-hero__scenario-card-art" aria-hidden>
            <ScenarioArt chipId={chip.id} fallbackIcon={chip.icon} />
          </span>
          <span className="home-hero__scenario-card-body">
            <span className="home-hero__scenario-card-title home-hero__type-tab-label">
              {homeHeroChipLabel(chip.id, t)}
            </span>
            {description ? (
              <span className="home-hero__scenario-card-desc">{description}</span>
            ) : null}
          </span>
        </button>
      );
    }
    const cls = ['home-hero__rail-chip', `home-hero__rail-chip--${group}`];
    if (isActive) cls.push('is-active');
    if (isPending) cls.push('is-pending');
    if (pulseChipId === chip.id) cls.push('home-hero__attention-sheen');
    return (
      <button
        key={chip.id}
        type="button"
        className={cls.join(' ')}
        data-chip-id={chip.id}
        data-testid={`home-hero-rail-${chip.id}`}
        onClick={() => onPickChip(chip)}
        disabled={disabled}
        aria-pressed={isActive}
        title={nextStep}
      >
        <Icon
          name={chip.icon}
          size={14}
          className="home-hero__rail-chip-icon"
        />
        <span className="home-hero__rail-chip-label">
          {homeHeroChipLabel(chip.id, t)}
        </span>
      </button>
    );
  });

  if (isTabs) {
    return (
      <div
        className="home-hero__scenario-cards-wrap"
        onMouseLeave={() => onHoverChip?.(null)}
      >
        <div
          ref={edgeScroll.scrollRef}
          className={`home-hero__type-tabs home-hero__type-tabs--${group} home-hero__scenario-cards`}
          data-testid="home-hero-type-tabs"
          data-rail-group={group}
          role="tablist"
          aria-label={t('homeHero.railAria')}
        >
          {cards}
          {children}
        </div>
        <EdgeScrollZones {...edgeScroll} />
      </div>
    );
  }

  return (
    <div
      className={`home-hero__rail-group home-hero__rail-group--${group}`}
      data-rail-group={group}
    >
      {cards}
      {children}
    </div>
  );
}

/**
 * The staged-attachment band: one nowrap row of chips that scrolls sideways.
 * Once the chips outrun the card, the overflowing edge gets a mask in the
 * card's own fill with a paging button on top, so the row reads as "there is
 * more this way" instead of a chip silently sliced off at the border.
 */
function AttachmentBand({ ariaLabel, children }: { ariaLabel?: string; children: ReactNode }) {
  const t = useT();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      // 1px of slack: fractional scroll offsets (page zoom, trackpad momentum)
      // otherwise strand the arrow at either end of the track.
      const next =
        max > 1
          ? { start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 }
          : { start: false, end: false };
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    // Staging a file grows the row's scrollWidth without touching the
    // scroller's own box, so ResizeObserver alone never fires — watch the
    // subtree for added/removed chips too. (`.home-hero__active-file-group` is
    // `display: contents`, so its chips are NOT direct children here.)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null;
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);

  const page = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Just under a full viewport so the chip at the edge stays half in frame
    // and the jump reads as continuous.
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="home-hero__active-band">
      <div className="home-hero__active" ref={scrollerRef} aria-label={ariaLabel}>
        {children}
      </div>
      {edges.start ? (
        <>
          <span className="home-hero__active-fade home-hero__active-fade--start" aria-hidden />
          <button
            type="button"
            className="home-hero__active-page home-hero__active-page--prev"
            data-testid="home-hero-attachments-prev"
            aria-label={t('homeHero.attachmentsScrollPrev')}
            onClick={() => page(-1)}
          >
            <Icon name="chevron-left" size={16} />
          </button>
        </>
      ) : null}
      {edges.end ? (
        <>
          <span className="home-hero__active-fade home-hero__active-fade--end" aria-hidden />
          <button
            type="button"
            className="home-hero__active-page home-hero__active-page--next"
            data-testid="home-hero-attachments-next"
            aria-label={t('homeHero.attachmentsScrollNext')}
            onClick={() => page(1)}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </>
      ) : null}
    </div>
  );
}

interface ShortcutsMenuProps {
  activeChipId: string | null;
  pendingChipId: string | null;
  pendingPluginId: string | null;
  pluginsLoading: boolean;
  open: boolean;
  refNode: RefObject<HTMLDivElement>;
  onOpenChange: (open: boolean) => void;
  onPickChip: (chip: HomeHeroChip) => void;
}

function ShortcutsMenu({
  activeChipId,
  pendingChipId,
  pendingPluginId,
  pluginsLoading,
  open,
  refNode,
  onOpenChange,
  onPickChip,
}: ShortcutsMenuProps) {
  const t = useT();
  const shortcuts = useMemo(() => chipsForGroup('migrate'), []);
  const disabled = pluginsLoading || pendingPluginId !== null;
  const hasActiveShortcut = shortcuts.some((chip) => chip.id === activeChipId);
  const hasPendingShortcut = shortcuts.some((chip) => chip.id === pendingChipId);
  const triggerClass = [
    'home-hero__type-tab',
    'home-hero__type-tab--more',
    hasActiveShortcut ? 'is-active' : '',
    hasPendingShortcut ? 'is-pending' : '',
  ].filter(Boolean).join(' ');

  // The trigger lives inside the horizontally-scrolling rail, whose
  // `overflow-x: auto` also clips vertically — so an in-flow dropdown gets
  // truncated. Portal the panel to the body with fixed positioning anchored to
  // the trigger, and keep it aligned as the rail scrolls or the window resizes.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPanelPos({
        top: Math.round(rect.bottom + 6),
        right: Math.round(window.innerWidth - rect.right),
      });
    };
    update();
    window.addEventListener('resize', update);
    // Capture phase: scroll events don't bubble, so this is how the panel
    // follows the trigger when the rail itself scrolls.
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);
  return (
    <div
      ref={refNode}
      className="home-hero__shortcut-menu"
      data-testid="home-hero-shortcuts"
      data-rail-group="migrate"
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        data-testid="home-hero-shortcuts-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('homeHero.moreShortcuts')}
        title={t('homeHero.moreShortcuts')}
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="more-horizontal" size={16} className="home-hero__type-tab-icon" />
      </button>
      {open && panelPos
        ? createPortal(
        <div
          className="home-hero__shortcut-menu-panel"
          role="menu"
          aria-label={t('homeHero.moreShortcuts')}
          data-testid="home-hero-shortcuts-menu"
          data-shortcuts-panel=""
          data-rail-group="migrate"
          style={{ position: 'fixed', top: panelPos.top, right: panelPos.right }}
        >
          {shortcuts.map((chip) => {
            const isActive = activeChipId === chip.id;
            const isPending = pendingChipId === chip.id;
            const cls = ['home-hero__shortcut-menu-item'];
            if (isActive) cls.push('is-active');
            if (isPending) cls.push('is-pending');
            return (
              <button
                key={chip.id}
                type="button"
                role="menuitem"
                className={cls.join(' ')}
                data-chip-id={chip.id}
                data-testid={`home-hero-rail-${chip.id}`}
                disabled={pluginsLoading || isPending || pendingPluginId !== null}
                title={homeHeroChipTitle(chip, t)}
                onClick={() => onPickChip(chip)}
              >
                <Icon name={chip.icon} size={14} className="home-hero__shortcut-menu-icon" />
                <span>{homeHeroChipLabel(chip.id, t)}</span>
              </button>
            );
          })}
        </div>,
          document.body,
        )
        : null}
    </div>
  );
}

// Scenario subtitle shown under the title on the illustrated card rail.
function homeHeroChipDescription(chipId: string, t: ReturnType<typeof useT>): string {
  switch (chipId) {
    case 'prototype': return t('homeHero.chip.prototypeDesc');
    case 'web-clone': return t('homeHero.chip.webCloneDesc');
    case 'wireframe': return t('homeHero.chip.wireframeDesc');
    case 'mobile': return t('homeHero.chip.mobileDesc');
    case 'deck': return t('homeHero.chip.deckDesc');
    case 'document': return t('homeHero.chip.documentDesc');
    case 'image': return t('homeHero.chip.imageDesc');
    case 'video': return t('homeHero.chip.videoDesc');
    case 'audio': return t('homeHero.chip.audioDesc');
    case 'hyperframes': return t('homeHero.chip.hyperframesDesc');
    case 'webgl': return t('homeHero.chip.webglDesc');
    case 'live-artifact': return t('homeHero.chip.liveArtifactDesc');
    case 'create-brand-kit': return t('homeHero.chip.createBrandKitDesc');
    default: return '';
  }
}

function fallbackPlaceholderScenarioText(
  chipId: string,
  locale: Locale,
  t: ReturnType<typeof useT>,
): string | null {
  const label = homeHeroChipLabel(chipId, t).trim();
  if (!label || label === chipId) return null;
  const description = homeHeroChipDescription(chipId, t).trim();
  const kind = promptLocaleKind(locale);
  if (kind === 'zh') {
    return description ? `创建一个${label}：${description}` : `创建一个${label}`;
  }
  if (kind === 'ja') {
    return description ? `${label}を作成する：${description}` : `${label}を作成する`;
  }
  return description
    ? `Create ${englishArticle(label)} ${label}: ${description}`
    : `Create ${englishArticle(label)} ${label}`;
}

// The hover "what happens next" line — describes how the scenario will be
// consumed once picked (e.g. "Open a chat that builds a clickable prototype").
function homeHeroChipTitle(chip: HomeHeroChip, t: ReturnType<typeof useT>): string {
  switch (chip.id) {
    case 'prototype': return t('homeHero.chip.prototypeNext');
    case 'web-clone': return t('homeHero.chip.webCloneNext');
    case 'wireframe': return t('homeHero.chip.wireframeNext');
    case 'mobile': return t('homeHero.chip.mobileNext');
    case 'deck': return t('homeHero.chip.deckNext');
    case 'document': return t('homeHero.chip.documentNext');
    case 'image': return t('homeHero.chip.imageNext');
    case 'video': return t('homeHero.chip.videoNext');
    case 'audio': return t('homeHero.chip.audioNext');
    case 'live-artifact': return t('homeHero.chip.liveArtifactHint');
    case 'hyperframes': return t('homeHero.chip.hyperframesHint');
    case 'create-brand-kit': return t('homeHero.chip.createBrandKitHint');
    case 'create-plugin': return t('homeHero.chip.createPluginHint');
    case 'figma': return t('homeHero.chip.figmaHint');
    case 'template': return t('homeHero.chip.templateHint');
    default: return homeHeroChipLabel(chip.id, t);
  }
}

// Generic catch-all scenario routers are not real "example" templates: they
// ship no concrete seed for the gallery and only exist as the silent default
// binding a media surface carries (see scenario-defaults.ts). Keep them out of
// the example-prompt presets so e.g. the "Media generation (default scenario)"
// card never appears under the audio/image/video chips — and, because the
// example card's selected state is keyed on the active plugin id, never shows
// up pre-selected when a media mode is entered.
//
// `example-web-clone` is the Website clone chip's own base scenario, not a
// concrete example. The per-site examples are plain text prompt cards (from
// HOME_PROMPT_EXAMPLES) rather than plugins, so hide the base plugin to keep the
// preset rail empty for web-clone and let those text cards show instead.
const EXAMPLE_PRESET_HIDDEN_PLUGIN_IDS = new Set<string>([
  'od-media-generation',
  'example-web-clone',
]);

export function homeHeroExamplePluginsForChip(
  chipId: string,
  plugins: InstalledPluginRecord[],
  locale: Locale,
): InstalledPluginRecord[] {
  // The top-level rail is a curated showcase capped at 18 for most chips. The
  // deck chip is the exception: surface the FULL slide-template library so every
  // bundled deck is reachable as an example prompt straight from "All" (without
  // first picking a sub-category), keeping the rail in parity with the Community
  // section's "Slides" count.
  const showcaseLimit = chipId === 'deck' ? Number.POSITIVE_INFINITY : 18;
  const presets = plugins
    .filter((plugin) => !EXAMPLE_PRESET_HIDDEN_PLUGIN_IDS.has(plugin.id))
    .filter((plugin) => (
      pluginMatchesExampleChip(plugin, chipId) ||
      curatedPluginPriorityForChip(plugin, chipId) !== null
    ))
    .filter((plugin) => (
      Boolean(pluginPresetQuery(plugin, locale)) ||
      curatedPluginPriorityForChip(plugin, chipId) !== null
    ))
    .sort((a, b) => comparePluginPresetOrder(a, b, chipId))
    .slice(0, showcaseLimit);
  if (chipId === 'image') {
    return movePluginPresetToEnd(presets, 'example-hatch-pet');
  }
  return presets;
}

function comparePluginPresetOrder(
  a: InstalledPluginRecord,
  b: InstalledPluginRecord,
  chipId: string,
): number {
  // Gallery order (OPEND-449): pins first, default seeds + no-preview tiles sunk
  // to the bottom, then usage popularity for non-prototype chips. The prototype
  // chip stays curation-governed, so popularity is skipped and it keeps its
  // curated order.
  const curationGoverned = chipId === 'prototype';
  const gallery = comparePluginGalleryOrder(a.id, b.id, curationGoverned, curationGoverned);
  if (gallery !== 0) return gallery;
  const aCurated = curatedPluginPriorityForChip(a, chipId);
  const bCurated = curatedPluginPriorityForChip(b, chipId);
  if (aCurated !== null || bCurated !== null) {
    if (aCurated !== null && bCurated === null) return -1;
    if (aCurated === null && bCurated !== null) return 1;
    if (aCurated !== bCurated) return (aCurated ?? 0) - (bCurated ?? 0);
  }
  const rankDelta = pluginPresetRank(b, chipId) - pluginPresetRank(a, chipId);
  if (rankDelta !== 0) return rankDelta;
  return (a.title || a.id).localeCompare(b.title || b.id);
}

function movePluginPresetToEnd(
  records: InstalledPluginRecord[],
  pluginId: string,
): InstalledPluginRecord[] {
  const index = records.findIndex((record) => record.id === pluginId);
  if (index < 0 || index === records.length - 1) return records;
  const record = records[index]!;
  return [
    ...records.slice(0, index),
    ...records.slice(index + 1),
    record,
  ];
}

export function pluginMatchesExampleChip(record: InstalledPluginRecord, chipId: string): boolean {
  const slugs = pluginRecordSlugs(record);
  const has = (...values: string[]) => values.some((value) => slugs.has(value));
  const hasPart = (...values: string[]) => {
    const all = [...slugs];
    return values.some((value) =>
      all.some((slug) => slug === value || slug.includes(value) || slug.split('-').includes(value)),
    );
  };
  switch (chipId) {
    case 'prototype':
      return has('prototype') || hasPart('web-prototype');
    case 'web-clone':
      // Website reproduction flows (e.g. example-web-clone / site-clone kits).
      return has('web-clone', 'website-clone', 'site-clone') || hasPart('web-clone', 'website-clone');
    case 'wireframe':
      // Lo-fi / sketch / whiteboard explorations (e.g. wireframe-sketch).
      return (
        hasPart('wireframe') ||
        has('low-fidelity', 'lo-fi-mockup', 'sketch-wireframe', 'whiteboard-sketch', 'hand-drawn')
      );
    case 'mobile':
      // Native mobile app prototypes: iOS / Android phone screens.
      return (
        (hasPart('mobile') ||
          has('ios-app', 'android-app', 'phone-screen', 'app-mockup', 'app-ui')) &&
        !hasPart('video', 'audio', 'image', 'hyperframes')
      );
    case 'document':
      // Documents: resumes, reports, invoices, papers, briefs, PDFs.
      return (
        (has('resume', 'cv', 'invoice', 'document', 'docs', 'report', 'paper') ||
          hasPart(
            'resume',
            'documentation',
            'invoice',
            'report',
            'whitepaper',
            'academic-paper',
            'case-report',
            'meeting-notes',
            'runbook',
            'eguide',
            'letter',
            'dossier',
            'memo',
          )) &&
        !hasPart('video', 'audio', 'hyperframes', 'deck', 'slides')
      );
    case 'deck':
      return has('deck', 'slides', 'slide-deck') || hasPart('slide', 'deck');
    case 'hyperframes':
      return hasPart('hyperframes', 'hyperframe');
    case 'live-artifact':
      return has('live-artifact') || hasPart('live-artifact');
    case 'webgl':
      return (
        has('webgl', 'webgl2', 'shader', 'gpu') ||
        hasPart('webgl', 'shader', 'gpu')
      );
    case 'image':
      return (has('image') || hasPart('image-template')) && !hasPart('video', 'audio', 'live-artifact');
    case 'video':
      return (has('video') || hasPart('video-template')) && !hasPart('hyperframes', 'audio');
    case 'audio':
      // Exclude video / HyperFrames templates that merely carry an
      // `audio-reactive` tag (substring-matched by hasPart('audio')): their
      // home is the Video / HyperFrames chips, not the audio gallery.
      return (has('audio') || hasPart('audio')) && !hasPart('video', 'hyperframes');
    default:
      return false;
  }
}

function pluginPresetRank(record: InstalledPluginRecord, chipId: string): number {
  const slugs = pluginRecordSlugs(record);
  let score = 0;
  if (record.sourceKind === 'bundled') score += 20;
  if (record.id.startsWith('example-')) score += 12;
  if (record.id.includes('template')) score += 8;
  if (inferPluginPreview(record).kind !== 'text') score += 6;
  if (slugs.has(chipId)) score += 4;
  if (record.manifest?.od?.preview) score += 3;
  return score;
}

function pluginRecordSlugs(record: InstalledPluginRecord): Set<string> {
  const od = record.manifest?.od ?? {};
  const rawValues = [
    record.id,
    record.title,
    record.manifest?.name,
    record.manifest?.title,
    fieldString(od, 'mode'),
    fieldString(od, 'surface'),
    fieldString(od, 'scenario'),
    fieldString(od, 'taskKind'),
    ...(record.manifest?.tags ?? []),
  ];
  return new Set(rawValues.map((value) => slugifyHomeValue(value ?? '')).filter(Boolean));
}

function fieldString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function slugifyHomeValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function pluginPresetPromptPreview(
  record: InstalledPluginRecord,
  locale: Locale,
  chipId: string,
): string {
  const query = pluginPresetQuery(record, locale);
  const rendered = query
    ? renderPluginPresetQuery(record, query)
    : localizePluginDescription(locale, record);
  return textPromptForPluginPreset(record, rendered, chipId, locale);
}

function textPromptForPluginPreset(
  record: InstalledPluginRecord,
  prompt: string,
  chipId: string,
  locale: Locale,
): string {
  const cleaned = prompt.trim();
  const structured = parseStructuredPresetPrompt(cleaned);
  if (structured !== null) {
    return describeStructuredPresetPrompt(record, structured, chipId, locale);
  }
  if (cleaned.length > 0) return cleaned;
  return fallbackPluginPresetPrompt(record, chipId, locale);
}

function parseStructuredPresetPrompt(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function describeStructuredPresetPrompt(
  record: InstalledPluginRecord,
  structured: unknown,
  chipId: string,
  locale: Locale,
): string {
  const kind = promptLocaleKind(locale);
  const artifact = pluginPresetArtifactLabel(chipId, kind);
  const title = localizePluginTitle(locale, record).trim();
  const strings = collectStructuredPromptStrings(structured);
  const main =
    strings.find((item) => isMainPromptField(item.key) && item.value.length >= 8)?.value ??
    strings.find((item) => item.value.length >= 16)?.value ??
    (localizePluginDescription(locale, record) || title);
  const detailValues = uniquePromptStrings(
    strings
      .filter((item) => item.value !== main)
      .filter((item) => isUsefulPromptDetail(item.value))
      .map((item) => item.value),
  ).slice(0, 4);
  if (kind === 'zh') {
    const details = detailValues.length > 0
      ? `重点包含：${detailValues.join('；')}。`
      : '';
    return `使用「${title}」插件生成${artifact}。${main}${sentenceEnd(main)}${details}`;
  }
  if (kind === 'ja') {
    const details = detailValues.length > 0
      ? `重点として：${detailValues.join('、')}。`
      : '';
    return `「${title}」プラグインで${artifact}を生成します。${main}${sentenceEnd(main)}${details}`;
  }
  const details = detailValues.length > 0
    ? ` Include ${detailValues.join('; ')}.`
    : '';
  return `Create ${englishArticle(artifact)} ${artifact} with the "${title}" preset. ${main}${englishSentenceEnd(main)}${details}`;
}

function collectStructuredPromptStrings(
  value: unknown,
  path: string[] = [],
): Array<{ key: string; value: string }> {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    return [{ key: path[path.length - 1] ?? '', value: text }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStructuredPromptStrings(item, [...path, String(index)]));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      collectStructuredPromptStrings(child, [...path, key]),
    );
  }
  return [];
}

function isMainPromptField(key: string): boolean {
  return [
    'instruction',
    'prompt',
    'description',
    'subject',
    'brief',
    'goal',
  ].includes(key.toLowerCase());
}

function isUsefulPromptDetail(value: string): boolean {
  if (value.length < 8) return false;
  if (/^l\d+:/iu.test(value)) return false;
  return true;
}

function uniquePromptStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function sentenceEnd(value: string): string {
  return /[.!?。！？]$/u.test(value.trim()) ? '' : '。';
}

function englishSentenceEnd(value: string): string {
  return /[.!?。！？]$/u.test(value.trim()) ? '' : '.';
}

function pluginPresetArtifactLabel(chipId: string, kind: PromptLocaleKind): string {
  if (kind === 'zh') {
    switch (chipId) {
      case 'prototype': return '一个交互原型';
      case 'deck': return '一套 PPT slide';
      case 'image': return '一张图片';
      case 'video': return '一段视频';
      case 'hyperframes': return '一段 HyperFrames 动效视频';
      case 'audio': return '一段音频';
      default: return '一个设计产物';
    }
  }
  if (kind === 'ja') {
    switch (chipId) {
      case 'prototype': return 'インタラクティブなプロトタイプ';
      case 'deck': return 'PPT スライド';
      case 'image': return '画像';
      case 'video': return '動画';
      case 'hyperframes': return 'HyperFrames のモーション動画';
      case 'audio': return 'オーディオ';
      default: return 'デザイン成果物';
    }
  }
  switch (chipId) {
    case 'prototype': return 'interactive prototype';
    case 'deck': return 'PPT slide deck';
    case 'image': return 'image';
    case 'video': return 'video';
    case 'hyperframes': return 'HyperFrames motion video';
    case 'audio': return 'audio clip';
    default: return 'design artifact';
  }
}

function englishArticle(noun: string): 'a' | 'an' {
  return /^[aeiou]/iu.test(noun) ? 'an' : 'a';
}

function fallbackPluginPresetPrompt(
  record: InstalledPluginRecord,
  chipId: string,
  locale: Locale,
): string {
  const kind = promptLocaleKind(locale);
  const artifact = pluginPresetArtifactLabel(chipId, kind);
  const title = localizePluginTitle(locale, record);
  const description = localizePluginDescription(locale, record).trim();
  if (kind === 'zh') {
    return `使用「${title}」插件生成${artifact}${description ? `，方向是：${description}` : ''}。`;
  }
  if (kind === 'ja') {
    return `「${title}」プラグインで${artifact}を生成します${description ? `。方向性：${description}` : ''}。`;
  }
  return `Create ${englishArticle(artifact)} ${artifact} with the "${title}" preset${description ? `: ${description}` : '.'}`;
}

const HOME_PROMPT_EXAMPLES: Record<Locale, Record<string, string[]>> = {
  "en": {
    "web-clone": [
      "Website URL to clone: https://open-design.ai",
    ],
    prototype: [
      "Design a high-converting website for an AI CRM with a clear hero, feature story, proof points, and trial CTA",
      "Create a desktop dashboard for a team knowledge base with search, recent updates, permissions, and collaboration entry points",
      "Redesign onboarding for a financial SaaS product so new users can connect data, finish setup, and see first value fast",
      "Prototype a mobile fitness coaching app covering goal setup, weekly plans, workout check-ins, and progress review",
    ],
    wireframe: [
      "Wireframe a SaaS dashboard with navigation, key metrics, a data table, and an empty state",
      "Sketch the lo-fi flow for a checkout: cart, shipping, payment, and confirmation screens",
      "Lay out a content management screen with list, detail, and edit states in greybox fidelity",
      "Wireframe an onboarding wizard covering account, workspace, invite, and first-run steps",
    ],
    mobile: [
      "Design a mobile banking app with home balance, transactions, transfer, and card management screens",
      "Lay out a food delivery app covering browse, restaurant detail, cart, and order tracking",
      "Prototype a habit-tracker app with today view, streak detail, add-habit, and stats screens",
      "Design a messaging app with chat list, conversation, profile, and settings screens",
    ],
    document: [
      "Draft a one-page resume for a senior product designer with summary, experience, skills, and selected work",
      "Write a polished project proposal with problem, approach, timeline, and budget sections",
      "Create a product one-pager covering the pitch, key features, pricing, and a call to action",
      "Generate a tidy meeting brief with agenda, decisions, owners, and next steps",
    ],
    deck: [
      "Research the market opportunity for a product launch, including competitors, target users, pricing hypotheses, and launch narrative",
      "Generate a weekly team status report with progress, risks, metric changes, and next-week priorities",
      "Design an investor pitch with market sizing, growth model, product advantage, and three-year forecast data",
      "Create a strategic business review deck covering quarterly performance, root causes, opportunities, and next actions",
    ],
    image: [
      "Generate a glassmorphism AI workspace poster with multi-screen collaboration, soft lighting, and a premium launch mood",
      "Create an ecommerce hero image for new wireless headphones that highlights material detail, lifestyle context, and core benefits",
      "Design a minimalist tech launch key visual with a clean composition, strong product focus, and restrained launch copy",
      "Make a social teaser set for a product drop, including countdown, close-up detail, benefit reveal, and launch-day visual",
    ],
    video: [
      "Make an 8-second product reveal film that moves from silhouette to close-up detail and ends on the brand mark",
      "Generate an app feature demo video that follows the user journey, key states, and final outcome",
      "Create a vertical brand opener with rhythmic typography, product close-ups, and a clean logo ending for short-form video",
      "Turn a website into a 15-second social ad by extracting the hero claim, interaction highlights, and a clear CTA",
    ],
    hyperframes: [
      "Build a captioned product launch short with title cards, feature shots, rhythmic transitions, and an ending CTA",
      "Generate an audio-reactive data visualization where bars, particles, and titles respond to narration beats",
      "Create a 3-second logo outro using line convergence, subtle elasticity, and the brand color system",
      "Make an animated flight-route map showing city nodes, route growth, mileage data, and a final summary frame",
    ],
    audio: [
      "Generate a product startup sound that feels light, trustworthy, slightly futuristic, and suitable for a desktop app launch",
      "Create a 20-second podcast intro bed with a warm opening, clear pulse, and a clean handoff into voiceover",
      "Make a seamless ambient loop for a meditation app using soft nature textures, low-frequency warmth, and calm pacing",
      "Generate a branded notification sound set for success, reminder, and error states while keeping one sonic identity",
    ],
  },
  "id": {
    prototype: [
      "Desain website berkonversi tinggi untuk AI CRM dengan hero yang jelas, alur cerita fitur, bukti pendukung, dan CTA uji coba",
      "Buat dashboard desktop untuk basis pengetahuan tim dengan pencarian, pembaruan terbaru, perizinan, dan titik masuk kolaborasi",
      "Rancang ulang onboarding untuk produk SaaS finansial agar pengguna baru bisa menghubungkan data, menyelesaikan setup, dan merasakan manfaat pertama dengan cepat",
      "Buat prototype app coaching kebugaran mobile yang mencakup penetapan tujuan, rencana mingguan, check-in latihan, dan tinjauan progres",
    ],
    deck: [
      "Riset peluang pasar untuk peluncuran produk, termasuk kompetitor, target pengguna, hipotesis harga, dan narasi peluncuran",
      "Buat laporan status tim mingguan berisi progres, risiko, perubahan metrik, dan prioritas minggu depan",
      "Desain pitch investor dengan ukuran pasar, model pertumbuhan, keunggulan produk, dan data proyeksi tiga tahun",
      "Buat deck tinjauan bisnis strategis yang mencakup kinerja kuartalan, akar masalah, peluang, dan langkah selanjutnya",
    ],
    image: [
      "Buat poster workspace AI bergaya glassmorphism dengan kolaborasi multi-layar, pencahayaan lembut, dan nuansa peluncuran premium",
      "Buat hero image ecommerce untuk headphone wireless baru yang menonjolkan detail material, konteks gaya hidup, dan manfaat utama",
      "Desain key visual peluncuran teknologi minimalis dengan komposisi bersih, fokus produk yang kuat, dan teks peluncuran yang ringkas",
      "Buat set teaser sosial untuk perilisan produk, termasuk hitung mundur, detail close-up, pengungkapan manfaat, dan visual hari peluncuran",
    ],
    video: [
      "Buat film pengungkapan produk 8 detik yang bergerak dari siluet ke detail close-up dan berakhir pada brand mark",
      "Buat video demo fitur app yang mengikuti perjalanan pengguna, state utama, dan hasil akhir",
      "Buat brand opener vertikal dengan tipografi berirama, close-up produk, dan akhiran logo yang bersih untuk video short-form",
      "Ubah website menjadi iklan sosial 15 detik dengan mengekstrak klaim utama, sorotan interaksi, dan CTA yang jelas",
    ],
    hyperframes: [
      "Bangun short peluncuran produk bertakarir dengan title card, shot fitur, transisi berirama, dan CTA penutup",
      "Buat visualisasi data audio-reaktif di mana bar, partikel, dan judul merespons ketukan narasi",
      "Buat outro logo 3 detik menggunakan pertemuan garis, elastisitas halus, dan sistem warna brand",
      "Buat peta rute penerbangan beranimasi yang menampilkan node kota, pertumbuhan rute, data jarak tempuh, dan frame ringkasan akhir",
    ],
    audio: [
      "Buat suara startup produk yang terasa ringan, terpercaya, sedikit futuristik, dan cocok untuk peluncuran app desktop",
      "Buat bed intro podcast 20 detik dengan pembuka hangat, pulsa yang jelas, dan transisi mulus ke voiceover",
      "Buat loop ambient mulus untuk app meditasi menggunakan tekstur alam yang lembut, kehangatan frekuensi rendah, dan tempo yang tenang",
      "Buat set suara notifikasi berbranding untuk state sukses, pengingat, dan error dengan tetap menjaga satu identitas sonik",
    ],
  },
  "de": {
    prototype: [
      "Entwirf eine konversionsstarke Website für ein AI CRM mit klarer Hero-Sektion, Feature-Story, Belegen und Trial-CTA",
      "Erstelle ein Desktop-Dashboard für eine Team-Wissensdatenbank mit Suche, aktuellen Updates, Berechtigungen und Einstiegspunkten für die Zusammenarbeit",
      "Gestalte das Onboarding für ein Finanz-SaaS-Produkt neu, damit neue Nutzer Daten verbinden, die Einrichtung abschließen und schnell den ersten Mehrwert erleben",
      "Prototype eine mobile Fitness-Coaching-App mit Zielsetzung, Wochenplänen, Workout-Check-ins und Fortschrittsübersicht",
    ],
    deck: [
      "Recherchiere die Marktchance für einen Produktlaunch, einschließlich Wettbewerbern, Zielnutzern, Preishypothesen und Launch-Narrativ",
      "Erstelle einen wöchentlichen Team-Statusbericht mit Fortschritt, Risiken, Kennzahlenänderungen und Prioritäten für die nächste Woche",
      "Entwirf ein Investoren-Pitch mit Marktgröße, Wachstumsmodell, Produktvorteil und Drei-Jahres-Prognosedaten",
      "Erstelle ein strategisches Business-Review-Deck mit Quartalsleistung, Ursachenanalyse, Chancen und nächsten Schritten",
    ],
    image: [
      "Generiere ein Glassmorphism-Poster für einen AI-Workspace mit Multi-Screen-Zusammenarbeit, sanftem Licht und edler Launch-Stimmung",
      "Erstelle ein E-Commerce-Hero-Bild für neue kabellose Kopfhörer, das Materialdetails, Lifestyle-Kontext und Kernvorteile hervorhebt",
      "Gestalte ein minimalistisches Key Visual für einen Tech-Launch mit klarer Komposition, starkem Produktfokus und zurückhaltendem Launch-Text",
      "Erstelle ein Social-Teaser-Set für einen Produkt-Drop mit Countdown, Detailaufnahme, Benefit-Reveal und Visual für den Launch-Tag",
    ],
    video: [
      "Erstelle einen 8-sekündigen Produkt-Reveal-Film, der von der Silhouette zur Detailaufnahme führt und mit dem Markenzeichen endet",
      "Generiere ein App-Feature-Demo-Video, das der User Journey, den wichtigsten Zuständen und dem Endergebnis folgt",
      "Erstelle einen vertikalen Marken-Opener mit rhythmischer Typografie, Produkt-Nahaufnahmen und einem klaren Logo-Abschluss für Kurzvideos",
      "Verwandle eine Website in eine 15-sekündige Social Ad, indem du die Hero-Aussage, Interaktions-Highlights und eine klare CTA herausziehst",
    ],
    hyperframes: [
      "Baue einen untertitelten Produktlaunch-Clip mit Titelkarten, Feature-Aufnahmen, rhythmischen Übergängen und einer CTA am Ende",
      "Generiere eine audioreaktive Datenvisualisierung, bei der Balken, Partikel und Titel auf den Rhythmus der Erzählung reagieren",
      "Erstelle ein 3-sekündiges Logo-Outro mit zusammenlaufenden Linien, subtiler Elastizität und dem Markenfarbsystem",
      "Erstelle eine animierte Flugrouten-Karte mit Stadtknoten, wachsenden Routen, Meilendaten und einem abschließenden Zusammenfassungsframe",
    ],
    audio: [
      "Generiere einen Produkt-Startsound, der sich leicht, vertrauenswürdig, leicht futuristisch anfühlt und für den Launch einer Desktop-App geeignet ist",
      "Erstelle ein 20-sekündiges Podcast-Intro-Bett mit warmem Einstieg, klarem Puls und sauberem Übergang in den Voiceover",
      "Erstelle einen nahtlosen Ambient-Loop für eine Meditations-App mit sanften Naturtexturen, tieffrequenter Wärme und ruhigem Tempo",
      "Generiere ein gebrandetes Benachrichtigungston-Set für Erfolgs-, Erinnerungs- und Fehlerzustände mit einer einheitlichen Klangidentität",
    ],
  },
  "zh-CN": {
    "web-clone": [
      "想要复刻的网站链接：https://open-design.ai",
    ],
    prototype: [
      "为 AI CRM 设计一个高转化官网，包含首屏、功能卖点、客户案例和清晰的试用入口",
      "为团队知识库做一个桌面端仪表盘，突出搜索、最近更新、权限状态和协作入口",
      "重构金融 SaaS 的 onboarding 流程，让新用户能快速完成开户、连接数据和看到首个洞察",
      "设计一个移动端健身教练 App 原型，覆盖目标设定、训练计划、打卡反馈和进度复盘",
    ],
    deck: [
      "研究一个新产品发布的市场机会，输出竞品格局、目标用户、定价假设和上市叙事",
      "生成每周团队状态报告，汇总进展、风险、关键指标变化和下周优先级",
      "设计一份投资者推介材料，包含市场规模、增长模型、产品优势和三年预测数据",
      "创建战略业务复盘演示文稿，讲清本季度表现、问题原因、机会判断和下一步行动",
    ],
    image: [
      "生成一张玻璃质感 AI 工作台海报，画面包含多屏协作、柔和光影和高级产品发布氛围",
      "为新款无线耳机做一张电商首屏主图，突出材质细节、佩戴场景和核心卖点",
      "设计一张极简科技发布会 KV，用干净构图、强主视觉和少量文字表达新品发布",
      "做一套社媒新品预热视觉，包含倒计时、局部特写、卖点揭示和发布日主图",
    ],
    video: [
      "做一个 8 秒产品 reveal 短片，从暗场轮廓推进到完整产品特写，结尾出现品牌标识",
      "生成一段 App 功能演示视频，按用户操作路径展示核心流程、关键状态和结果反馈",
      "制作竖屏品牌开场动画，用节奏化文字、产品局部和 logo 收束，适合短视频开头",
      "把一个网站转成 15 秒社媒广告，提炼首屏卖点、交互亮点和明确行动号召",
    ],
    hyperframes: [
      "做一个带字幕的产品发布短片，包含标题卡、功能镜头、节奏转场和结尾 CTA",
      "生成一段音频响应数据可视化，让柱状图、粒子和标题随旁白节奏变化",
      "制作 logo outro 动效，用线条收束、轻微弹性和品牌色完成 3 秒结尾动画",
      "做一个航线地图动态演示，展示城市节点、路径增长、里程数据和最终汇总画面",
    ],
    audio: [
      "生成一段产品启动音效，听起来轻盈、可信、带一点未来感，适合桌面 App 打开时播放",
      "制作 20 秒播客片头音乐，包含温暖前奏、清晰节拍和适合人声进入的收尾",
      "做一个冥想 App 的环境音循环，使用柔和自然声、低频铺底和无缝循环结构",
      "生成一组品牌通知提示音，区分成功、提醒和错误状态，但保持同一声音识别度",
    ],
  },
  "zh-TW": {
    prototype: [
      "為 AI CRM 設計一個高轉換率的網站，包含清晰的主視覺、功能故事、佐證亮點與試用 CTA",
      "為團隊知識庫打造桌面儀表板，包含搜尋、近期更新、權限管理與協作入口",
      "重新設計金融 SaaS 產品的引導流程，讓新使用者能快速串接資料、完成設定並體驗到首次價值",
      "為行動健身教練 app 製作原型，涵蓋目標設定、每週計畫、運動打卡與進度回顧",
    ],
    deck: [
      "研究產品上市的市場機會，包含競品、目標客群、定價假設與上市敘事",
      "產生每週團隊進度報告，包含進展、風險、指標變化與下週優先事項",
      "設計一份投資人簡報，包含市場規模、成長模型、產品優勢與三年預測數據",
      "製作策略性業務檢討簡報，涵蓋季度績效、根本原因、機會點與後續行動",
    ],
    image: [
      "產生一張玻璃擬物風格的 AI 工作空間海報，呈現多螢幕協作、柔和光線與高質感的上市氛圍",
      "為全新無線耳機製作電商主視覺，凸顯材質細節、生活情境與核心優點",
      "設計極簡的科技上市主視覺，構圖乾淨、產品焦點明確，搭配克制的上市文案",
      "為產品開賣製作社群預告系列，包含倒數計時、細節特寫、優點揭露與上市當天視覺",
    ],
    video: [
      "製作一支 8 秒的產品揭曉影片，從剪影過渡到細節特寫，最後收在品牌標誌",
      "產生一支 app 功能示範影片，依循使用者旅程、關鍵狀態與最終成果",
      "為短影音製作直式品牌開場，搭配節奏感字體動畫、產品特寫與乾淨的 logo 收尾",
      "將網站轉換成 15 秒社群廣告，萃取主視覺主張、互動亮點與清晰的 CTA",
    ],
    hyperframes: [
      "製作一支附字幕的產品上市短片，包含標題卡、功能畫面、節奏轉場與結尾 CTA",
      "產生一個聲音反應式資料視覺化，讓長條、粒子與標題隨旁白節拍律動",
      "運用線條匯聚、細膩彈性動態與品牌色彩系統，製作一個 3 秒的 logo 收尾動畫",
      "製作一張動態飛行航線地圖，呈現城市節點、航線延伸、里程數據與最終摘要畫面",
    ],
    audio: [
      "產生一個產品啟動音效，感覺輕盈、值得信賴、略帶未來感，適合桌面 app 啟動使用",
      "製作一段 20 秒的 Podcast 開場墊樂，溫暖開場、脈動清晰，並乾淨地接入旁白",
      "為冥想 app 製作無縫環境音循環，運用柔和的自然音質、低頻溫暖感與沉穩的節奏",
      "產生一組品牌通知音效，涵蓋成功、提醒與錯誤狀態，並維持一致的聲音識別",
    ],
  },
  "pt-BR": {
    prototype: [
      "Crie um site de alta conversão para um AI CRM com um hero claro, narrativa de recursos, provas sociais e CTA de teste grátis",
      "Crie um dashboard desktop para uma base de conhecimento de equipe com busca, atualizações recentes, permissões e pontos de entrada para colaboração",
      "Redesenhe o onboarding de um produto SaaS financeiro para que novos usuários conectem dados, concluam a configuração e vejam o primeiro valor rápido",
      "Prototipe um app mobile de coaching fitness cobrindo definição de metas, planos semanais, check-ins de treino e acompanhamento de progresso",
    ],
    deck: [
      "Pesquise a oportunidade de mercado para o lançamento de um produto, incluindo concorrentes, público-alvo, hipóteses de preço e narrativa de lançamento",
      "Gere um relatório semanal de status da equipe com progresso, riscos, variações de métricas e prioridades da próxima semana",
      "Crie um pitch para investidores com tamanho de mercado, modelo de crescimento, diferencial do produto e projeções de três anos",
      "Crie um deck de revisão estratégica de negócios cobrindo desempenho trimestral, causas raiz, oportunidades e próximos passos",
    ],
    image: [
      "Gere um pôster de workspace de IA em glassmorphism com colaboração multitelas, iluminação suave e clima premium de lançamento",
      "Crie uma imagem hero de e-commerce para novos fones sem fio destacando detalhes do material, contexto de uso e benefícios principais",
      "Crie um key visual minimalista de lançamento tech com composição limpa, foco forte no produto e texto de lançamento enxuto",
      "Faça um conjunto de teasers para redes sociais de um lançamento de produto, incluindo contagem regressiva, close de detalhes, revelação de benefícios e visual do dia do lançamento",
    ],
    video: [
      "Faça um filme de revelação de produto de 8 segundos que vai da silhueta ao close de detalhes e termina na marca",
      "Gere um vídeo de demonstração de recursos do app que segue a jornada do usuário, os estados principais e o resultado final",
      "Crie uma abertura de marca vertical com tipografia ritmada, closes do produto e um encerramento limpo com o logo para vídeo short-form",
      "Transforme um site em um anúncio social de 15 segundos extraindo a promessa do hero, os destaques de interação e um CTA claro",
    ],
    hyperframes: [
      "Crie um short legendado de lançamento de produto com cartelas de título, takes de recursos, transições ritmadas e um CTA no final",
      "Gere uma visualização de dados que reage ao áudio, com barras, partículas e títulos respondendo ao ritmo da narração",
      "Crie um outro de logo de 3 segundos usando convergência de linhas, elasticidade sutil e o sistema de cores da marca",
      "Faça um mapa animado de rotas de voo mostrando nós de cidades, crescimento das rotas, dados de milhagem e um quadro final de resumo",
    ],
    audio: [
      "Gere um som de inicialização de produto que soe leve, confiável, levemente futurista e adequado para o lançamento de um app desktop",
      "Crie uma base de abertura de podcast de 20 segundos com início acolhedor, pulso nítido e uma transição limpa para a locução",
      "Faça um loop ambiente contínuo para um app de meditação usando texturas suaves da natureza, calor de baixa frequência e ritmo tranquilo",
      "Gere um conjunto de sons de notificação da marca para os estados de sucesso, lembrete e erro mantendo uma única identidade sonora",
    ],
  },
  "es-ES": {
    prototype: [
      "Diseña una web de alta conversión para un AI CRM con un hero claro, narrativa de funciones, pruebas de valor y un CTA de prueba gratuita",
      "Crea un panel de escritorio para una base de conocimiento de equipo con búsqueda, novedades recientes, permisos y accesos a la colaboración",
      "Rediseña el onboarding de un producto SaaS financiero para que los nuevos usuarios conecten sus datos, completen la configuración y vean valor rápido",
      "Prototipa una app móvil de entrenamiento físico que cubra el establecimiento de objetivos, planes semanales, registro de entrenamientos y revisión del progreso",
    ],
    deck: [
      "Investiga la oportunidad de mercado para el lanzamiento de un producto, incluyendo competidores, usuarios objetivo, hipótesis de precios y narrativa de lanzamiento",
      "Genera un informe semanal de estado del equipo con avances, riesgos, cambios en las métricas y prioridades de la próxima semana",
      "Diseña un pitch para inversores con dimensionamiento de mercado, modelo de crecimiento, ventaja del producto y previsiones a tres años",
      "Crea una presentación de revisión estratégica del negocio que cubra el rendimiento trimestral, causas de fondo, oportunidades y próximas acciones",
    ],
    image: [
      "Genera un póster de workspace de IA con efecto glassmorphism, colaboración multipantalla, iluminación suave y un ambiente premium de lanzamiento",
      "Crea una imagen hero de ecommerce para unos nuevos auriculares inalámbricos que destaque el detalle del material, el contexto de uso y los beneficios clave",
      "Diseña un key visual minimalista para un lanzamiento tecnológico con una composición limpia, foco en el producto y un mensaje de lanzamiento contenido",
      "Crea un set de teasers para redes para el lanzamiento de un producto, con cuenta atrás, detalle en primer plano, revelación del beneficio y visual del día de lanzamiento",
    ],
    video: [
      "Crea un vídeo de revelación de producto de 8 segundos que pase de la silueta al detalle en primer plano y termine en la marca",
      "Genera un vídeo demo de las funciones de una app que siga el recorrido del usuario, los estados clave y el resultado final",
      "Crea una intro de marca en vertical con tipografía rítmica, primeros planos del producto y un cierre de logo limpio para vídeo de formato corto",
      "Convierte una web en un anuncio de 15 segundos para redes extrayendo el mensaje principal, los momentos de interacción y un CTA claro",
    ],
    hyperframes: [
      "Crea un corto subtitulado de lanzamiento de producto con tarjetas de título, planos de funciones, transiciones rítmicas y un CTA final",
      "Genera una visualización de datos reactiva al audio donde barras, partículas y títulos respondan al ritmo de la narración",
      "Crea un outro de logo de 3 segundos con líneas que convergen, una elasticidad sutil y el sistema de color de la marca",
      "Crea un mapa animado de rutas de vuelo que muestre nodos de ciudades, el crecimiento de las rutas, datos de millas y un fotograma final de resumen",
    ],
    audio: [
      "Genera un sonido de inicio de producto que transmita ligereza, confianza y un toque futurista, ideal para el lanzamiento de una app de escritorio",
      "Crea una base de intro de pódcast de 20 segundos con una apertura cálida, un pulso claro y una transición limpia hacia la voz en off",
      "Crea un loop ambiental fluido para una app de meditación con texturas suaves de la naturaleza, calidez de baja frecuencia y un ritmo tranquilo",
      "Genera un set de sonidos de notificación de marca para los estados de éxito, recordatorio y error manteniendo una misma identidad sonora",
    ],
  },
  "ru": {
    prototype: [
      "Спроектируйте конверсионный сайт для AI CRM с понятным hero-блоком, рассказом о возможностях, аргументами и CTA на пробный период",
      "Создайте десктопный дашборд для командной базы знаний с поиском, недавними обновлениями, правами доступа и точками входа для совместной работы",
      "Переработайте онбординг финансового SaaS-продукта, чтобы новые пользователи быстро подключали данные, завершали настройку и видели первую ценность",
      "Сделайте прототип мобильного приложения для фитнес-тренировок с постановкой целей, недельными планами, отметками о тренировках и просмотром прогресса",
    ],
    deck: [
      "Исследуйте рыночные возможности для запуска продукта: конкуренты, целевая аудитория, гипотезы по ценам и нарратив запуска",
      "Подготовьте еженедельный отчёт команды с прогрессом, рисками, изменениями метрик и приоритетами на следующую неделю",
      "Соберите инвесторскую презентацию с оценкой рынка, моделью роста, преимуществом продукта и прогнозом на три года",
      "Создайте презентацию стратегического бизнес-обзора: квартальные результаты, причины, возможности и следующие шаги",
    ],
    image: [
      "Сгенерируйте постер AI-рабочего пространства в стиле glassmorphism с мультиэкранной совместной работой, мягким светом и премиальным настроением запуска",
      "Создайте hero-изображение для интернет-магазина с новыми беспроводными наушниками: детали материала, контекст использования и ключевые преимущества",
      "Разработайте минималистичный key visual для технологического запуска с чистой композицией, акцентом на продукте и лаконичным текстом",
      "Сделайте набор тизеров для соцсетей к выходу продукта: обратный отсчёт, крупный план детали, раскрытие преимущества и визуал дня запуска",
    ],
    video: [
      "Сделайте 8-секундный ролик-презентацию продукта, который переходит от силуэта к крупному плану детали и завершается фирменным знаком",
      "Сгенерируйте видео с демонстрацией возможностей app, следуя пути пользователя, ключевым состояниям и итоговому результату",
      "Создайте вертикальную брендовую заставку с ритмичной типографикой, крупными планами продукта и чистым завершением на logo для коротких видео",
      "Превратите сайт в 15-секундную рекламу для соцсетей, выделив главный тезис, ключевые взаимодействия и понятный CTA",
    ],
    hyperframes: [
      "Соберите короткий ролик о запуске продукта с субтитрами: титульные карточки, кадры возможностей, ритмичные переходы и CTA в финале",
      "Сгенерируйте аудиореактивную визуализацию данных, где столбцы, частицы и заголовки откликаются на ритм закадрового текста",
      "Создайте 3-секундную заставку с logo на основе схождения линий, лёгкой упругости и фирменной цветовой системы",
      "Сделайте анимированную карту авиамаршрутов с узлами городов, ростом маршрутов, данными о километраже и итоговым кадром",
    ],
    audio: [
      "Сгенерируйте звук запуска продукта — лёгкий, вызывающий доверие, слегка футуристичный и подходящий для запуска десктопного app",
      "Создайте 20-секундную подложку для интро подкаста с тёплым началом, чётким пульсом и плавным переходом к озвучке",
      "Сделайте бесшовный эмбиент-луп для приложения для медитации с мягкими природными текстурами, низкочастотным теплом и спокойным темпом",
      "Сгенерируйте набор фирменных звуков уведомлений для успеха, напоминания и ошибки, сохранив единую звуковую идентичность",
    ],
  },
  "fa": {
    prototype: [
      "یک وب‌سایت پربازده برای یک AI CRM طراحی کن با بخش معرفی شفاف، روایت ویژگی‌ها، نکات اثبات‌کننده و CTA برای آزمایش رایگان",
      "یک داشبورد دسکتاپ برای پایگاه دانش تیمی بساز با جست‌وجو، به‌روزرسانی‌های اخیر، دسترسی‌ها و نقاط ورود به همکاری",
      "فرایند آنبوردینگ یک محصول SaaS مالی را بازطراحی کن تا کاربران جدید بتوانند داده‌ها را متصل کنند، راه‌اندازی را کامل کنند و سریع به ارزش اولیه برسند",
      "یک app مربی تناسب اندام موبایلی نمونه‌سازی کن که تعیین هدف، برنامه‌های هفتگی، ثبت تمرین‌ها و مرور پیشرفت را پوشش بدهد",
    ],
    deck: [
      "فرصت بازار برای عرضه یک محصول را بررسی کن، شامل رقبا، کاربران هدف، فرضیه‌های قیمت‌گذاری و روایت عرضه",
      "یک گزارش وضعیت هفتگی تیم بساز با پیشرفت‌ها، ریسک‌ها، تغییرات معیارها و اولویت‌های هفته بعد",
      "یک ارائه جذب سرمایه طراحی کن با اندازه‌گیری بازار، مدل رشد، مزیت محصول و داده‌های پیش‌بینی سه‌ساله",
      "یک ارائه بازبینی استراتژیک کسب‌وکار بساز که عملکرد فصلی، ریشه‌ها، فرصت‌ها و اقدامات بعدی را پوشش بدهد",
    ],
    image: [
      "یک پوستر فضای کاری AI با سبک glassmorphism بساز با همکاری چندصفحه‌ای، نور ملایم و حال‌وهوای عرضه‌ای لوکس",
      "یک تصویر اصلی فروشگاهی برای هدفون بی‌سیم جدید بساز که جزئیات متریال، بافت سبک زندگی و مزایای اصلی را برجسته کند",
      "یک کلیدتصویر مینیمال برای عرضه محصول فناوری طراحی کن با ترکیب‌بندی تمیز، تمرکز قوی روی محصول و متن عرضه‌ای موجز",
      "یک مجموعه تیزر شبکه‌های اجتماعی برای عرضه محصول بساز شامل شمارش معکوس، نمای نزدیک جزئیات، رونمایی از مزیت و تصویر روز عرضه",
    ],
    video: [
      "یک فیلم رونمایی محصول ۸ ثانیه‌ای بساز که از سایه به نمای نزدیک جزئیات می‌رسد و با نشان برند تمام می‌شود",
      "یک ویدیوی دموی ویژگی app بساز که سفر کاربر، حالت‌های کلیدی و نتیجه نهایی را دنبال کند",
      "یک تیتراژ آغازین برند عمودی برای ویدیوی کوتاه بساز با تایپوگرافی ریتمیک، نماهای نزدیک محصول و پایان تمیز با logo",
      "یک وب‌سایت را با استخراج ادعای اصلی، نکات برجسته تعامل و یک CTA شفاف به یک تبلیغ اجتماعی ۱۵ ثانیه‌ای تبدیل کن",
    ],
    hyperframes: [
      "یک ویدیوی کوتاه عرضه محصول با زیرنویس بساز با کارت‌های عنوان، نماهای ویژگی، گذارهای ریتمیک و یک CTA پایانی",
      "یک مصورسازی داده واکنش‌گرا به صدا بساز که میله‌ها، ذرات و عنوان‌ها به ضرب‌آهنگ روایت پاسخ بدهند",
      "یک اوترو logo سه‌ثانیه‌ای بساز با همگرایی خطوط، کشسانی ظریف و سیستم رنگ برند",
      "یک نقشه مسیر پرواز متحرک بساز که نقاط شهرها، رشد مسیر، داده‌های مسافت و یک فریم خلاصه نهایی را نشان بدهد",
    ],
    audio: [
      "یک صدای راه‌اندازی محصول بساز که سبک، قابل‌اعتماد، کمی آینده‌نگرانه و مناسب عرضه یک app دسکتاپ باشد",
      "یک بستر آغازین پادکست ۲۰ ثانیه‌ای بساز با شروعی گرم، ضربان شفاف و واگذاری تمیز به صدای گوینده",
      "یک لوپ محیطی یکپارچه برای یک app مدیتیشن بساز با بافت‌های نرم طبیعت، گرمای فرکانس پایین و ریتم آرام",
      "یک مجموعه صدای اعلان برند برای حالت‌های موفقیت، یادآوری و خطا بساز در حالی که یک هویت صوتی واحد حفظ شود",
    ],
  },
  "ar": {
    prototype: [
      "صمّم موقعًا عالي التحويل لمنتج AI CRM مع قسم رئيسي واضح وقصة للميزات ونقاط إثبات وزر CTA لتجربة المنتج",
      "أنشئ لوحة تحكم لسطح المكتب لقاعدة معرفة جماعية تتضمن البحث والتحديثات الأخيرة والصلاحيات ونقاط دخول للتعاون",
      "أعد تصميم تجربة الانضمام لمنتج SaaS مالي ليتمكن المستخدمون الجدد من ربط بياناتهم وإكمال الإعداد وإدراك القيمة الأولى بسرعة",
      "صمّم نموذجًا أوليًا لتطبيق لياقة بدنية على الهاتف يغطي تحديد الأهداف والخطط الأسبوعية وتسجيل التمارين ومراجعة التقدم",
    ],
    deck: [
      "ابحث في فرصة السوق لإطلاق منتج، بما في ذلك المنافسون والمستخدمون المستهدفون وفرضيات التسعير وسردية الإطلاق",
      "أنشئ تقريرًا أسبوعيًا عن حالة الفريق يتضمن التقدم والمخاطر وتغيّرات المؤشرات وأولويات الأسبوع المقبل",
      "صمّم عرضًا تقديميًا للمستثمرين يشمل حجم السوق ونموذج النمو وميزة المنتج وبيانات توقعات الثلاث سنوات",
      "أنشئ عرضًا للمراجعة الاستراتيجية للأعمال يغطي الأداء الفصلي والأسباب الجذرية والفرص والخطوات التالية",
    ],
    image: [
      "أنشئ ملصقًا لمساحة عمل AI بأسلوب الزجاج الشفاف مع تعاون متعدد الشاشات وإضاءة ناعمة وأجواء إطلاق فاخرة",
      "أنشئ صورة رئيسية للتجارة الإلكترونية لسماعات لاسلكية جديدة تُبرز تفاصيل الخامة والسياق الحياتي والفوائد الأساسية",
      "صمّم هوية بصرية محورية لإطلاق تقني بأسلوب بسيط مع تكوين نظيف وتركيز قوي على المنتج ونص إطلاق مقتضب",
      "اصنع مجموعة تشويقية لوسائل التواصل لإطلاق منتج تتضمن العد التنازلي ولقطة قريبة للتفاصيل وكشف الفائدة وصورة يوم الإطلاق",
    ],
    video: [
      "اصنع فيلم كشف عن منتج مدته 8 ثوانٍ ينتقل من الظل إلى التفاصيل القريبة وينتهي بشعار العلامة",
      "أنشئ فيديو عرض لميزة في app يتتبع رحلة المستخدم والحالات الرئيسية والنتيجة النهائية",
      "أنشئ مقدمة عمودية للعلامة بحروف إيقاعية ولقطات قريبة للمنتج ونهاية نظيفة بالشعار للفيديوهات القصيرة",
      "حوّل موقعًا إلى إعلان اجتماعي مدته 15 ثانية باستخراج العبارة الرئيسية وأبرز التفاعلات وزر CTA واضح",
    ],
    hyperframes: [
      "اصنع فيديو قصيرًا لإطلاق منتج مع نصوص توضيحية وبطاقات عنوان ولقطات للميزات وانتقالات إيقاعية وزر CTA في النهاية",
      "أنشئ تصورًا للبيانات يتفاعل مع الصوت حيث تستجيب الأعمدة والجسيمات والعناوين لإيقاع السرد",
      "أنشئ خاتمة للشعار مدتها 3 ثوانٍ باستخدام تقارب الخطوط ومرونة خفيفة ونظام ألوان العلامة",
      "اصنع خريطة متحركة لمسارات الطيران تُظهر عُقد المدن ونمو المسارات وبيانات الأميال وإطار ملخص نهائي",
    ],
    audio: [
      "أنشئ صوت بدء تشغيل لمنتج يبدو خفيفًا وموثوقًا ومستقبليًا قليلًا ومناسبًا لإطلاق app على سطح المكتب",
      "أنشئ مقدمة موسيقية لبودكاست مدتها 20 ثانية ببداية دافئة ونبض واضح وانتقال سلس إلى التعليق الصوتي",
      "اصنع حلقة صوتية محيطة متواصلة لتطبيق تأمل باستخدام نسائج طبيعية ناعمة ودفء بترددات منخفضة وإيقاع هادئ",
      "أنشئ مجموعة أصوات إشعارات للعلامة لحالات النجاح والتذكير والخطأ مع الحفاظ على هوية صوتية واحدة",
    ],
  },
  "ja": {
    prototype: [
      "AI CRM 向けに、ヒーロー・機能ストーリー・実績・トライアル CTA を備えた高コンバージョンの Web サイトをデザインして",
      "チームのナレッジベース向けに、検索・最近の更新・権限状態・コラボ導線を備えたデスクトップのダッシュボードを作って",
      "金融 SaaS のオンボーディングを再設計して、新規ユーザーがデータ連携・初期設定・最初の価値体験まで素早く到達できるようにして",
      "目標設定・週次プラン・チェックイン・進捗レビューをカバーする、モバイルのフィットネスコーチ App のプロトタイプを作って",
    ],
    deck: [
      "新製品ローンチの市場機会をリサーチして、競合状況・ターゲットユーザー・価格仮説・ローンチの物語をまとめて",
      "進捗・リスク・主要指標の変化・来週の優先事項を盛り込んだ週次チームステータスレポートを生成して",
      "市場規模・成長モデル・製品の強み・3 年分の予測データを含む投資家向けピッチをデザインして",
      "四半期の実績・原因・機会・次のアクションをまとめた戦略的なビジネスレビューのデッキを作って",
    ],
    image: [
      "マルチスクリーンのコラボ・柔らかな光・上質なローンチの雰囲気を持つ、グラスモーフィズムの AI ワークスペースのポスターを生成して",
      "素材の質感・装着シーン・主要な利点を強調した、新型ワイヤレスイヤホンの EC ヒーロー画像を作って",
      "クリーンな構図・強いプロダクトフォーカス・抑えたコピーで、ミニマルなテック発表のキービジュアルをデザインして",
      "カウントダウン・クローズアップ・利点の提示・ローンチ当日のビジュアルを含む、新製品予告の SNS ビジュアルセットを作って",
    ],
    video: [
      "シルエットからクローズアップへと展開し、最後にブランドマークで締める 8 秒のプロダクトリビール動画を作って",
      "ユーザージャーニー・主要な状態・最終的な結果を追う、App 機能デモ動画を生成して",
      "リズミカルなタイポグラフィ・プロダクトのクローズアップ・logo の収束で締める、縦型のブランドオープナーを作って",
      "ヒーローの訴求・インタラクションの見どころ・明確な CTA を抽出して、Web サイトを 15 秒の SNS 広告に変換して",
    ],
    hyperframes: [
      "タイトルカード・機能ショット・リズミカルなトランジション・結びの CTA を備えた、字幕付きのプロダクトローンチ短編を作って",
      "バー・パーティクル・タイトルがナレーションのビートに反応する、オーディオリアクティブなデータ可視化を生成して",
      "線の収束・わずかな弾性・ブランドカラーを使った、3 秒の logo アウトロを作って",
      "都市ノード・経路の伸び・距離データ・最終サマリーフレームを見せる、アニメーションのフライトルートマップを作って",
    ],
    audio: [
      "軽やかで信頼感があり、少し未来的で、デスクトップ App の起動時に流すのにふさわしいプロダクト起動音を生成して",
      "温かいオープニング・明確なパルス・ナレーションへのスムーズな受け渡しを備えた、20 秒のポッドキャストイントロを作って",
      "柔らかな自然音・低域の温かみ・穏やかなテンポを使った、瞑想 App 向けのシームレスな環境音ループを作って",
      "成功・リマインド・エラーの状態を区別しつつ、ひとつの音のアイデンティティを保ったブランド通知音セットを生成して",
    ],
  },
  "ko": {
    prototype: [
      "명확한 히어로, 기능 스토리, 신뢰 지표, 체험판 CTA를 갖춘 AI CRM용 고전환 website를 디자인해 줘",
      "검색, 최근 업데이트, 권한 관리, 협업 진입점을 담은 팀 지식 베이스용 데스크톱 대시보드를 만들어 줘",
      "신규 사용자가 데이터를 연결하고 설정을 마쳐 첫 가치를 빠르게 체감하도록 금융 SaaS 제품의 온보딩을 새로 디자인해 줘",
      "목표 설정, 주간 플랜, 운동 체크인, 진행 상황 리뷰를 아우르는 모바일 피트니스 코칭 app을 프로토타입으로 만들어 줘",
    ],
    deck: [
      "경쟁사, 타깃 사용자, 가격 가설, 출시 내러티브를 포함해 제품 출시의 시장 기회를 리서치해 줘",
      "진행 상황, 리스크, 지표 변화, 다음 주 우선순위를 담은 주간 팀 현황 보고서를 만들어 줘",
      "시장 규모, 성장 모델, 제품 경쟁력, 3년 전망 데이터를 담은 투자자 피치를 디자인해 줘",
      "분기 실적, 근본 원인, 기회 요소, 다음 액션을 다루는 전략 비즈니스 리뷰 deck을 만들어 줘",
    ],
    image: [
      "멀티 스크린 협업, 부드러운 조명, 프리미엄한 출시 무드를 담은 글래스모피즘 AI 워크스페이스 포스터를 생성해 줘",
      "소재 디테일, 라이프스타일 맥락, 핵심 혜택을 강조하는 신규 무선 헤드폰 이커머스 히어로 이미지를 만들어 줘",
      "깔끔한 구성, 강한 제품 집중도, 절제된 카피를 살린 미니멀 테크 출시 키 비주얼을 디자인해 줘",
      "카운트다운, 클로즈업 디테일, 혜택 공개, 출시 당일 비주얼을 담은 제품 출시 소셜 티저 세트를 만들어 줘",
    ],
    video: [
      "실루엣에서 클로즈업 디테일로 이어지다 브랜드 마크로 마무리되는 8초 제품 공개 영상을 만들어 줘",
      "사용자 여정, 핵심 상태, 최종 결과를 따라가는 app 기능 데모 영상을 생성해 줘",
      "리듬감 있는 타이포그래피, 제품 클로즈업, 깔끔한 logo 엔딩을 담은 숏폼용 세로형 브랜드 오프너를 만들어 줘",
      "히어로 메시지, 인터랙션 하이라이트, 명확한 CTA를 뽑아 website를 15초 소셜 광고로 만들어 줘",
    ],
    hyperframes: [
      "타이틀 카드, 기능 컷, 리듬감 있는 트랜지션, 엔딩 CTA를 담은 자막형 제품 출시 숏폼을 만들어 줘",
      "막대, 파티클, 타이틀이 내레이션 비트에 반응하는 오디오 반응형 데이터 시각화를 생성해 줘",
      "라인 수렴, 은은한 탄성, 브랜드 컬러 시스템을 활용한 3초 logo 아웃트로를 만들어 줘",
      "도시 노드, 노선 성장, 마일리지 데이터, 최종 요약 프레임을 보여주는 비행 경로 애니메이션 지도를 만들어 줘",
    ],
    audio: [
      "가볍고 신뢰감 있으며 살짝 미래적인, 데스크톱 app 출시에 어울리는 제품 시작음을 생성해 줘",
      "따뜻한 도입부, 또렷한 펄스, 보이스오버로 매끄럽게 이어지는 20초 팟캐스트 인트로 베드를 만들어 줘",
      "부드러운 자연음 텍스처, 저주파의 따스함, 차분한 페이싱을 활용한 명상 app용 끊김 없는 앰비언트 루프를 만들어 줘",
      "하나의 사운드 아이덴티티를 유지하면서 성공, 알림, 오류 상태를 위한 브랜드 알림음 세트를 생성해 줘",
    ],
  },
  "pl": {
    prototype: [
      "Zaprojektuj skuteczną sprzedażowo stronę dla AI CRM z czytelną sekcją hero, opowieścią o funkcjach, dowodami skuteczności i CTA do wersji próbnej",
      "Stwórz desktopowy dashboard dla zespołowej bazy wiedzy z wyszukiwarką, ostatnimi aktualizacjami, uprawnieniami i punktami wejścia do współpracy",
      "Przeprojektuj onboarding produktu finansowego SaaS, aby nowi użytkownicy mogli podłączyć dane, dokończyć konfigurację i szybko zobaczyć pierwszą wartość",
      "Zbuduj prototyp mobilnej aplikacji do treningu fitness obejmującej ustawianie celów, plany tygodniowe, odznaczanie treningów i przegląd postępów",
    ],
    deck: [
      "Zbadaj szansę rynkową dla premiery produktu, uwzględniając konkurencję, docelowych użytkowników, hipotezy cenowe i narrację premiery",
      "Wygeneruj tygodniowy raport statusu zespołu z postępami, ryzykami, zmianami wskaźników i priorytetami na kolejny tydzień",
      "Zaprojektuj prezentację dla inwestorów z szacowaniem rynku, modelem wzrostu, przewagą produktu i prognozą na trzy lata",
      "Stwórz prezentację strategicznego przeglądu biznesowego obejmującą wyniki kwartalne, przyczyny źródłowe, szanse i kolejne działania",
    ],
    image: [
      "Wygeneruj plakat AI workspace w stylu glassmorphism z wieloekranową współpracą, miękkim światłem i ekskluzywnym nastrojem premiery",
      "Stwórz zdjęcie hero do e-commerce dla nowych słuchawek bezprzewodowych, podkreślające detale materiału, kontekst lifestyle i kluczowe korzyści",
      "Zaprojektuj minimalistyczny key visual premiery technologicznej z czystą kompozycją, mocnym akcentem na produkt i oszczędnym tekstem",
      "Przygotuj zestaw zapowiedzi do social media dla premiery produktu, w tym odliczanie, zbliżenie detalu, ujawnienie korzyści i grafikę na dzień premiery",
    ],
    video: [
      "Stwórz 8-sekundowy film z premierą produktu, który przechodzi od sylwetki do zbliżenia detalu i kończy się logiem marki",
      "Wygeneruj wideo demonstrujące funkcje aplikacji, podążające za ścieżką użytkownika, kluczowymi stanami i końcowym efektem",
      "Stwórz pionową czołówkę marki z rytmiczną typografią, zbliżeniami produktu i czystym zakończeniem z logo do wideo w formacie short",
      "Zamień stronę internetową w 15-sekundową reklamę do social media, wydobywając główny przekaz, najważniejsze interakcje i czytelne CTA",
    ],
    hyperframes: [
      "Zbuduj krótki film z premierą produktu z napisami, planszami tytułowymi, ujęciami funkcji, rytmicznymi przejściami i CTA na końcu",
      "Wygeneruj wizualizację danych reagującą na dźwięk, gdzie słupki, cząsteczki i napisy odpowiadają na rytm narracji",
      "Stwórz 3-sekundowe zakończenie z logo wykorzystujące zbieżność linii, subtelną elastyczność i system kolorów marki",
      "Przygotuj animowaną mapę tras lotów pokazującą węzły miast, rozwój tras, dane o milach i końcową klatkę podsumowania",
    ],
    audio: [
      "Wygeneruj dźwięk uruchomienia produktu, który brzmi lekko, godnie zaufania, lekko futurystycznie i pasuje do premiery aplikacji desktopowej",
      "Stwórz 20-sekundowy podkład intro do podcastu z ciepłym otwarciem, wyraźnym pulsem i czystym przejściem w lektora",
      "Przygotuj bezszwową pętlę ambientową do aplikacji do medytacji z miękkimi teksturami natury, niskoczęstotliwościowym ciepłem i spokojnym tempem",
      "Wygeneruj markowy zestaw dźwięków powiadomień dla statusów sukcesu, przypomnienia i błędu, zachowując jedną tożsamość dźwiękową",
    ],
  },
  "hu": {
    prototype: [
      "Tervezz magas konverziójú weboldalt egy AI CRM számára, jól látható hero szekcióval, funkciókat bemutató történettel, bizonyítékokkal és próbaverziós CTA-val",
      "Készíts asztali irányítópultot egy csapat tudásbázisához kereséssel, friss frissítésekkel, jogosultságokkal és együttműködési belépési pontokkal",
      "Tervezd újra egy pénzügyi SaaS termék bevezetését, hogy az új felhasználók gyorsan összekapcsolhassák az adatokat, befejezhessék a beállítást és megtapasztalhassák az első értéket",
      "Készíts prototípust egy mobil fitneszedző alkalmazáshoz, amely lefedi a célok kitűzését, a heti terveket, az edzések bejelentkezését és a haladás áttekintését",
    ],
    deck: [
      "Kutasd fel egy termékbevezetés piaci lehetőségeit, beleértve a versenytársakat, a célközönséget, az árazási hipotéziseket és a bevezetési narratívát",
      "Készíts heti csapatállapot-jelentést a haladással, kockázatokkal, metrikák változásaival és a következő heti prioritásokkal",
      "Tervezz befektetői prezentációt piacméretezéssel, növekedési modellel, termékelőnyökkel és hároméves előrejelzési adatokkal",
      "Készíts stratégiai üzleti áttekintő prezentációt, amely lefedi a negyedéves teljesítményt, a kiváltó okokat, a lehetőségeket és a következő lépéseket",
    ],
    image: [
      "Készíts glassmorphism stílusú AI munkaterület-posztert többképernyős együttműködéssel, lágy megvilágítással és prémium bevezetési hangulattal",
      "Készíts e-kereskedelmi hero képet egy új vezeték nélküli fejhallgatóhoz, amely kiemeli az anyag részleteit, az életstílus-kontextust és a fő előnyöket",
      "Tervezz minimalista tech bevezetési kulcsvizuált letisztult kompozícióval, erős termékfókusszal és visszafogott bevezetési szöveggel",
      "Készíts közösségi teaser-csomagot egy termékmegjelenéshez visszaszámlálással, közeli részlettel, előnyök bemutatásával és a megjelenés napi vizuáljával",
    ],
    video: [
      "Készíts 8 másodperces termékbemutató filmet, amely a sziluettől a közeli részletekig halad, és a márkajelzéssel zárul",
      "Készíts app funkciót bemutató videót, amely követi a felhasználói utat, a kulcsállapotokat és a végeredményt",
      "Készíts függőleges márkanyitót ritmikus tipográfiával, közeli termékfelvételekkel és letisztult logo-zárással rövid videókhoz",
      "Alakíts át egy weboldalt 15 másodperces közösségi hirdetéssé a hero üzenet, az interakciós kiemelések és egy egyértelmű CTA kiemelésével",
    ],
    hyperframes: [
      "Építs feliratozott termékbevezetési rövidfilmet címkártyákkal, funkciófelvételekkel, ritmikus átmenetekkel és záró CTA-val",
      "Készíts hangra reagáló adatvizualizációt, ahol az oszlopok, részecskék és feliratok a narráció ritmusára válaszolnak",
      "Készíts 3 másodperces logo-zárót vonalak összetartásával, finom rugalmassággal és a márka színrendszerével",
      "Készíts animált útvonaltérképet, amely városcsomópontokat, útvonalak növekedését, távolsági adatokat és egy záró összefoglaló képkockát mutat",
    ],
    audio: [
      "Készíts termékindítási hangot, amely könnyed, megbízható, kissé futurisztikus, és alkalmas egy asztali app indításához",
      "Készíts 20 másodperces podcast intro alapot meleg nyitással, tiszta lüktetéssel és letisztult átmenettel a narrációba",
      "Készíts zökkenőmentes ambient loopot egy meditációs apphoz lágy természeti textúrákkal, mély frekvenciás melegséggel és nyugodt tempóval",
      "Készíts márkázott értesítési hangcsomagot a sikeres, emlékeztető és hiba állapotokhoz, megőrizve egyetlen hangzásbeli identitást",
    ],
  },
  "fr": {
    prototype: [
      "Concevez un site web à fort taux de conversion pour un AI CRM, avec un hero clair, un récit des fonctionnalités, des preuves concrètes et un CTA d'essai",
      "Créez un dashboard desktop pour une base de connaissances d'équipe, avec recherche, mises à jour récentes, permissions et points d'entrée vers la collaboration",
      "Repensez l'onboarding d'un produit SaaS financier pour que les nouveaux utilisateurs puissent connecter leurs données, terminer la configuration et constater rapidement une première valeur",
      "Prototypez une app mobile de coaching fitness couvrant la définition des objectifs, les plans hebdomadaires, le suivi des séances et le bilan de progression",
    ],
    deck: [
      "Étudiez l'opportunité de marché d'un lancement de produit, avec les concurrents, les utilisateurs cibles, les hypothèses de prix et le récit de lancement",
      "Générez un rapport d'avancement hebdomadaire de l'équipe avec les progrès, les risques, l'évolution des métriques et les priorités de la semaine prochaine",
      "Concevez un pitch investisseurs avec le dimensionnement du marché, le modèle de croissance, l'avantage produit et des prévisions sur trois ans",
      "Créez un deck de revue stratégique couvrant la performance trimestrielle, les causes profondes, les opportunités et les prochaines actions",
    ],
    image: [
      "Générez une affiche d'espace de travail AI en glassmorphism, avec collaboration multi-écrans, lumière douce et une ambiance de lancement premium",
      "Créez une image hero e-commerce pour un nouveau casque sans fil, mettant en valeur le détail des matériaux, le contexte lifestyle et les bénéfices clés",
      "Concevez un key visual minimaliste de lancement tech, avec une composition épurée, un fort focus produit et un texte de lancement sobre",
      "Réalisez une série de teasers sociaux pour une sortie produit, avec compte à rebours, détail en gros plan, révélation des bénéfices et visuel du jour J",
    ],
    video: [
      "Réalisez un film de révélation produit de 8 secondes qui passe de la silhouette au gros plan et se termine sur la signature de la marque",
      "Générez une vidéo de démo des fonctionnalités d'une app qui suit le parcours utilisateur, les états clés et le résultat final",
      "Créez une ouverture de marque verticale avec une typographie rythmée, des gros plans produit et une fin sur logo épurée pour la vidéo short",
      "Transformez un site web en une publicité sociale de 15 secondes en extrayant l'accroche hero, les temps forts d'interaction et un CTA clair",
    ],
    hyperframes: [
      "Créez un short de lancement produit sous-titré avec cartons de titre, plans des fonctionnalités, transitions rythmées et un CTA de fin",
      "Générez une visualisation de données réactive à l'audio où barres, particules et titres répondent au rythme de la narration",
      "Créez un outro de logo de 3 secondes avec convergence de lignes, légère élasticité et le système de couleurs de la marque",
      "Réalisez une carte animée d'itinéraires aériens montrant les nœuds des villes, la croissance des routes, les données de kilométrage et un cadre de synthèse final",
    ],
    audio: [
      "Générez un son de démarrage produit léger, rassurant, légèrement futuriste et adapté au lancement d'une app desktop",
      "Créez un lit sonore d'intro de podcast de 20 secondes avec une ouverture chaleureuse, une pulsation nette et un enchaînement propre vers la voix off",
      "Réalisez une boucle d'ambiance fluide pour une app de méditation, avec de douces textures naturelles, une chaleur basse fréquence et un rythme apaisant",
      "Générez un jeu de sons de notification de marque pour les états de succès, de rappel et d'erreur, en conservant une seule identité sonore",
    ],
  },
  "uk": {
    prototype: [
      "Створіть вебсайт із високою конверсією для AI CRM із чітким hero-блоком, історією про функції, доказами цінності та CTA для пробного доступу",
      "Створіть десктопний дашборд для командної бази знань із пошуком, останніми оновленнями, правами доступу та точками входу для співпраці",
      "Переробіть онбординг для фінансового SaaS-продукту, щоб нові користувачі могли підключити дані, завершити налаштування та швидко побачити першу цінність",
      "Зробіть прототип мобільного застосунку для фітнес-коучингу з постановкою цілей, тижневими планами, відмітками тренувань і переглядом прогресу",
    ],
    deck: [
      "Дослідіть ринкову можливість для запуску продукту, включно з конкурентами, цільовою аудиторією, гіпотезами щодо цін і наративом запуску",
      "Згенеруйте щотижневий звіт про стан команди з прогресом, ризиками, змінами метрик і пріоритетами на наступний тиждень",
      "Створіть інвесторську презентацію з оцінкою ринку, моделлю зростання, перевагами продукту та прогнозом на три роки",
      "Створіть презентацію стратегічного огляду бізнесу з квартальними результатами, першопричинами, можливостями та наступними кроками",
    ],
    image: [
      "Згенеруйте постер AI-робочого простору в стилі glassmorphism із багатоекранною співпрацею, м’яким освітленням і преміальним настроєм запуску",
      "Створіть hero-зображення для онлайн-магазину з новими бездротовими навушниками, що підкреслює деталі матеріалу, контекст способу життя та основні переваги",
      "Створіть мінімалістичний ключовий візуал для технологічного запуску з чистою композицією, сильним акцентом на продукт і стриманим текстом",
      "Зробіть набір соціальних тизерів для виходу продукту: відлік часу, деталі крупним планом, розкриття переваг і візуал у день запуску",
    ],
    video: [
      "Зробіть 8-секундний ролик-розкриття продукту, що переходить від силуету до деталей крупним планом і завершується знаком бренду",
      "Згенеруйте відео з демонстрацією функцій застосунку, що повторює шлях користувача, ключові стани та фінальний результат",
      "Створіть вертикальну заставку бренду з ритмічною типографікою, продуктом крупним планом і чистим завершенням з logo для короткого відео",
      "Перетворіть вебсайт на 15-секундну соціальну рекламу, виділивши головну тезу, ключові взаємодії та чіткий CTA",
    ],
    hyperframes: [
      "Створіть короткий ролик про запуск продукту з субтитрами, титрами, кадрами функцій, ритмічними переходами та фінальним CTA",
      "Згенеруйте візуалізацію даних, що реагує на звук, де смуги, частинки й заголовки відповідають ритму озвучення",
      "Створіть 3-секундну фінальну заставку з logo, використовуючи сходження ліній, легку пружність і колірну систему бренду",
      "Зробіть анімовану карту авіамаршрутів із вузлами міст, ростом маршрутів, даними про відстань і фінальним кадром-підсумком",
    ],
    audio: [
      "Згенеруйте звук запуску продукту, що звучить легко, надійно, трохи футуристично й підходить для запуску десктопного app",
      "Створіть 20-секундну музичну підкладку для вступу подкасту з теплим початком, чітким пульсом і плавним переходом до озвучення",
      "Зробіть безшовний ембієнт-луп для застосунку медитації з м’якими природними текстурами, низькочастотним теплом і спокійним темпом",
      "Згенеруйте набір фірмових звуків сповіщень для станів успіху, нагадування та помилки, зберігаючи єдину звукову ідентичність",
    ],
  },
  "tr": {
    prototype: [
      "AI CRM için net bir hero alanı, özellik hikayesi, kanıt noktaları ve deneme CTA'sı içeren, dönüşümü yüksek bir website tasarla",
      "Bir ekip bilgi tabanı için arama, son güncellemeler, izinler ve iş birliği giriş noktaları içeren bir masaüstü kontrol paneli oluştur",
      "Finansal bir SaaS ürününün onboarding sürecini, yeni kullanıcılar verilerini bağlayabilsin, kurulumu tamamlayabilsin ve ilk değeri hızla görebilsin diye yeniden tasarla",
      "Hedef belirleme, haftalık planlar, antrenman check-in'leri ve ilerleme takibini kapsayan bir mobil fitness koçluğu app'i prototiple",
    ],
    deck: [
      "Bir ürün lansmanı için rakipler, hedef kullanıcılar, fiyatlandırma hipotezleri ve lansman anlatısı dahil olmak üzere pazar fırsatını araştır",
      "İlerleme, riskler, metrik değişimleri ve gelecek haftanın önceliklerini içeren haftalık bir ekip durum raporu oluştur",
      "Pazar büyüklüğü, büyüme modeli, ürün avantajı ve üç yıllık tahmin verilerini içeren bir yatırımcı sunumu tasarla",
      "Çeyreklik performans, kök nedenler, fırsatlar ve sonraki adımları kapsayan stratejik bir iş değerlendirme sunumu oluştur",
    ],
    image: [
      "Çok ekranlı iş birliği, yumuşak ışıklandırma ve premium bir lansman atmosferi içeren glassmorphism tarzı bir AI çalışma alanı posteri oluştur",
      "Malzeme detaylarını, yaşam tarzı bağlamını ve temel faydaları öne çıkaran, yeni kablosuz kulaklıklar için bir e-ticaret hero görseli oluştur",
      "Sade bir kompozisyon, güçlü bir ürün odağı ve ölçülü lansman metni içeren minimalist bir teknoloji lansmanı ana görseli tasarla",
      "Geri sayım, yakın çekim detay, fayda tanıtımı ve lansman günü görseli içeren bir ürün lansmanı sosyal medya teaser seti hazırla",
    ],
    video: [
      "Silüetten yakın çekim detaya geçen ve marka logosuyla biten 8 saniyelik bir ürün tanıtım filmi hazırla",
      "Kullanıcı yolculuğunu, temel ekranları ve nihai sonucu takip eden bir app özellik demo videosu oluştur",
      "Kısa form videolar için ritmik tipografi, ürün yakın çekimleri ve sade bir logo finali içeren dikey bir marka açılışı oluştur",
      "Bir website'ı hero iddiasını, etkileşim öne çıkanlarını ve net bir CTA'yı çıkararak 15 saniyelik bir sosyal medya reklamına dönüştür",
    ],
    hyperframes: [
      "Başlık kartları, özellik çekimleri, ritmik geçişler ve bir bitiş CTA'sı içeren altyazılı kısa bir ürün lansmanı videosu oluştur",
      "Çubukların, parçacıkların ve başlıkların anlatım ritmine tepki verdiği, sese duyarlı bir veri görselleştirmesi oluştur",
      "Çizgi birleşimi, ince bir esneklik ve marka renk sistemini kullanan 3 saniyelik bir logo outro'su oluştur",
      "Şehir düğümleri, rota büyümesi, mesafe verileri ve son bir özet kareyi gösteren animasyonlu bir uçuş rotası haritası hazırla",
    ],
    audio: [
      "Hafif, güven veren, hafifçe fütüristik bir his veren ve bir masaüstü app lansmanına uygun bir ürün açılış sesi oluştur",
      "Sıcak bir açılış, net bir nabız ve seslendirmeye temiz bir geçiş içeren 20 saniyelik bir podcast intro müziği oluştur",
      "Yumuşak doğa dokuları, düşük frekanslı sıcaklık ve sakin bir tempo kullanan bir meditasyon app'i için kusursuz bir ambiyans döngüsü hazırla",
      "Tek bir sonik kimliği korurken başarı, hatırlatma ve hata durumları için markalı bir bildirim sesi seti oluştur",
    ],
  },
  "th": {
    prototype: [
      "ออกแบบเว็บไซต์ที่กระตุ้นการเปลี่ยนเป็นลูกค้าสำหรับ AI CRM พร้อม hero ที่ชัดเจน เรื่องราวฟีเจอร์ จุดพิสูจน์ความน่าเชื่อถือ และ CTA ทดลองใช้",
      "สร้างแดชบอร์ดบนเดสก์ท็อปสำหรับฐานความรู้ของทีม พร้อมการค้นหา อัปเดตล่าสุด สิทธิ์การเข้าถึง และจุดเริ่มต้นการทำงานร่วมกัน",
      "ออกแบบขั้นตอนเริ่มต้นใช้งานใหม่สำหรับผลิตภัณฑ์ SaaS ด้านการเงิน เพื่อให้ผู้ใช้ใหม่เชื่อมต่อข้อมูล ตั้งค่าให้เสร็จ และเห็นคุณค่าแรกได้อย่างรวดเร็ว",
      "ทำต้นแบบ app โค้ชฟิตเนสบนมือถือ ครอบคลุมการตั้งเป้าหมาย แผนรายสัปดาห์ การเช็กอินการออกกำลังกาย และการทบทวนความคืบหน้า",
    ],
    deck: [
      "วิจัยโอกาสทางการตลาดสำหรับการเปิดตัวผลิตภัณฑ์ รวมถึงคู่แข่ง กลุ่มผู้ใช้เป้าหมาย สมมติฐานด้านราคา และเรื่องราวการเปิดตัว",
      "สร้างรายงานสถานะของทีมรายสัปดาห์ พร้อมความคืบหน้า ความเสี่ยง การเปลี่ยนแปลงของตัวชี้วัด และสิ่งที่ต้องทำในสัปดาห์หน้า",
      "ออกแบบ pitch สำหรับนักลงทุน พร้อมการประเมินขนาดตลาด โมเดลการเติบโต จุดเด่นของผลิตภัณฑ์ และข้อมูลคาดการณ์สามปี",
      "สร้างเด็คทบทวนกลยุทธ์ธุรกิจ ครอบคลุมผลงานรายไตรมาส สาเหตุที่แท้จริง โอกาส และสิ่งที่ต้องทำต่อไป",
    ],
    image: [
      "สร้างโปสเตอร์พื้นที่ทำงาน AI สไตล์ glassmorphism พร้อมการทำงานร่วมกันหลายหน้าจอ แสงนวลตา และอารมณ์การเปิดตัวที่หรูหรา",
      "สร้างภาพ hero สำหรับอีคอมเมิร์ซของหูฟังไร้สายรุ่นใหม่ ที่เน้นรายละเอียดของวัสดุ บริบทการใช้งานจริง และประโยชน์หลัก",
      "ออกแบบคีย์วิชวลเปิดตัวเทคโนโลยีสไตล์มินิมอล พร้อมองค์ประกอบที่สะอาดตา เน้นผลิตภัณฑ์ชัดเจน และข้อความเปิดตัวที่กระชับ",
      "ทำชุดภาพทีเซอร์สำหรับโซเชียลของการเปิดตัวผลิตภัณฑ์ รวมถึงนับถอยหลัง ภาพระยะใกล้ การเผยประโยชน์ และภาพในวันเปิดตัว",
    ],
    video: [
      "ทำหนังเปิดตัวผลิตภัณฑ์ความยาว 8 วินาที ที่ไล่จากภาพเงาไปสู่รายละเอียดระยะใกล้ และจบด้วยเครื่องหมายแบรนด์",
      "สร้างวิดีโอสาธิตฟีเจอร์ของ app ที่ดำเนินไปตามเส้นทางของผู้ใช้ สถานะสำคัญ และผลลัพธ์สุดท้าย",
      "สร้างวิดีโอเปิดแบรนด์แนวตั้งสำหรับคลิปสั้น พร้อมตัวอักษรที่เคลื่อนไหวเป็นจังหวะ ภาพผลิตภัณฑ์ระยะใกล้ และจบด้วย logo ที่สะอาดตา",
      "เปลี่ยนเว็บไซต์ให้เป็นโฆษณาโซเชียลความยาว 15 วินาที โดยดึงข้อความ hero ไฮไลต์การโต้ตอบ และ CTA ที่ชัดเจน",
    ],
    hyperframes: [
      "สร้างคลิปสั้นเปิดตัวผลิตภัณฑ์พร้อมคำบรรยาย ด้วยการ์ดหัวเรื่อง ภาพฟีเจอร์ การเปลี่ยนฉากเป็นจังหวะ และ CTA ตอนจบ",
      "สร้างการแสดงผลข้อมูลที่ตอบสนองต่อเสียง โดยแท่งกราฟ อนุภาค และหัวเรื่องขยับตามจังหวะการบรรยาย",
      "สร้าง outro ของ logo ความยาว 3 วินาที โดยใช้เส้นที่ลู่เข้าหากัน ความยืดหยุ่นเล็กน้อย และระบบสีของแบรนด์",
      "ทำแผนที่เส้นทางการบินแบบเคลื่อนไหว ที่แสดงจุดเมือง การขยายเส้นทาง ข้อมูลระยะทาง และเฟรมสรุปตอนจบ",
    ],
    audio: [
      "สร้างเสียงเปิดผลิตภัณฑ์ที่ให้ความรู้สึกเบาสบาย น่าเชื่อถือ ล้ำสมัยเล็กน้อย และเหมาะกับการเปิดตัว app บนเดสก์ท็อป",
      "สร้างดนตรีเปิดพอดแคสต์ความยาว 20 วินาที พร้อมการเปิดที่อบอุ่น จังหวะที่ชัดเจน และส่งต่อเข้าสู่เสียงบรรยายอย่างราบรื่น",
      "ทำลูปเสียงบรรยากาศแบบไร้รอยต่อสำหรับ app นั่งสมาธิ โดยใช้พื้นผิวเสียงธรรมชาติที่นุ่มนวล ความอบอุ่นของย่านความถี่ต่ำ และจังหวะที่ผ่อนคลาย",
      "สร้างชุดเสียงแจ้งเตือนของแบรนด์สำหรับสถานะสำเร็จ เตือนความจำ และข้อผิดพลาด โดยคงเอกลักษณ์เสียงเดียวกันไว้",
    ],
  },
  "it": {
    prototype: [
      "Progetta un sito web ad alta conversione per un AI CRM con una hero chiara, lo storytelling delle funzionalità, prove concrete e una CTA per la prova gratuita",
      "Crea una dashboard desktop per la knowledge base di un team con ricerca, aggiornamenti recenti, permessi e punti di accesso alla collaborazione",
      "Riprogetta l'onboarding di un prodotto SaaS finanziario per far sì che i nuovi utenti colleghino i dati, completino la configurazione e vedano subito il primo valore",
      "Prototipa una app mobile di coaching fitness che copra l'impostazione degli obiettivi, i piani settimanali, il check-in degli allenamenti e la revisione dei progressi",
    ],
    deck: [
      "Analizza l'opportunità di mercato per il lancio di un prodotto, inclusi concorrenti, utenti target, ipotesi di prezzo e narrativa di lancio",
      "Genera un report settimanale sullo stato del team con avanzamenti, rischi, variazioni delle metriche e priorità per la prossima settimana",
      "Progetta un pitch per investitori con dimensionamento del mercato, modello di crescita, vantaggio del prodotto e previsioni a tre anni",
      "Crea una deck di business review strategica che copra le performance trimestrali, le cause profonde, le opportunità e le prossime azioni",
    ],
    image: [
      "Genera un poster di un AI workspace in stile glassmorphism con collaborazione multi-schermo, luci soffuse e un mood di lancio premium",
      "Crea una hero image ecommerce per delle nuove cuffie wireless che metta in risalto i dettagli dei materiali, il contesto lifestyle e i benefici principali",
      "Progetta un key visual minimalista per un lancio tech con una composizione pulita, un forte focus sul prodotto e un copy di lancio essenziale",
      "Realizza un set di teaser social per il drop di un prodotto, con countdown, dettaglio in primo piano, rivelazione dei benefici e visual per il giorno del lancio",
    ],
    video: [
      "Realizza un product reveal di 8 secondi che passa dalla silhouette al dettaglio in primo piano e si chiude sul brand mark",
      "Genera un video demo delle funzionalità di una app che segue il percorso dell'utente, gli stati chiave e il risultato finale",
      "Crea un brand opener verticale con tipografia ritmica, primi piani del prodotto e una chiusura pulita sul logo per i video short-form",
      "Trasforma un sito web in un annuncio social di 15 secondi estraendo la hero claim, i momenti chiave dell'interazione e una CTA chiara",
    ],
    hyperframes: [
      "Crea uno short di lancio prodotto con sottotitoli, title card, riprese delle funzionalità, transizioni ritmiche e una CTA finale",
      "Genera una visualizzazione dati audio-reattiva in cui barre, particelle e titoli reagiscono al ritmo della narrazione",
      "Crea un outro del logo di 3 secondi con convergenza di linee, una leggera elasticità e il sistema di colori del brand",
      "Realizza una mappa animata di rotte di volo che mostra i nodi delle città, la crescita delle rotte, i dati di chilometraggio e un frame riassuntivo finale",
    ],
    audio: [
      "Genera un suono di avvio prodotto che risulti leggero, affidabile, leggermente futuristico e adatto al lancio di una app desktop",
      "Crea un intro bed per podcast di 20 secondi con un'apertura calda, un pulse chiaro e un passaggio pulito verso il voiceover",
      "Realizza un loop ambient continuo per una app di meditazione con texture naturali soffuse, calore sulle basse frequenze e un ritmo calmo",
      "Genera un set di suoni di notifica brandizzati per gli stati di successo, promemoria ed errore mantenendo un'unica identità sonora",
    ],
  },
};

export const HOME_PROMPT_EXAMPLE_CHIP_IDS = [
  'prototype',
  'deck',
  'image',
  'video',
  'hyperframes',
  'audio',
] as const;

// Every supported locale must resolve its own localized example prompts; a
// missing locale entry would silently bleed English into the home composer,
// which is the regression this table exists to prevent.
export function homeHeroChipPromptExamplesForLocale(chipId: string, locale: Locale): string[] {
  return HOME_PROMPT_EXAMPLES[locale]?.[chipId] ?? HOME_PROMPT_EXAMPLES.en[chipId] ?? [];
}

function homeHeroChipPromptExamples(chipId: string, locale: Locale): string[] {
  return homeHeroChipPromptExamplesForLocale(chipId, locale);
}


function briefForChipId(chipId: string): Record<string, string> {
  switch (chipId) {
    case 'prototype':
      return { artifact_type: 'web prototype', audience: 'product evaluators', fidelity: 'high-fidelity' };
    case 'web-clone':
      return { artifact_type: 'website clone', source: 'target URL', fidelity: 'source-first visual reproduction' };
    case 'wireframe':
      return { artifact_type: 'lo-fi wireframe', audience: 'product team', fidelity: 'wireframe' };
    case 'mobile':
      return { artifact_type: 'mobile app prototype', audience: 'product evaluators', platform: 'iOS & Android' };
    case 'document':
      return { artifact_type: 'document (resume / report / PDF)', audience: 'readers' };
    case 'deck':
      return { artifact_type: 'pitch deck / presentation', audience: 'decision makers', slide_count: '10-15 pages' };
    case 'image':
      return { artifact_type: 'image', style: 'cinematic, high-quality, on-brand' };
    case 'video':
      return { artifact_type: 'video', style: 'cinematic, high-quality, on-brand' };
    case 'hyperframes':
      return { artifact_type: 'motion graphic / animated sequence', style: 'cinematic, polished transitions' };
    case 'audio':
      return { artifact_type: 'audio', style: 'professional, polished, brand-appropriate' };
    default:
      return { artifact_type: chipId };
  }
}

function briefForPluginPreset(record: InstalledPluginRecord, chipId: string): Record<string, string> {
  const brief: Record<string, string> = { ...briefForChipId(chipId) };
  const fields = record.manifest?.od?.inputs ?? [];
  for (const field of fields) {
    const value = field.default ?? field.placeholder;
    if (value != null && typeof value === 'string' && value.trim()) {
      brief[field.name] = value;
    }
  }
  return brief;
}
