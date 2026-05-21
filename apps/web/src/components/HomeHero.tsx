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
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  ReactNode,
} from 'react';
import type {
  ConnectorDetail,
  InputFieldSpec,
  InstalledPluginRecord,
  McpServerConfig,
} from '@open-design/contracts';
import type { SkillSummary } from '../types';
import { Icon, type IconName } from './Icon';
import { PluginInputsForm } from './PluginInputsForm';
import { useAnalytics } from '../analytics/provider';
import { trackHomeChatComposerClick } from '../analytics/events';
import {
  chipsForGroup,
  type ChipGroup,
  type HomeHeroChip,
} from './home-hero/chips';
import {
  buildInlineMentionParts,
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import { useI18n, useT } from '../i18n';
import type { Locale } from '../i18n/types';
import { PreviewSurface } from './plugins-home/cards/PreviewSurface';
import { inferPluginPreview } from './plugins-home/preview';

export interface HomeHeroSubmitHandler {
  (): void;
}

interface Props {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: HomeHeroSubmitHandler;
  activePluginTitle: string | null;
  activePluginRecord?: InstalledPluginRecord | null;
  activeChipId: string | null;
  onClearActivePlugin: () => void;
  onClearActiveChip?: () => void;
  activeSkillId?: string | null;
  activeSkillTitle?: string | null;
  onClearActiveSkill?: () => void;
  selectedPluginContexts?: InstalledPluginRecord[];
  onRemovePluginContext?: (pluginId: string) => void;
  onOpenPluginDetails?: (record: InstalledPluginRecord) => void;
  pluginInputFields?: InputFieldSpec[];
  pluginInputValues?: Record<string, unknown>;
  pluginInputTemplate?: string | null;
  onPluginInputValuesChange?: (values: Record<string, unknown>) => void;
  onPluginInputValidityChange?: (valid: boolean) => void;
  inlineEditableInputNames?: string[];
  showPluginInputsForm?: boolean;
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

type HomeMentionTab = 'all' | 'plugins' | 'skills' | 'mcp' | 'connectors';

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

export const HomeHero = forwardRef<HTMLTextAreaElement, Props>(function HomeHero(
  {
    prompt,
    onPromptChange,
    onSubmit,
    activePluginTitle,
    activePluginRecord = null,
    activeSkillId = null,
    activeSkillTitle = null,
    activeChipId,
    onClearActivePlugin,
    onClearActiveChip = onClearActivePlugin,
    onClearActiveSkill = () => undefined,
    selectedPluginContexts = [],
    onRemovePluginContext = () => undefined,
    onOpenPluginDetails = () => undefined,
    pluginInputFields = [],
    pluginInputValues = {},
    pluginInputTemplate = null,
    onPluginInputValuesChange = () => undefined,
    onPluginInputValidityChange = () => undefined,
    inlineEditableInputNames = [],
    showPluginInputsForm = true,
    footerInputNames = [],
    designSystemOptions = [],
    stagedFiles = [],
    onAddFiles = () => undefined,
    onRemoveFile = () => undefined,
    pluginOptions,
    pluginsLoading,
    skillOptions = [],
    skillsLoading = false,
    mcpOptions = [],
    mcpLoading = false,
    connectorOptions = [],
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
  },
  ref,
) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionTab, setMentionTab] = useState<HomeMentionTab>('all');
  const [hoveredPlugin, setHoveredPlugin] = useState<InstalledPluginRecord | null>(null);
  const [promptScrollTop, setPromptScrollTop] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [openInlineInputName, setOpenInlineInputName] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const composingRef = useRef(false);
  const inputElementRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutsMenuRef = useRef<HTMLDivElement>(null);
  const canSubmit = (prompt.trim().length > 0 || stagedFiles.length > 0) && !submitDisabled;
  const placeholder = activePluginTitle || activeSkillTitle
    ? t('homeHero.placeholderActive')
    : t('homeHero.placeholder');
  const mention = getContextMention(prompt);
  const mentionActive = Boolean(mention);
  const mentionQuery = mention?.query ?? '';
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
    { id: 'all', label: t('common.all'), count: pluginMatches.length + skillMatches.length + mcpMatches.length + connectorMatches.length },
    { id: 'plugins', label: t('entry.navPlugins'), count: pluginMatches.length },
    { id: 'skills', label: t('homeHero.skills'), count: skillMatches.length },
    { id: 'mcp', label: 'MCP', count: mcpMatches.length },
    { id: 'connectors', label: 'Connectors', count: connectorMatches.length },
  ];
  const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
  const showSkills = mentionTab === 'all' || mentionTab === 'skills';
  const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
  const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
  const visibleSections: HomeMentionSection[] = [
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
            title: skill.name,
            description: skill.description || skill.id,
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
      skillOptions,
    ],
  );
  const pluginByMentionId = useMemo(() => {
    const map = new Map<string, InstalledPluginRecord>();
    for (const plugin of pluginOptions) map.set(plugin.id, plugin);
    for (const plugin of selectedPluginContexts) map.set(plugin.id, plugin);
    if (activePluginRecord) map.set(activePluginRecord.id, activePluginRecord);
    return map;
  }, [activePluginRecord, pluginOptions, selectedPluginContexts]);
  const promptOverlayParts = useMemo(
    () => buildPromptOverlayParts(
      pluginInputTemplate,
      pluginInputValues,
      prompt,
      promptMentionEntities,
    ),
    [pluginInputTemplate, pluginInputValues, prompt, promptMentionEntities],
  );
  const promptMentionRanges = useMemo(
    () => buildPromptMentionRanges(promptOverlayParts),
    [promptOverlayParts],
  );
  const fieldByName = useMemo(
    () => new Map(pluginInputFields.map((field) => [field.name, field])),
    [pluginInputFields],
  );
  const editableInputNames = useMemo(
    () => new Set(inlineEditableInputNames),
    [inlineEditableInputNames],
  );
  const footerInputNameSet = useMemo(
    () => new Set(footerInputNames),
    [footerInputNames],
  );
  const openInlineInputField = openInlineInputName
    ? fieldByName.get(openInlineInputName) ?? null
    : null;
  // Filter out inputs whose values are already shown inline in the
  // prompt template, plus fields promoted into the compact footer.
  const templateFieldKeys = useMemo(() => {
    if (!pluginInputTemplate) return new Set<string>();
    const keys = new Set<string>();
    INPUT_PLACEHOLDER_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INPUT_PLACEHOLDER_PATTERN.exec(pluginInputTemplate)) !== null) {
      if (match[1]) keys.add(match[1]);
    }
    return keys;
  }, [pluginInputTemplate]);
  const footerInputFields = useMemo(
    () => footerInputNames
      .map((name) => fieldByName.get(name))
      .filter((field): field is InputFieldSpec => Boolean(field)),
    [fieldByName, footerInputNames],
  );
  const remainingInputFields = useMemo(
    () => pluginInputFields.filter(
      (field) => !templateFieldKeys.has(field.name) && !footerInputNameSet.has(field.name),
    ),
    [footerInputNameSet, pluginInputFields, templateFieldKeys],
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
  const activePromptExamples = useMemo(
    () => activeChipId && activeExamplePlugins.length === 0
      ? homeHeroChipPromptExamples(activeChipId, locale)
      : [],
    [activeChipId, activeExamplePlugins.length, locale],
  );
  useEffect(() => {
    if (selectedIndex >= visiblePickerOptions.length) setSelectedIndex(0);
  }, [selectedIndex, visiblePickerOptions.length]);

  useEffect(() => {
    if (!pickerOpen) setHoveredPlugin(null);
  }, [pickerOpen]);

  useEffect(() => {
    setOpenInlineInputName(null);
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
    setPromptScrollTop(inputElementRef.current?.scrollTop ?? 0);
  }, [prompt, promptOverlayParts]);

  // Auto-grow the prompt textarea until it reaches the composer cap.
  // Beyond that, the textarea scrolls internally so a long preset
  // prompt does not push the rest of Home off screen.
  useLayoutEffect(() => {
    const el = inputElementRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, HOME_HERO_PROMPT_MAX_HEIGHT);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > HOME_HERO_PROMPT_MAX_HEIGHT ? 'auto' : 'hidden';
    if (el.scrollHeight <= HOME_HERO_PROMPT_MAX_HEIGHT && el.scrollTop !== 0) {
      el.scrollTop = 0;
      setPromptScrollTop(0);
    } else {
      setPromptScrollTop(el.scrollTop);
    }
  }, [pluginInputValues, prompt, promptOverlayParts]);

  const setInputRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      inputElementRef.current = node;
      assignForwardedRef(ref, node);
    },
    [ref],
  );

  function pickPlugin(record: InstalledPluginRecord) {
    const nextPrompt = mention
      ? replaceMentionTokenWithText(prompt, mention, pluginMentionText(record))
      : prompt;
    onPickPlugin(record, nextPrompt);
  }

  function pickSkill(skill: SkillSummary) {
    const nextPrompt = mention
      ? replaceMentionTokenWithText(prompt, mention, inlineMentionToken(skill.name))
      : prompt;
    onPickSkill(skill, nextPrompt);
  }

  function pickMcp(server: McpServerConfig) {
    const nextPrompt = mention
      ? replaceMentionTokenWithText(
          prompt,
          mention,
          inlineMentionToken(server.label || server.id),
        )
      : prompt;
    onPickMcp(server, nextPrompt);
  }

  function pickConnector(connector: ConnectorDetail) {
    const nextPrompt = mention
      ? replaceMentionTokenWithText(
          prompt,
          mention,
          inlineMentionToken(connector.name),
        )
      : prompt;
    onPickConnector(connector, nextPrompt);
  }

  function updatePluginInput(name: string, value: unknown) {
    onPluginInputValuesChange({ ...pluginInputValues, [name]: value });
  }

  function handleFiles(files: File[]) {
    if (files.length === 0) return;
    onAddFiles(files);
  }

  function usePromptExample(example: string) {
    onPromptChange(example);
    setSelectedIndex(0);
    requestAnimationFrame(() => {
      const input = inputElementRef.current;
      if (!input) return;
      input.focus();
      const position = example.length;
      input.setSelectionRange(position, position);
      input.scrollTop = input.scrollHeight;
    });
  }

  function handlePaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    handleFiles(files);
  }

  function normalizeMentionSelection(input: HTMLTextAreaElement) {
    const nextSelection = mentionSafeSelection(
      input.selectionStart,
      input.selectionEnd,
      promptMentionRanges,
    );
    if (!nextSelection) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      input.setSelectionRange(nextSelection.start, nextSelection.end);
    });
  }

  function deleteMentionTokenFromKey(event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
    const input = event.currentTarget;
    if (input.selectionStart !== input.selectionEnd) return false;
    const caret = input.selectionStart;
    const range = promptMentionRanges.find((item) => (
      event.key === 'Backspace'
        ? caret > item.start && caret <= item.end
        : caret >= item.start && caret < item.end
    ));
    if (!range) return false;
    event.preventDefault();
    const nextPrompt = `${prompt.slice(0, range.start)}${prompt.slice(range.end)}`;
    onPromptChange(nextPrompt);
    requestAnimationFrame(() => {
      const nextInput = inputElementRef.current;
      if (!nextInput) return;
      nextInput.focus();
      nextInput.setSelectionRange(range.start, range.start);
    });
    return true;
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

  const showActiveContextRow =
    (showActivePluginChip && activePluginTitle) ||
    activeSkillTitle ||
    selectedPluginContexts.length > 0;

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
        className={`home-hero__input-card${dragActive ? ' is-drag-active' : ''}`}
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
          <div className="home-hero__active">
            {selectedPluginContexts.map((plugin) => (
              <span
                key={plugin.id}
                className="home-hero__active-chip home-hero__active-chip--context"
                data-testid={`home-hero-context-plugin-${plugin.id}`}
              >
                <button
                  type="button"
                  className="home-hero__active-chip-body"
                  onClick={() => onOpenPluginDetails(plugin)}
                  title={t('homeHero.pluginTitle', { title: plugin.title })}
                >
                  <span className="home-hero__active-dot" aria-hidden />
                  <span>{plugin.title}</span>
                </button>
                <button
                  type="button"
                  className="home-hero__active-clear"
                  onClick={() => onRemovePluginContext(plugin.id)}
                  aria-label={t('homeHero.removePluginAria', { title: plugin.title })}
                  title={t('homeHero.removePlugin')}
                >
                  ×
                </button>
              </span>
            ))}
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
                  <span className="home-hero__active-dot" aria-hidden />
                  <span>{activePluginTitle}</span>
                </button>
                <button
                  type="button"
                  className="home-hero__active-clear"
                  onClick={onClearActivePlugin}
                  aria-label={t('homeHero.clearActivePlugin')}
                  title={t('homeHero.clearActivePlugin')}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeSkillTitle ? (
              <span
                className="home-hero__active-chip home-hero__active-chip--skill"
                data-testid="home-hero-active-skill"
              >
                <span className="home-hero__active-dot" aria-hidden />
                <span>{t('homeHero.skillPrefix', { title: activeSkillTitle })}</span>
                <button
                  type="button"
                  className="home-hero__active-clear"
                  onClick={onClearActiveSkill}
                  aria-label={t('homeHero.clearActiveSkill')}
                  title={t('homeHero.clearActiveSkill')}
                >
                  ×
                </button>
              </span>
            ) : null}
            {contextItemCount > 0 ? (
              <span className="home-hero__context-summary">
                {t('homeHero.contextItemsResolved', { n: contextItemCount })}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="home-hero__prompt-surface">
          <div
            className={`home-hero__prompt-editor${
              promptOverlayParts ? ' home-hero__prompt-editor--highlighted' : ''
            }`}
          >
            {promptOverlayParts ? (
              <div
                className="home-hero__prompt-highlight"
                data-testid="home-hero-prompt-highlight"
                style={{ ['--home-hero-prompt-scroll' as string]: `${promptScrollTop}px` }}
              >
                <div className="home-hero__prompt-highlight-inner">
                  {promptOverlayParts.map((part, index) => (
                    part.kind === 'slot' ? (
                      part.key && footerInputNameSet.has(part.key) ? (
                        <span key={`footer-slot-${part.key}-${index}`} aria-hidden>
                          {formatPromptInputValue(fieldByName.get(part.key) ?? null, pluginInputValues[part.key], part.text, t)}
                        </span>
                      ) : (
                        <InlinePromptInput
                          key={`${part.key}-${index}`}
                          field={part.key ? fieldByName.get(part.key) ?? null : null}
                          name={part.key ?? ''}
                          value={part.key ? pluginInputValues[part.key] : undefined}
                          fallbackText={part.text}
                          filled={part.filled === true}
                          editable={Boolean(part.key && editableInputNames.has(part.key))}
                          open={part.key === openInlineInputName}
                          onOpenChange={(open) => setOpenInlineInputName(open ? part.key ?? null : null)}
                        />
                      )
                    ) : (
                      part.kind === 'mention' ? (
                        <InlineMentionToken
                          key={`${part.entity.kind}-${part.entity.id}-${index}`}
                          entity={part.entity}
                          pluginRecord={pluginByMentionId.get(part.entity.id) ?? null}
                          text={part.text}
                          onOpenPluginDetails={onOpenPluginDetails}
                        />
                      ) : (
                        <span key={`text-${index}`} aria-hidden>
                          {part.text}
                        </span>
                      )
                    )
                  ))}
                </div>
              </div>
            ) : null}
            <textarea
              ref={setInputRef}
              className="home-hero__input"
              data-testid="home-hero-input"
              value={prompt}
              spellCheck={false}
              onChange={(e) => {
                onPromptChange(e.target.value);
                setSelectedIndex(0);
              }}
              onPaste={handlePaste}
              onScroll={(event) => {
                setPromptScrollTop(event.currentTarget.scrollTop);
              }}
              onSelect={(event) => {
                normalizeMentionSelection(event.currentTarget);
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(e) => {
                if (isImeComposing(e, composingRef.current)) return;
                if (deleteMentionTokenFromKey(e)) return;
                if (pickerOpen && visiblePickerOptions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex((idx) => (idx + 1) % visiblePickerOptions.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(
                      (idx) => (idx - 1 + visiblePickerOptions.length) % visiblePickerOptions.length,
                    );
                    return;
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const selected = visiblePickerOptions[selectedIndex] ?? visiblePickerOptions[0];
                    if (selected && !selected.disabled) selected.onPick();
                    return;
                  }
                }
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.metaKey &&
                  !e.ctrlKey &&
                  !e.altKey
                ) {
                  e.preventDefault();
                  if (pickerOpen && visiblePickerOptions.length > 0) {
                    const selected = visiblePickerOptions[selectedIndex] ?? visiblePickerOptions[0];
                    if (selected && !selected.disabled) selected.onPick();
                    return;
                  }
                  if (canSubmit) onSubmit();
                }
              }}
              placeholder={placeholder}
              rows={3}
              aria-controls={pickerOpen ? 'home-hero-context-picker' : undefined}
              aria-expanded={pickerOpen}
            />
          </div>
          {openInlineInputField ? (
            <InlinePromptOptionPopover
              field={openInlineInputField}
              value={pluginInputValues[openInlineInputField.name]}
              onChange={(value) => {
                onPluginInputValuesChange({
                  ...pluginInputValues,
                  [openInlineInputField.name]: value,
                });
                if (openInlineInputField.type !== 'string') {
                  setOpenInlineInputName(null);
                }
              }}
            />
          ) : null}
          {showPluginInputsForm && remainingInputFields.length > 0 ? (
            <PluginInputsForm
              fields={remainingInputFields}
              values={pluginInputValues}
              onChange={onPluginInputValuesChange}
              onValidityChange={onPluginInputValidityChange}
            />
          ) : null}
        </div>
        {stagedFiles.length > 0 ? (
          <div className="home-hero__attachments" data-testid="home-hero-staged-files">
            {stagedFiles.map((file, index) => (
              <span
                key={homeFileKey(file, index)}
                className="home-hero__attachment-chip"
                title={`${file.name} · ${formatFileSize(file.size)}`}
              >
                <span className="home-hero__attachment-icon" aria-hidden>
                  <Icon name={isImageFile(file) ? 'image' : 'file'} size={13} />
                </span>
                <span className="home-hero__attachment-name">{file.name}</span>
                <span className="home-hero__attachment-size">
                  {formatFileSize(file.size)}
                </span>
                <button
                  type="button"
                  className="home-hero__attachment-remove"
                  onClick={() => onRemoveFile(index)}
                  aria-label={t('chat.removeAria', { name: file.name })}
                  title={t('homeHero.removeFile')}
                >
                  <Icon name="close" size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {pickerOpen ? (
          <div
            id="home-hero-context-picker"
            className="home-hero__plugin-picker"
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
                  onClick={() => onOpenPluginDetails(hoveredPlugin)}
                >
                  {t('homeHero.details')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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
            <button
              type="button"
              className="home-hero__attach"
              data-testid="home-hero-attach"
              onClick={() => {
                trackHomeChatComposerClick(analytics.track, {
                  page_name: 'home',
                  area: 'chat_composer',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
              title={t('chat.attachAria')}
              aria-label={t('chat.attachAria')}
            >
              <Icon name="attach" size={15} />
            </button>
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
          <button
            type="button"
            className="home-hero__submit"
            data-testid="home-hero-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
            title={canSubmit ? t('homeHero.run') : t('homeHero.typeSomethingToRun')}
            aria-label={t('homeHero.run')}
          >
            <Icon name="arrow-up" size={17} />
          </button>
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

      {activeExamplePlugins.length > 0 && activeChipId ? (
        <PluginPromptPresets
          chipId={activeChipId}
          plugins={activeExamplePlugins}
          activePluginId={activePluginRecord?.id ?? null}
          pendingPluginId={pendingPluginId}
          locale={locale}
          onPick={onPickExamplePlugin}
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
                <Icon name="external-link" size={14} aria-hidden />
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
      </span>
      <span className="home-hero__plugin-preset-body">
        <span className="home-hero__plugin-preset-title">
          {record.title}
        </span>
        <span className="home-hero__plugin-preset-prompt">
          {promptPreview}
        </span>
      </span>
      <Icon name={active ? 'check' : 'external-link'} size={13} aria-hidden />
    </button>
  );
}

interface ContextMention {
  start: number;
  end: number;
  query: string;
}

function assignForwardedRef<T>(forwardedRef: ForwardedRef<T>, value: T | null) {
  if (typeof forwardedRef === 'function') {
    forwardedRef(value);
    return;
  }
  if (forwardedRef) {
    forwardedRef.current = value;
  }
}

function filesFromClipboard(data: DataTransfer): File[] {
  const files: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
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

type PromptOverlayPart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'slot';
      text: string;
      key?: string;
      filled?: boolean;
    }
  | {
      kind: 'mention';
      entity: InlineMentionEntity;
      text: string;
    };

interface PromptMentionRange {
  start: number;
  end: number;
}

interface PromptHighlightPart {
  kind: 'text' | 'slot';
  text: string;
  key?: string;
  filled?: boolean;
}

const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;
const HOME_HERO_PROMPT_MAX_HEIGHT = 180;

function buildPromptHighlightParts(
  template: string | null,
  values: Record<string, unknown>,
  prompt: string,
): PromptHighlightPart[] | null {
  if (!template) return null;
  INPUT_PLACEHOLDER_PATTERN.lastIndex = 0;
  const parts: PromptHighlightPart[] = [];
  let rendered = '';
  let lastIndex = 0;
  let slotCount = 0;
  let match: RegExpExecArray | null;
  while ((match = INPUT_PLACEHOLDER_PATTERN.exec(template)) !== null) {
    const placeholder = match[0];
    const key = match[1];
    if (!key) continue;
    const literal = template.slice(lastIndex, match.index);
    if (literal) {
      parts.push({ kind: 'text', text: literal });
      rendered += literal;
    }
    const replacement = stringifyTemplateValue(values[key], placeholder);
    parts.push({
      kind: 'slot',
      key,
      text: replacement.text,
      filled: replacement.filled,
    });
    rendered += replacement.text;
    slotCount += 1;
    lastIndex = match.index + placeholder.length;
  }
  const tail = template.slice(lastIndex);
  if (tail) {
    parts.push({ kind: 'text', text: tail });
    rendered += tail;
  }
  if (slotCount === 0 || rendered !== prompt) return null;
  return parts;
}

function buildPromptOverlayParts(
  template: string | null,
  values: Record<string, unknown>,
  prompt: string,
  mentionEntities: InlineMentionEntity[],
): PromptOverlayPart[] | null {
  const templateParts = buildPromptHighlightParts(template, values, prompt);
  const baseParts: PromptOverlayPart[] = templateParts ?? [{ kind: 'text', text: prompt }];
  const withMentions = injectMentionParts(baseParts, mentionEntities);
  if (templateParts || withMentions.some((part) => part.kind === 'mention')) {
    return withMentions;
  }
  return null;
}

function injectMentionParts(
  parts: PromptOverlayPart[],
  mentionEntities: InlineMentionEntity[],
): PromptOverlayPart[] {
  return parts.flatMap((part) => {
    if (part.kind !== 'text') return [part];
    const mentionParts = buildInlineMentionParts(part.text, mentionEntities);
    return mentionParts
      ? mentionParts.map((mentionPart): PromptOverlayPart => {
          if (mentionPart.kind === 'mention') {
            return {
              kind: 'mention',
              entity: mentionPart.entity,
              text: mentionPart.text,
            };
          }
          return { kind: 'text', text: mentionPart.text };
        })
      : [part];
  });
}

function buildPromptMentionRanges(parts: PromptOverlayPart[] | null): PromptMentionRange[] {
  if (!parts) return [];
  const ranges: PromptMentionRange[] = [];
  let offset = 0;
  for (const part of parts) {
    const length = part.text.length;
    if (part.kind === 'mention') {
      ranges.push({ start: offset, end: offset + length });
    }
    offset += length;
  }
  return ranges;
}

function mentionSafeSelection(
  selectionStart: number,
  selectionEnd: number,
  ranges: PromptMentionRange[],
): PromptMentionRange | null {
  if (ranges.length === 0) return null;
  if (selectionStart === selectionEnd) {
    for (const range of ranges) {
      if (selectionStart > range.start && selectionStart < range.end) {
        const before = selectionStart - range.start;
        const after = range.end - selectionStart;
        const caret = before < after ? range.start : range.end;
        return { start: caret, end: caret };
      }
    }
    return null;
  }

  let start = selectionStart;
  let end = selectionEnd;
  for (const range of ranges) {
    const intersects = end > range.start && start < range.end;
    if (!intersects) continue;
    if (start > range.start && start < range.end) start = range.start;
    if (end > range.start && end < range.end) end = range.end;
  }
  return start === selectionStart && end === selectionEnd ? null : { start, end };
}

function pluginMentionText(record: InstalledPluginRecord): string {
  return inlineMentionToken(record.title);
}

function stringifyTemplateValue(
  value: unknown,
  placeholder: string,
): { text: string; filled: boolean } {
  if (value === undefined || value === null || value === '') {
    return { text: placeholder, filled: false };
  }
  return { text: String(value), filled: true };
}

function buildHomeMentionEntities({
  activePluginRecord,
  activeSkillId,
  activeSkillTitle,
  connectorOptions,
  mcpOptions,
  pluginOptions,
  selectedPluginContexts,
  skillOptions,
}: {
  activePluginRecord: InstalledPluginRecord | null;
  activeSkillId: string | null;
  activeSkillTitle: string | null;
  connectorOptions: ConnectorDetail[];
  mcpOptions: McpServerConfig[];
  pluginOptions: InstalledPluginRecord[];
  selectedPluginContexts: InstalledPluginRecord[];
  skillOptions: SkillSummary[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
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

function InlineMentionToken({
  entity,
  pluginRecord,
  text,
  onOpenPluginDetails,
}: {
  entity: InlineMentionEntity;
  pluginRecord: InstalledPluginRecord | null;
  text: string;
  onOpenPluginDetails: (record: InstalledPluginRecord) => void;
}) {
  if (entity.kind === 'plugin' && pluginRecord) {
    return (
      <button
        type="button"
        className="home-hero__prompt-mention"
        data-plugin-id={pluginRecord.id}
        data-testid={`home-hero-prompt-plugin-${pluginRecord.id}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onOpenPluginDetails(pluginRecord)}
        title={entity.title ?? `Plugin: ${pluginRecord.title}`}
      >
        {text}
      </button>
    );
  }
  return (
    <span
      className="home-hero__prompt-mention home-hero__prompt-mention--static"
      data-mention-kind={entity.kind}
      title={entity.title ?? text}
    >
      {text}
    </span>
  );
}

interface InlinePromptInputProps {
  field: InputFieldSpec | null;
  name: string;
  value: unknown;
  fallbackText: string;
  filled: boolean;
  editable?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Render plugin-input placeholders as read-only styled spans. Earlier
// revisions used <input>/<select> here, but their CSS widths (min 8ch,
// `displayValue.length + 1` in ch units, select dropdown padding) did
// not match the proportional-font width of the corresponding substring
// in the underlying textarea — so clicking on prose text in the overlay
// landed the caret several characters off, and the misalignment grew
// with every slot on the line. A span renders the exact same glyphs as
// the textarea segment it sits on top of, so the two layouts stay in
// lock-step and clicks land where the user expects. Editing happens in
// the PluginInputsForm below.
function InlinePromptInput({
  field,
  name,
  value,
  fallbackText,
  filled,
  editable = false,
  open = false,
  onOpenChange = () => undefined,
}: InlinePromptInputProps) {
  const label = field?.label ?? name;
  const displayValue = formatPromptInputValue(field, value, fallbackText);
  // No aria-label here: the editable control with this label lives in
  // the PluginInputsForm below, and findByLabelText must resolve to one
  // element. The span is decorative — it just highlights where the
  // substituted value appears in the prompt the textarea already reads
  // out.
  const hint = filled ? `${label}: ${displayValue}` : label;
  if (editable && field) {
    return (
      <span className="home-hero__prompt-option-shell">
        <button
          type="button"
          className="home-hero__prompt-slot home-hero__prompt-slot--button"
          data-field-name={name}
          data-filled={filled ? 'true' : 'false'}
          data-testid={`home-hero-prompt-slot-${name}`}
          title={hint}
          aria-label={`${label}: ${displayValue}`}
          aria-expanded={open}
          onPointerDown={(event) => {
            event.preventDefault();
            onOpenChange(!open);
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (event.detail === 0) onOpenChange(!open);
          }}
        >
          {displayValue}
        </button>
      </span>
    );
  }
  return (
    <span
      className="home-hero__prompt-slot"
      data-field-name={name}
      data-filled={filled ? 'true' : 'false'}
      data-testid={`home-hero-prompt-slot-${name}`}
      title={hint}
      aria-hidden
    >
      {displayValue}
    </span>
  );
}

function InlinePromptOptionPopover({
  field,
  value,
  onChange,
}: {
  field: InputFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div
      className="home-hero__prompt-option-popover"
      data-testid={`home-hero-prompt-option-${field.name}`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="home-hero__prompt-option-label">{field.label ?? field.name}</span>
      {renderInlinePromptEditor(field, value, onChange)}
      {fieldPopoverNote(field) ? (
        <span
          className="home-hero__prompt-option-note"
          data-tone={fieldPopoverNoteTone(field)}
          data-testid={`home-hero-prompt-option-${field.name}-note`}
        >
          {fieldPopoverNote(field)}
        </span>
      ) : null}
    </div>
  );
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
    const hasSelectedValue = selectedValue.length > 0 && designSystemOptions.some((option) => option.title === selectedValue);
    const currentValue = hasSelectedValue ? selectedValue : designSystemOptions[0]?.title ?? '';
    return (
      <FooterSelectOption
        fieldName={field.name}
        label={label}
        value={currentValue}
        options={designSystemOptions.map((option) => ({
          value: option.title,
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
            groupedOptions.map((group) => (
              <div className="home-hero__footer-select-group" key={group.label ?? 'ungrouped'}>
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
                      onChange(option.value);
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

function renderInlinePromptEditor(
  field: InputFieldSpec,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  if (field.type === 'select' && Array.isArray(field.options)) {
    const optionLabels = optionLabelMap(field);
    return (
      <select
        className="home-hero__prompt-option-input"
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
        data-testid={`home-hero-prompt-option-${field.name}-select`}
        aria-label={field.label ?? field.name}
      >
        {field.placeholder ? <option value="">{field.placeholder}</option> : null}
        {field.options.map((option) => (
          <option key={option} value={option}>
            {optionLabels[option] ?? option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="home-hero__prompt-option-input"
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(event) => onChange(event.target.value)}
      data-testid={`home-hero-prompt-option-${field.name}-input`}
      aria-label={field.label ?? field.name}
    />
  );
}

function formatPromptInputValue(
  field: InputFieldSpec | null,
  value: unknown,
  fallbackText: string,
  t?: ReturnType<typeof useT>,
): string {
  if (value === undefined || value === null || value === '') return fallbackText;
  const raw = String(value);
  if (!field) return raw;
  return t ? footerInputValueLabel(field, raw, t) : optionLabelMap(field)[raw] ?? raw;
}

function optionLabelMap(field: InputFieldSpec): Record<string, string> {
  const labels = (field as { optionLabels?: unknown }).optionLabels;
  return labels && typeof labels === 'object' && !Array.isArray(labels)
    ? labels as Record<string, string>
    : {};
}

function fieldPopoverNote(field: InputFieldSpec): string {
  const note = (field as { popoverNote?: unknown }).popoverNote;
  return typeof note === 'string' ? note : '';
}

function fieldPopoverNoteTone(field: InputFieldSpec): string {
  const tone = (field as { popoverNoteTone?: unknown }).popoverNoteTone;
  return tone === 'warning' ? 'warning' : 'info';
}

function getContextMention(value: string): ContextMention | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(value);
  if (!match) return null;
  const prefix = match[1] ?? '';
  const query = match[2] ?? '';
  const start = match.index + prefix.length;
  return {
    start,
    end: value.length,
    query,
  };
}

function replaceMentionTokenWithText(
  value: string,
  mention: ContextMention,
  replacement: string,
): string {
  const before = value.slice(0, mention.start).trimEnd();
  const after = value.slice(mention.end).trimStart();
  return [before, replacement.trim(), after].filter(Boolean).join(' ').trim();
}

function isImeComposing(event: ReactKeyboardEvent<HTMLTextAreaElement>, composing: boolean): boolean {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { keyCode?: number };
  return composing || nativeEvent.isComposing || nativeEvent.keyCode === 229;
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
    .filter((plugin) => pluginMatchesExampleChip(plugin, chipId))
    .filter((plugin) => Boolean(pluginPresetQuery(plugin, locale)))
    .sort((a, b) => pluginPresetRank(b, chipId) - pluginPresetRank(a, chipId))
    .slice(0, 18);
  if (chipId === 'image') {
    return movePluginPresetToEnd(presets, 'example-hatch-pet');
  }
  return presets;
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
