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
  ReactNode,
  RefObject,
} from 'react';
import type {
  ChatSessionMode,
  ConnectorDetail,
  InputFieldSpec,
  InstalledPluginRecord,
  McpServerConfig,
} from '@open-design/contracts';
import type { SkillSummary } from '../types';
import { Icon, type IconName } from './Icon';
import { useAnalytics } from '../analytics/provider';
import { trackHomeChatComposerClick } from '../analytics/events';
import {
  chipsForGroup,
  type ChipGroup,
  type HomeHeroChip,
} from './home-hero/chips';
import {
  filterPluginsBySubChip,
  isSubChipParent,
  subChipsForChip,
  type HomeHeroSubChip,
} from './home-hero/sub-chips';
import {
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import { useI18n, useT } from '../i18n';
import type { Locale } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { PreviewSurface } from './plugins-home/cards/PreviewSurface';
import { curatedPluginPriorityForChip } from './plugins-home/curatedPriority';
import { inferPluginPreview } from './plugins-home/preview';
import { SessionModeToggle } from './SessionModeToggle';
import { ComposerPlusMenu } from './ComposerPlusMenu';
import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
  type CaretRect,
} from './composer/LexicalComposerInput';
import { CaretFloatingLayer } from './composer/CaretFloatingLayer';

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
}

export interface ExamplePromptInfo {
  title: string;
  artifactType: string;
  brief: Record<string, string>;
}

interface Props {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: HomeHeroSubmitHandler;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  activePluginTitle: string | null;
  activePluginRecord?: InstalledPluginRecord | null;
  activeChipId: string | null;
  onClearActivePlugin: () => void;
  onClearActiveChip?: () => void;
  activeSkillId?: string | null;
  activeSkillTitle?: string | null;
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
  onRemovePluginContext?: (pluginId: string) => void;
  onRemoveMcpContext?: (serverId: string) => void;
  onRemoveConnectorContext?: (connectorId: string) => void;
  onAddPlugin?: () => void;
  onAddConnector?: () => void;
  onAddMcp?: () => void;
  onOpenPluginDetails?: (record: InstalledPluginRecord) => void;
  pluginInputFields?: InputFieldSpec[];
  pluginInputValues?: Record<string, unknown>;
  pluginInputTemplate?: string | null;
  onPluginInputValuesChange?: (values: Record<string, unknown>) => void;
  inlineEditableInputNames?: string[];
  footerInputNames?: string[];
  designSystemOptions?: HomeHeroDesignSystemOption[];
  stagedFiles?: File[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
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
  onPickWorkingDir?: () => void;
  onClearWorkingDir?: () => void;
  onExamplePromptStatusChange?: (info: ExamplePromptInfo | null) => void;
  executionSwitcher?: ReactNode;
}

interface HomeHeroDesignSystemOption {
  id: string;
  title: string;
  isDefault?: boolean;
  auto?: boolean;
  group?: string;
  category?: string;
  summary?: string;
  swatches?: string[];
  logoUrl?: string;
}

type HomeMentionTab = 'all' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

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
const EMPTY_DESIGN_SYSTEM_OPTIONS: HomeHeroDesignSystemOption[] = [];
const EMPTY_STAGED_FILES: File[] = [];
const EMPTY_SKILLS: SkillSummary[] = [];
const EMPTY_MCP_OPTIONS: McpServerConfig[] = [];
const EMPTY_CONNECTOR_OPTIONS: ConnectorDetail[] = [];

export const HomeHero = forwardRef<HomeHeroHandle, Props>(function HomeHero(
  {
    prompt,
    onPromptChange,
    onSubmit,
    sessionMode = 'design',
    onSessionModeChange,
    activePluginTitle,
    activePluginRecord = null,
    activeSkillId = null,
    activeSkillTitle = null,
    activeChipId,
    onClearActivePlugin,
    onClearActiveChip = onClearActivePlugin,
    onClearActiveSkill = () => undefined,
    selectedPluginContexts = EMPTY_PLUGIN_CONTEXTS,
    contextOnlyPlugins = EMPTY_PLUGIN_CONTEXTS,
    contextOnlyMcpServers = EMPTY_MCP_OPTIONS,
    contextOnlyConnectors = EMPTY_CONNECTOR_OPTIONS,
    onRemovePluginContext = () => undefined,
    onRemoveMcpContext = () => undefined,
    onRemoveConnectorContext = () => undefined,
    onAddPlugin = () => undefined,
    onAddConnector = () => undefined,
    onAddMcp = () => undefined,
    onOpenPluginDetails = () => undefined,
    pluginInputFields = EMPTY_INPUT_FIELDS,
    pluginInputValues = EMPTY_PLUGIN_INPUT_VALUES,
    onPluginInputValuesChange = () => undefined,
    footerInputNames = EMPTY_INPUT_NAMES,
    designSystemOptions = EMPTY_DESIGN_SYSTEM_OPTIONS,
    stagedFiles = EMPTY_STAGED_FILES,
    onAddFiles = () => undefined,
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
    onPickPlugin,
    onPickExamplePlugin = () => undefined,
    onPickSkill = () => undefined,
    onPickMcp = () => undefined,
    onPickConnector = () => undefined,
    onPickChip,
    contextItemCount,
    error,
    showActivePluginChip = true,
    workingDir = null,
    onPickWorkingDir,
    onClearWorkingDir,
    onExamplePromptStatusChange,
    executionSwitcher,
  },
  ref,
) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionTab, setMentionTab] = useState<HomeMentionTab>('all');
  const [hoveredPlugin, setHoveredPlugin] = useState<InstalledPluginRecord | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Selected second-level sub-category slug (Prototype / Slide deck rail).
  // Local-only: it filters the example-prompt cards below the rail. It never
  // binds a plugin or stamps an active badge.
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedPromptExample, setSelectedPromptExample] = useState<SelectedPromptExample | null>(null);
  const [previewHomeFileKey, setPreviewHomeFileKey] = useState<string | null>(null);
  const [stagedFilePreviewUrls, setStagedFilePreviewUrls] = useState<Map<string, string>>(() => new Map());
  // Lexical-driven @-trigger state (replaces the old end-anchored
  // getContextMention regex) + the caret box the popover anchors to.
  const [mentionTrigger, setMentionTrigger] = useState<{ query: string } | null>(null);
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
  const editorRef = useRef<LexicalComposerInputHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutsMenuRef = useRef<HTMLDivElement>(null);
  const canSubmit = (prompt.trim().length > 0 || stagedFiles.length > 0) && !submitDisabled;
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
  const fileMatches = useMemo(
    () =>
      mentionActive
        ? stagedFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => fileMatchesQuery(file, mentionQuery))
            .slice(0, 6)
        : [],
    [mentionActive, mentionQuery, stagedFiles],
  );
  const pluginMatches = useMemo(
    () =>
      mentionActive
        ? pluginOptions.filter((plugin) => pluginMatchesQuery(plugin, mentionQuery)).slice(0, 6)
        : [],
    [mentionActive, mentionQuery, pluginOptions],
  );
  const skillMatches = useMemo(
    () =>
      mentionActive
        ? skillOptions.filter((skill) => skillMatchesQuery(skill, mentionQuery)).slice(0, 6)
        : [],
    [mentionActive, mentionQuery, skillOptions],
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
  const pickerOpen = mentionActive;
  const tabs: Array<{ id: HomeMentionTab; label: string; count: number }> = [
    { id: 'all', label: t('common.all'), count: fileMatches.length + pluginMatches.length + skillMatches.length + mcpMatches.length + connectorMatches.length },
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
          options: fileMatches.map(({ file, index }) => ({
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
            title: plugin.title,
            description: plugin.manifest?.description ?? plugin.id,
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
  const activeExamplePlugins = useMemo(
    () =>
      activeChipId
        ? homeHeroExamplePluginsForChip(activeChipId, pluginOptions, locale)
        : [],
    [activeChipId, locale, pluginOptions],
  );
  // Derive sub-category pills from the SAME list that feeds the preset cards
  // (`activeExamplePlugins`), not the full install set. This guarantees every
  // pill maps to at least one visible card, so selecting it always filters to
  // a non-empty slice — no "looks unfiltered" fallback needed.
  const activeSubChips = useMemo(
    () => subChipsForChip(activeChipId, activeExamplePlugins),
    [activeChipId, activeExamplePlugins],
  );
  // When a sub-category pill is active, narrow the example-prompt cards to that
  // scene. Because the pills are derived from this very list, the slice is
  // always non-empty for a real selection.
  const filteredExamplePlugins = useMemo(() => {
    if (!selectedSubcategory || !isSubChipParent(activeChipId)) return activeExamplePlugins;
    return filterPluginsBySubChip(activeExamplePlugins, activeChipId, selectedSubcategory);
  }, [activeExamplePlugins, activeChipId, selectedSubcategory]);
  const activePromptExamples = useMemo(
    () => activeChipId && activeExamplePlugins.length === 0
      ? homeHeroChipPromptExamples(activeChipId, locale)
      : [],
    [activeChipId, activeExamplePlugins.length, locale],
  );
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
    setSelectedPromptExample(null);
    setSelectedSubcategory(null);
  }, [activeChipId]);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && shortcutsMenuRef.current?.contains(target)) return;
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

  useImperativeHandle(
    ref,
    (): HomeHeroHandle => ({
      focus() {
        editorRef.current?.focus();
      },
      focusEnd() {
        editorRef.current?.focus();
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

  function removeFileChip(index: number, file: File) {
    const nextPrompt = stripHomeMentionToken(prompt, file.name);
    if (nextPrompt !== prompt) onPromptChange(nextPrompt);
    onRemoveFile(index);
  }

  function usePromptExample(example: string) {
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
  }

  function pickExamplePluginPreset(record: InstalledPluginRecord, chipId: string, promptText: string) {
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

  // plugin/MCP/connector contexts now render as inline @mention pills in the
  // composer, so they no longer drive this top row — only staged files (which
  // have no inline representation) and the active plugin/skill/example chips do.
  const showActiveContextRow =
    contextItemCount > 0 ||
    (showActivePluginChip && activePluginTitle) ||
    activeSkillTitle ||
    stagedFiles.length > 0;

  let optionRenderIndex = 0;

  return (
    <section className="home-hero" data-testid="home-hero">
      <div className="home-hero__brand" aria-hidden>
        <span className="home-hero__brand-mark">
          <img src="/app-icon.svg" alt="" draggable={false} />
        </span>
        <span className="home-hero__brand-name">Open Design</span>
      </div>
      <h1 className="home-hero__title">{t('homeHero.title')}</h1>
      <p className="home-hero__subtitle">
        {t('homeHero.subtitlePrefix')}
      </p>

      <div
        className={`home-hero__input-card${
          authoringLayoutActive ? ' home-hero__input-card--compact-authoring' : ''
        }${dragActive ? ' is-drag-active' : ''}`}
        style={inputCardStyle}
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
        {showActiveContextRow ? (
          <div
            className="home-hero__active"
            aria-label={
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
                      <span className="home-hero__active-label">{file.name}</span>
                      <span className="home-hero__active-meta">{formatFileSize(file.size)}</span>
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
                      <button
                        type="button"
                        className="home-hero__active-clear od-tooltip"
                        onClick={() => removeFileChip(index, file)}
                        aria-label={t('chat.removeAria', { name: file.name })}
                        title={t('homeHero.removeFile')}
                        data-tooltip={t('homeHero.removeFile')}
                      >
                        <Icon name="close" size={9} />
                      </button>
                    </span>
                  );
                })}
              </span>
            ) : null}
            {showActivePluginChip && activePluginTitle ? (
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
                    <Icon name="sliders" size={12} />
                  </span>
                  <span className="home-hero__active-label">{activePluginTitle}</span>
                </button>
                {activeCreateChip ? null : (
                  <button
                    type="button"
                    className="home-hero__active-clear od-tooltip"
                    onClick={onClearActivePlugin}
                    aria-label={t('homeHero.clearActivePlugin')}
                    title={t('homeHero.clearActivePlugin')}
                    data-tooltip={t('homeHero.clearActivePlugin')}
                  >
                    <Icon name="close" size={9} />
                  </button>
                )}
              </span>
            ) : null}
            {activeSkillTitle ? (
              <span
                className="home-hero__active-chip home-hero__active-chip--skill"
                data-testid="home-hero-active-skill"
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="sparkles" size={12} />
                </span>
                <span className="home-hero__active-label">{t('homeHero.skillPrefix', { title: activeSkillTitle })}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={onClearActiveSkill}
                  aria-label={t('homeHero.clearActiveSkill')}
                  title={t('homeHero.clearActiveSkill')}
                  data-tooltip={t('homeHero.clearActiveSkill')}
                >
                  <Icon name="close" size={9} />
                </button>
              </span>
            ) : null}
            {contextOnlyPlugins.map((plugin) => (
              <span
                key={`ctx-plugin-${plugin.id}`}
                className="home-hero__active-chip home-hero__active-chip--context"
                data-testid={`home-hero-context-plugin-${plugin.id}`}
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="sliders" size={12} />
                </span>
                <span className="home-hero__active-label">{plugin.title}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={() => onRemovePluginContext(plugin.id)}
                  aria-label={t('chat.removeAria', { name: plugin.title })}
                  title={t('common.close')}
                  data-tooltip={t('common.close')}
                  data-testid={`home-hero-context-clear-${plugin.id}`}
                >
                  <Icon name="close" size={9} />
                </button>
              </span>
            ))}
            {contextOnlyMcpServers.map((server) => {
              const label = server.label || server.id;
              return (
                <span
                  key={`ctx-mcp-${server.id}`}
                  className="home-hero__active-chip home-hero__active-chip--context"
                  data-testid={`home-hero-context-mcp-${server.id}`}
                >
                  <span className="home-hero__active-icon" aria-hidden>
                    <Icon name="sliders" size={12} />
                  </span>
                  <span className="home-hero__active-label">{label}</span>
                  <button
                    type="button"
                    className="home-hero__active-clear od-tooltip"
                    onClick={() => onRemoveMcpContext(server.id)}
                    aria-label={t('chat.removeAria', { name: label })}
                    title={t('common.close')}
                    data-tooltip={t('common.close')}
                    data-testid={`home-hero-context-clear-${server.id}`}
                  >
                    <Icon name="close" size={9} />
                  </button>
                </span>
              );
            })}
            {contextOnlyConnectors.map((connector) => (
              <span
                key={`ctx-connector-${connector.id}`}
                className="home-hero__active-chip home-hero__active-chip--context"
                data-testid={`home-hero-context-connector-${connector.id}`}
              >
                <span className="home-hero__active-icon" aria-hidden>
                  <Icon name="link" size={12} />
                </span>
                <span className="home-hero__active-label">{connector.name}</span>
                <button
                  type="button"
                  className="home-hero__active-clear od-tooltip"
                  onClick={() => onRemoveConnectorContext(connector.id)}
                  aria-label={t('chat.removeAria', { name: connector.name })}
                  title={t('common.close')}
                  data-tooltip={t('common.close')}
                  data-testid={`home-hero-context-clear-${connector.id}`}
                >
                  <Icon name="close" size={9} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="home-hero__prompt-surface">
          <div className="home-hero__prompt-editor home-hero__lexical">
            <LexicalComposerInput
              ref={editorRef}
              testId="home-hero-input"
              draft={prompt}
              placeholder={placeholder}
              title={placeholder}
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
              onEnterSend={() => {
                if (canSubmit) onSubmit();
              }}
              onPasteFiles={handleFiles}
              popoverOpen={pickerOpen && visiblePickerOptions.length > 0}
              onPopoverKey={handlePopoverKey}
              comboboxAria={{
                expanded: pickerOpen,
                activeId: pickerOpen ? `home-hero-option-${selectedIndex}` : null,
              }}
            />
          </div>
        </div>
        <CaretFloatingLayer caret={caretRect} open={pickerOpen}>
          <div
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
                  <strong>{hoveredPlugin.title}</strong>
                  <p>{hoveredPlugin.manifest?.description ?? hoveredPlugin.id}</p>
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
            <ComposerPlusMenu
              triggerTestId="home-hero-plus-trigger"
              connectors={connectorOptions}
              onPickConnector={pickConnector}
              onAddConnector={onAddConnector}
              plugins={pluginOptions}
              onPickPlugin={pickPlugin}
              onAddPlugin={onAddPlugin}
              mcpServers={mcpOptions}
              onPickMcp={pickMcp}
              onAddMcp={onAddMcp}
              onAttachFiles={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
            />
            {onPickWorkingDir ? (
              <div className="home-hero__working-dir-wrap">
                <button
                  type="button"
                  className={`home-hero__working-dir${workingDir ? ' picked' : ''}`}
                  onClick={onPickWorkingDir}
                  title={workingDir ?? t('workingDirPicker.select')}
                >
                  <Icon name="folder" size={13} />
                  <span>
                    {workingDir ? workingDir.split(/[/\\]/).filter(Boolean).pop() : t('workingDirPicker.select')}
                  </span>
                </button>
                {workingDir ? (
                  <button
                    type="button"
                    className="home-hero__working-dir-clear"
                    onClick={() => onClearWorkingDir?.()}
                    aria-label={t('workingDirPicker.clearAria')}
                  >
                    <Icon name="close" size={10} />
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeCreateChip ? (
              <ActiveTypeChip chip={activeCreateChip} onClear={onClearActiveChip} />
            ) : null}
            {footerInputFields.length > 0 ? (
              <div className="home-hero__footer-options" data-testid="home-hero-footer-options">
                {footerInputFields.map((field) => (
                  <FooterInputOption
                    key={field.name}
                    field={field}
                    value={pluginInputValues[field.name]}
                    designSystemOptions={designSystemOptions}
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
            <SessionModeToggle
              mode={sessionMode}
              onChange={onSessionModeChange}
              disabled={Boolean(submitDisabled)}
            />
            {executionSwitcher ? (
              <div className="home-hero__execution-switcher">
                {executionSwitcher}
              </div>
            ) : null}
            <button
              type="button"
              className="home-hero__submit od-tooltip"
              data-testid="home-hero-submit"
              onClick={onSubmit}
              disabled={!canSubmit}
              title={canSubmit ? t('homeHero.run') : t('homeHero.typeSomethingToRun')}
              data-tooltip={canSubmit ? t('homeHero.run') : t('homeHero.typeSomethingToRun')}
              aria-label={t('homeHero.run')}
            >
              <Icon name="send" size={13} />
              <span>{t('chat.send')}</span>
            </button>
          </div>
        </div>
      </div>

      {activeCreateChip ? null : (
        <RailGroup
          group="create"
          activeChipId={activeChipId}
          pendingChipId={pendingChipId}
          pendingPluginId={pendingPluginId}
          pluginsLoading={pluginsLoading}
          onPickChip={onPickChip}
          variant="tabs"
        >
          <ShortcutsMenu
            activeChipId={activeChipId}
            pendingChipId={pendingChipId}
            pendingPluginId={pendingPluginId}
            pluginsLoading={pluginsLoading}
            open={shortcutsOpen}
            refNode={shortcutsMenuRef}
            onOpenChange={setShortcutsOpen}
            onPickChip={(chip) => {
              setShortcutsOpen(false);
              onPickChip(chip);
            }}
          />
        </RailGroup>
      )}

      {activeSubChips.length > 0 && isSubChipParent(activeChipId) ? (
        <SubTypeRow
          subChips={activeSubChips}
          selectedSlug={selectedSubcategory}
          pluginsLoading={pluginsLoading}
          onPickSubChip={(sub) =>
            setSelectedSubcategory((current) => (current === sub.slug ? null : sub.slug))
          }
          onSelectAll={() => setSelectedSubcategory(null)}
        />
      ) : null}

      {filteredExamplePlugins.length > 0 && activeChipId ? (
        <PluginPromptPresets
          chipId={activeChipId}
          plugins={filteredExamplePlugins}
          activePluginId={activePluginRecord?.id ?? null}
          pendingPluginId={pendingPluginId}
          locale={locale}
          onPick={pickExamplePluginPreset}
        />
      ) : activePromptExamples.length > 0 ? (
        <div
          className="home-hero__prompt-examples"
          data-testid="home-hero-prompt-examples"
        >
          <div className="home-hero__prompt-examples-title">
            {t('homeHero.promptExamples')}
          </div>
          <div className="home-hero__prompt-examples-grid">
            {activePromptExamples.map((example) => (
              <button
                key={example}
                type="button"
                className="home-hero__prompt-example"
                data-testid="home-hero-prompt-example"
                onClick={() => usePromptExample(example)}
              >
                <span>{example}</span>
              </button>
            ))}
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

function PluginPromptPresets({
  activePluginId,
  chipId,
  locale,
  onPick,
  pendingPluginId,
  plugins,
}: {
  activePluginId: string | null;
  chipId: string;
  locale: Locale;
  onPick: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  pendingPluginId: string | null;
  plugins: InstalledPluginRecord[];
}) {
  const { t } = useI18n();
  return (
    <div
      className="home-hero__prompt-examples home-hero__plugin-presets-wrap"
      data-testid="home-hero-plugin-presets"
    >
      <div className="home-hero__prompt-examples-title">
        {t('homeHero.promptExamples')}
      </div>
      <div className="home-hero__plugin-presets" role="list">
        {plugins.map((record) => (
          <PluginPromptPresetCard
            key={record.id}
            chipId={chipId}
            locale={locale}
            record={record}
            active={activePluginId === record.id}
            pending={pendingPluginId === record.id}
            disabled={pendingPluginId !== null}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

function PluginPromptPresetCard({
  active,
  chipId,
  disabled,
  locale,
  onPick,
  pending,
  record,
}: {
  active: boolean;
  chipId: string;
  disabled: boolean;
  locale: Locale;
  onPick: (record: InstalledPluginRecord, chipId: string, promptText: string) => void;
  pending: boolean;
  record: InstalledPluginRecord;
}) {
  const preview = useMemo(() => inferPluginPreview(record), [record]);
  const promptPreview = pluginPresetPromptPreview(record, locale, chipId);
  return (
    <button
      type="button"
      className={`home-hero__plugin-preset${active ? ' is-active' : ''}${pending ? ' is-pending' : ''}`}
      data-testid="home-hero-plugin-preset"
      data-plugin-id={record.id}
      role="listitem"
      disabled={disabled}
      onClick={() => onPick(record, chipId, promptPreview)}
    >
      <span className="home-hero__plugin-preset-preview" aria-hidden>
        <PreviewSurface
          pluginId={record.id}
          pluginTitle={record.title}
          preview={preview}
        />
        {active ? (
          <span className="home-hero__plugin-preset-check" aria-hidden>
            <Icon name="check" size={12} />
          </span>
        ) : null}
      </span>
      <span className="home-hero__plugin-preset-title">
        {record.title}
      </span>
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

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name);
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

const HOME_HERO_PROMPT_MAX_HEIGHT = 180;
const HOME_HERO_AUTHORING_PROMPT_MAX_HEIGHT = 132;
// `{{name}}` plugin-input placeholder — still used when rendering plugin
// preset query previews (renderPluginPresetQuery).
const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;

function pluginMentionText(record: InstalledPluginRecord): string {
  return inlineMentionToken(record.title);
}

function buildHomeMentionEntities({
  activePluginRecord,
  activeSkillId,
  activeSkillTitle,
  connectorOptions,
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
  mcpOptions: McpServerConfig[];
  pluginOptions: InstalledPluginRecord[];
  selectedPluginContexts: InstalledPluginRecord[];
  stagedFiles: File[];
  skillOptions: SkillSummary[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
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
  designSystemOptions,
  onChange,
  t,
}: {
  field: InputFieldSpec;
  value: unknown;
  designSystemOptions: HomeHeroDesignSystemOption[];
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
  if (field.name === 'designSystem' && designSystemOptions.length > 0) {
    const selectedValue = value === undefined || value === null ? '' : String(value);
    const selectedOption = selectedValue.length > 0
      ? designSystemOptions.find((option) => option.title === selectedValue || option.id === selectedValue)
      : undefined;
    const currentValue = selectedOption?.id ?? designSystemOptions[0]?.id ?? '';
    return (
      <FooterSelectOption
        fieldName={field.name}
        label={label}
        value={currentValue}
        options={designSystemOptions.map((option) => ({
          value: option.id,
          submitValue: option.title,
          label: option.isDefault ? `${option.title} (${t('ds.badgeDefault')})` : option.title,
          group: option.group,
          icon: option.auto ? 'sparkles' : undefined,
          description: option.summary,
          meta: option.category,
          preview: option.auto
            ? undefined
            : {
                title: option.title,
                swatches: option.swatches,
                logoUrl: option.logoUrl,
              },
        }))}
        searchable
        searchPlaceholder={t('ds.searchPlaceholder')}
        onChange={onChange}
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

function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    plugin.id,
    plugin.sourceKind,
    plugin.manifest?.description ?? '',
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function skillMatchesQuery(skill: SkillSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    skill.id,
    skill.name,
    skill.description,
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
  children,
}: RailGroupProps) {
  const t = useT();
  const chips = useMemo(() => chipsForGroup(group), [group]);
  const isTabs = variant === 'tabs';
  return (
    <div
      className={
        isTabs
          ? `home-hero__type-tabs home-hero__type-tabs--${group}`
          : `home-hero__rail-group home-hero__rail-group--${group}`
      }
      data-testid={isTabs ? 'home-hero-type-tabs' : undefined}
      data-rail-group={group}
      role={isTabs ? 'tablist' : undefined}
      aria-label={isTabs ? t('homeHero.railAria') : undefined}
    >
      {chips.map((chip) => {
        const isActive = activeChipId === chip.id;
        const isPending = pendingChipId === chip.id;
        const cls = isTabs
          ? ['home-hero__type-tab', `home-hero__type-tab--${group}`]
          : ['home-hero__rail-chip', `home-hero__rail-chip--${group}`];
        if (isActive) cls.push('is-active');
        if (isPending) cls.push('is-pending');
        return (
          <button
            key={chip.id}
            type="button"
            className={cls.join(' ')}
            data-chip-id={chip.id}
            data-testid={`home-hero-rail-${chip.id}`}
            onClick={() => onPickChip(chip)}
            disabled={pluginsLoading || isPending || pendingPluginId !== null}
            role={isTabs ? 'tab' : undefined}
            aria-selected={isTabs ? isActive : undefined}
            aria-pressed={isTabs ? undefined : isActive}
            title={homeHeroChipTitle(chip, t)}
          >
            <Icon
              name={chip.icon}
              size={14}
              className={isTabs ? 'home-hero__type-tab-icon' : 'home-hero__rail-chip-icon'}
            />
            <span className={isTabs ? 'home-hero__type-tab-label' : 'home-hero__rail-chip-label'}>
              {homeHeroChipLabel(chip.id, t)}
            </span>
          </button>
        );
      })}
      {children}
    </div>
  );
}

function SubTypeRow({
  subChips,
  selectedSlug,
  pluginsLoading,
  onPickSubChip,
  onSelectAll,
}: {
  subChips: HomeHeroSubChip[];
  selectedSlug: string | null;
  pluginsLoading: boolean;
  onPickSubChip: (sub: HomeHeroSubChip) => void;
  onSelectAll: () => void;
}) {
  const t = useT();
  const allActive = selectedSlug === null;
  return (
    <div
      className="home-hero__subtype-row"
      data-testid="home-hero-subtype-row"
      role="tablist"
      aria-label={t('homeHero.subTypeAria')}
    >
      <button
        type="button"
        className={`home-hero__subtype-chip${allActive ? ' is-active' : ''}`}
        data-sub-chip-id="all"
        data-testid="home-hero-subtype-all"
        onClick={onSelectAll}
        disabled={pluginsLoading}
        role="tab"
        aria-selected={allActive}
      >
        <span className="home-hero__subtype-chip-label">{t('common.all')}</span>
      </button>
      {subChips.map((sub) => {
        const isActive = sub.slug === selectedSlug;
        const cls = ['home-hero__subtype-chip'];
        if (isActive) cls.push('is-active');
        return (
          <button
            key={sub.slug}
            type="button"
            className={cls.join(' ')}
            data-sub-chip-id={sub.slug}
            data-testid={`home-hero-subtype-${sub.slug}`}
            onClick={() => onPickSubChip(sub)}
            disabled={pluginsLoading}
            role="tab"
            aria-selected={isActive}
          >
            <Icon name={sub.icon} size={13} className="home-hero__subtype-chip-icon" />
            <span className="home-hero__subtype-chip-label">{sub.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActiveTypeChip({ chip, onClear }: { chip: HomeHeroChip; onClear: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className="home-hero__active-type-chip"
      data-testid="home-hero-active-type-chip"
      data-chip-id={chip.id}
      title={homeHeroChipTitle(chip, t)}
      aria-label={`${homeHeroChipLabel(chip.id, t)} ${t('common.delete')}`}
      onClick={onClear}
    >
      <span className="home-hero__active-type-chip-icon" aria-hidden>
        <Icon name={chip.icon} size={13} />
      </span>
      <span>{homeHeroChipLabel(chip.id, t)}</span>
      <Icon name="close" size={12} className="home-hero__active-type-chip-close" />
    </button>
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
  return (
    <div
      ref={refNode}
      className="home-hero__shortcut-menu"
      data-testid="home-hero-shortcuts"
      data-rail-group="migrate"
    >
      <button
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
      {open ? (
        <div
          className="home-hero__shortcut-menu-panel"
          role="menu"
          aria-label={t('homeHero.moreShortcuts')}
          data-testid="home-hero-shortcuts-menu"
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
        </div>
      ) : null}
    </div>
  );
}

function homeHeroChipLabel(chipId: string, t: ReturnType<typeof useT>): string {
  switch (chipId) {
    case 'prototype': return t('homeHero.chip.prototype');
    case 'live-artifact': return t('homeHero.chip.liveArtifact');
    case 'deck': return t('homeHero.chip.deck');
    case 'image': return t('homeHero.chip.image');
    case 'video': return t('homeHero.chip.video');
    case 'hyperframes': return t('homeHero.chip.hyperframes');
    case 'audio': return t('homeHero.chip.audio');
    case 'create-plugin': return t('homeHero.chip.createPlugin');
    case 'figma': return t('homeHero.chip.figma');
    case 'template': return t('homeHero.chip.template');
    default: return chipId;
  }
}

function homeHeroChipTitle(chip: HomeHeroChip, t: ReturnType<typeof useT>): string {
  switch (chip.id) {
    case 'live-artifact': return t('homeHero.chip.liveArtifactHint');
    case 'hyperframes': return t('homeHero.chip.hyperframesHint');
    case 'create-plugin': return t('homeHero.chip.createPluginHint');
    case 'figma': return t('homeHero.chip.figmaHint');
    case 'template': return t('homeHero.chip.templateHint');
    default: return homeHeroChipLabel(chip.id, t);
  }
}

function homeHeroExamplePluginsForChip(
  chipId: string,
  plugins: InstalledPluginRecord[],
  locale: Locale,
): InstalledPluginRecord[] {
  const presets = plugins
    .filter((plugin) => (
      pluginMatchesExampleChip(plugin, chipId) ||
      curatedPluginPriorityForChip(plugin, chipId) !== null
    ))
    .filter((plugin) => (
      Boolean(pluginPresetQuery(plugin, locale)) ||
      curatedPluginPriorityForChip(plugin, chipId) !== null
    ))
    .sort((a, b) => comparePluginPresetOrder(a, b, chipId))
    .slice(0, 18);
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

function pluginMatchesExampleChip(record: InstalledPluginRecord, chipId: string): boolean {
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
    case 'deck':
      return has('deck', 'slides', 'slide-deck') || hasPart('slide', 'deck');
    case 'hyperframes':
      return hasPart('hyperframes', 'hyperframe');
    case 'live-artifact':
      return has('live-artifact') || hasPart('live-artifact');
    case 'image':
      return (has('image') || hasPart('image-template')) && !hasPart('video', 'audio', 'live-artifact');
    case 'video':
      return (has('video') || hasPart('video-template')) && !hasPart('hyperframes', 'audio');
    case 'audio':
      return has('audio') || hasPart('audio');
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
  const rendered = query ? renderPluginPresetQuery(record, query) : record.manifest?.description ?? '';
  return textPromptForPluginPreset(record, rendered, chipId, locale);
}

function pluginPresetQuery(record: InstalledPluginRecord, locale: Locale): string | null {
  const query = record.manifest?.od?.useCase?.query;
  if (typeof query === 'string') return query;
  if (query && typeof query === 'object') {
    const localized = query as Record<string, unknown>;
    const exact = localized[locale];
    if (typeof exact === 'string') return exact;
    const language = locale.split('-')[0];
    const languageMatch = Object.entries(localized).find(([key, value]) => (
      key.toLowerCase().startsWith(`${language}-`) && typeof value === 'string'
    ));
    if (typeof languageMatch?.[1] === 'string') return languageMatch[1];
    for (const key of ['zh-CN', 'en', 'default']) {
      if (typeof localized[key] === 'string') return localized[key];
    }
    const first = Object.values(localized).find((value) => typeof value === 'string');
    if (typeof first === 'string') return first;
  }
  return null;
}

function renderPluginPresetQuery(record: InstalledPluginRecord, query: string): string {
  const fields = record.manifest?.od?.inputs ?? [];
  const valueByName = new Map<string, string>();
  for (const field of fields) {
    const value = field.default ?? field.placeholder ?? field.label ?? field.name;
    valueByName.set(field.name, String(value));
  }
  return query
    .replace(
      HOME_ESCAPED_ARGUMENT_PLACEHOLDER_PATTERN,
      (_placeholder, _name: string | undefined, defaultValue: string | undefined) => defaultValue ?? '',
    )
    .replace(
      HOME_ARGUMENT_PLACEHOLDER_PATTERN,
      (
        _placeholder,
        _doubleName: string | undefined,
        _singleName: string | undefined,
        doubleDefault: string | undefined,
        singleDefault: string | undefined,
      ) => doubleDefault ?? singleDefault ?? '',
    )
    .replace(INPUT_PLACEHOLDER_PATTERN, (_placeholder, key: string) => (
      valueByName.get(key) ?? key
    ));
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
  const zh = isChineseLocale(locale);
  const artifact = pluginPresetArtifactLabel(chipId, zh);
  const title = record.title.trim();
  const strings = collectStructuredPromptStrings(structured);
  const main =
    strings.find((item) => isMainPromptField(item.key) && item.value.length >= 8)?.value ??
    strings.find((item) => item.value.length >= 16)?.value ??
    record.manifest?.description ??
    title;
  const detailValues = uniquePromptStrings(
    strings
      .filter((item) => item.value !== main)
      .filter((item) => isUsefulPromptDetail(item.value))
      .map((item) => item.value),
  ).slice(0, 4);
  if (zh) {
    const details = detailValues.length > 0
      ? `重点包含：${detailValues.join('；')}。`
      : '';
    return `使用「${title}」插件生成${artifact}。${main}${sentenceEnd(main)}${details}`;
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

function pluginPresetArtifactLabel(chipId: string, zh: boolean): string {
  if (zh) {
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
  const zh = isChineseLocale(locale);
  const artifact = pluginPresetArtifactLabel(chipId, zh);
  const description = record.manifest?.description?.trim();
  if (zh) {
    return `使用「${record.title}」插件生成${artifact}${description ? `，方向是：${description}` : ''}。`;
  }
  return `Create ${englishArticle(artifact)} ${artifact} with the "${record.title}" preset${description ? `: ${description}` : '.'}`;
}

const HOME_ESCAPED_ARGUMENT_PLACEHOLDER_PATTERN =
  /\{argument\s+name=\\"([^"]+)\\"\s+default=\\"([^"]*)\\"[^}]*\}/g;

const HOME_ARGUMENT_PLACEHOLDER_PATTERN =
  /\{argument\s+name=(?:"([^"]+)"|'([^']+)')\s+default=(?:"([^"]*)"|'([^']*)')[^}]*\}/g;

function homeHeroChipPromptExamples(chipId: string, locale: Locale): string[] {
  const zh = isChineseLocale(locale);
  switch (chipId) {
    case 'prototype':
      return zh
        ? [
            '为 AI CRM 设计一个高转化官网，包含首屏、功能卖点、客户案例和清晰的试用入口',
            '为团队知识库做一个桌面端仪表盘，突出搜索、最近更新、权限状态和协作入口',
            '重构金融 SaaS 的 onboarding 流程，让新用户能快速完成开户、连接数据和看到首个洞察',
            '设计一个移动端健身教练 App 原型，覆盖目标设定、训练计划、打卡反馈和进度复盘',
          ]
        : [
            'Design a high-converting website for an AI CRM with a clear hero, feature story, proof points, and trial CTA',
            'Create a desktop dashboard for a team knowledge base with search, recent updates, permissions, and collaboration entry points',
            'Redesign onboarding for a financial SaaS product so new users can connect data, finish setup, and see first value fast',
            'Prototype a mobile fitness coaching app covering goal setup, weekly plans, workout check-ins, and progress review',
          ];
    case 'deck':
      return zh
        ? [
            '研究一个新产品发布的市场机会，输出竞品格局、目标用户、定价假设和上市叙事',
            '生成每周团队状态报告，汇总进展、风险、关键指标变化和下周优先级',
            '设计一份投资者推介材料，包含市场规模、增长模型、产品优势和三年预测数据',
            '创建战略业务复盘演示文稿，讲清本季度表现、问题原因、机会判断和下一步行动',
          ]
        : [
            'Research the market opportunity for a product launch, including competitors, target users, pricing hypotheses, and launch narrative',
            'Generate a weekly team status report with progress, risks, metric changes, and next-week priorities',
            'Design an investor pitch with market sizing, growth model, product advantage, and three-year forecast data',
            'Create a strategic business review deck covering quarterly performance, root causes, opportunities, and next actions',
          ];
    case 'image':
      return zh
        ? [
            '生成一张玻璃质感 AI 工作台海报，画面包含多屏协作、柔和光影和高级产品发布氛围',
            '为新款无线耳机做一张电商首屏主图，突出材质细节、佩戴场景和核心卖点',
            '设计一张极简科技发布会 KV，用干净构图、强主视觉和少量文字表达新品发布',
            '做一套社媒新品预热视觉，包含倒计时、局部特写、卖点揭示和发布日主图',
          ]
        : [
            'Generate a glassmorphism AI workspace poster with multi-screen collaboration, soft lighting, and a premium launch mood',
            'Create an ecommerce hero image for new wireless headphones that highlights material detail, lifestyle context, and core benefits',
            'Design a minimalist tech launch key visual with a clean composition, strong product focus, and restrained launch copy',
            'Make a social teaser set for a product drop, including countdown, close-up detail, benefit reveal, and launch-day visual',
          ];
    case 'video':
      return zh
        ? [
            '做一个 8 秒产品 reveal 短片，从暗场轮廓推进到完整产品特写，结尾出现品牌标识',
            '生成一段 App 功能演示视频，按用户操作路径展示核心流程、关键状态和结果反馈',
            '制作竖屏品牌开场动画，用节奏化文字、产品局部和 logo 收束，适合短视频开头',
            '把一个网站转成 15 秒社媒广告，提炼首屏卖点、交互亮点和明确行动号召',
          ]
        : [
            'Make an 8-second product reveal film that moves from silhouette to close-up detail and ends on the brand mark',
            'Generate an app feature demo video that follows the user journey, key states, and final outcome',
            'Create a vertical brand opener with rhythmic typography, product close-ups, and a clean logo ending for short-form video',
            'Turn a website into a 15-second social ad by extracting the hero claim, interaction highlights, and a clear CTA',
          ];
    case 'hyperframes':
      return zh
        ? [
            '做一个带字幕的产品发布短片，包含标题卡、功能镜头、节奏转场和结尾 CTA',
            '生成一段音频响应数据可视化，让柱状图、粒子和标题随旁白节奏变化',
            '制作 logo outro 动效，用线条收束、轻微弹性和品牌色完成 3 秒结尾动画',
            '做一个航线地图动态演示，展示城市节点、路径增长、里程数据和最终汇总画面',
          ]
        : [
            'Build a captioned product launch short with title cards, feature shots, rhythmic transitions, and an ending CTA',
            'Generate an audio-reactive data visualization where bars, particles, and titles respond to narration beats',
            'Create a 3-second logo outro using line convergence, subtle elasticity, and the brand color system',
            'Make an animated flight-route map showing city nodes, route growth, mileage data, and a final summary frame',
          ];
    case 'audio':
      return zh
        ? [
            '生成一段产品启动音效，听起来轻盈、可信、带一点未来感，适合桌面 App 打开时播放',
            '制作 20 秒播客片头音乐，包含温暖前奏、清晰节拍和适合人声进入的收尾',
            '做一个冥想 App 的环境音循环，使用柔和自然声、低频铺底和无缝循环结构',
            '生成一组品牌通知提示音，区分成功、提醒和错误状态，但保持同一声音识别度',
          ]
        : [
            'Generate a product startup sound that feels light, trustworthy, slightly futuristic, and suitable for a desktop app launch',
            'Create a 20-second podcast intro bed with a warm opening, clear pulse, and a clean handoff into voiceover',
            'Make a seamless ambient loop for a meditation app using soft nature textures, low-frequency warmth, and calm pacing',
            'Generate a branded notification sound set for success, reminder, and error states while keeping one sonic identity',
          ];
    default:
      return [];
  }
}

function isChineseLocale(locale: Locale): boolean {
  return locale === 'zh-CN' || locale === 'zh-TW';
}

function briefForChipId(chipId: string): Record<string, string> {
  switch (chipId) {
    case 'prototype':
      return { artifact_type: 'web prototype', audience: 'product evaluators', fidelity: 'high-fidelity' };
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
