// Lovart-style centered hero for the entry Home view.
//
// The prompt textarea is the canonical creation surface: the user
// either types freely or selects a plugin below to load an example
// query, then presses Run / Enter to spawn a project. The hero is
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
import { useT } from '../i18n';

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
  footerInputNames?: string[];
  designSystemOptions?: HomeHeroDesignSystemOption[];
  showPluginInputsForm?: boolean;
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
  onPickSkill?: (skill: SkillSummary, nextPrompt: string | null) => void;
  onPickMcp?: (server: McpServerConfig, nextPrompt: string) => void;
  onPickConnector?: (connector: ConnectorDetail, nextPrompt: string) => void;
  onPickChip: (chip: HomeHeroChip) => void;
  // Manus-style example-prompt suggestions. Each entry carries both
  // the source plugin (we still dispatch the existing
  // `requestPluginContextUse(record, 'use-with-query')` path on click)
  // and a pre-resolved, locale-aware preview of the prompt the
  // textarea will receive, so the card body shows the actual sentence
  // the user is about to send. HomeView decides the slice (matching
  // the active chip), how many, and whether the panel should be
  // visible (chip selected + not dismissed). The panel stays mounted
  // either way so the accordion exit animation runs on close.
  exampleSuggestions?: ExampleSuggestion[];
  showExamples?: boolean;
  onPickExample?: (record: InstalledPluginRecord) => void;
  onDismissExamples?: () => void;
  contextItemCount: number;
  error: string | null;
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
    footerInputNames = [],
    designSystemOptions = [],
    showPluginInputsForm = true,
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
    onPickSkill = () => undefined,
    onPickMcp = () => undefined,
    onPickConnector = () => undefined,
    onPickChip,
    exampleSuggestions = [],
    showExamples = false,
    onPickExample = () => undefined,
    onDismissExamples = () => undefined,
    contextItemCount,
    error,
  },
  ref,
) {
  const t = useT();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionTab, setMentionTab] = useState<HomeMentionTab>('all');
  const [hoveredPlugin, setHoveredPlugin] = useState<InstalledPluginRecord | null>(null);
  const [promptScrollTop, setPromptScrollTop] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [openInlineInputName, setOpenInlineInputName] = useState<string | null>(null);
  const composingRef = useRef(false);
  const inputElementRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  // Filter out inputs whose values are already shown (and editable
  // by clicking into the textarea or the inline pill) inline in the
  // prompt template. Otherwise the structured form below duplicates
  // every slot pill above it — five identical labelled inputs for a
  // plugin like Prototype, which made the chat box look like it had
  // grown a second composer. Keep the form for plugin inputs that
  // are NOT in the template (e.g. a "Run in background" toggle that
  // never appears in the prompt text).
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
  const remainingInputFields = useMemo(
    () => pluginInputFields.filter((field) => !templateFieldKeys.has(field.name) && !footerInputNameSet.has(field.name)),
    [footerInputNameSet, pluginInputFields, templateFieldKeys],
  );
  const footerInputFields = useMemo(
    () => footerInputNames
      .map((name) => fieldByName.get(name))
      .filter((field): field is InputFieldSpec => Boolean(field)),
    [fieldByName, footerInputNames],
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
    setPromptScrollTop(inputElementRef.current?.scrollTop ?? 0);
  }, [prompt, promptOverlayParts]);

  // Auto-grow the prompt textarea so the chat box height tracks the
  // number of lines the user has typed. We never scroll the textarea
  // internally (CSS sets `overflow: hidden` and `resize: none`), so
  // the only height source of truth is `scrollHeight`. Resetting to
  // `auto` before measuring forces the browser to recompute against
  // the actual content, otherwise shrinking the prompt would leave
  // the textarea stuck at its previous taller size.
  useLayoutEffect(() => {
    const el = inputElementRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
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

  function handlePaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    handleFiles(files);
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
    !activeChipId &&
    (activePluginTitle || activeSkillTitle || selectedPluginContexts.length > 0);

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
        {t('homeHero.subtitlePrefix')} <kbd>Enter</kbd>.
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
            {activePluginTitle ? (
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
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(e) => {
                if (isImeComposing(e, composingRef.current)) return;
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
              onClick={() => fileInputRef.current?.click()}
              title={t('chat.attachAria')}
              aria-label={t('chat.attachAria')}
            >
              <Icon name="attach" size={19} />
            </button>
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
            <Icon name="arrow-up" size={22} />
          </button>
        </div>
      </div>

      <div
        className="home-hero__rail"
        role="toolbar"
        aria-label={t('homeHero.railAria')}
        data-testid="home-hero-rail"
      >
        <RailGroup
          group="create"
          activeChipId={activeChipId}
          pendingChipId={pendingChipId}
          pendingPluginId={pendingPluginId}
          pluginsLoading={pluginsLoading}
          onPickChip={onPickChip}
        />
        <span className="home-hero__rail-divider" aria-hidden />
        <RailGroup
          group="migrate"
          activeChipId={activeChipId}
          pendingChipId={pendingChipId}
          pendingPluginId={pendingPluginId}
          pluginsLoading={pluginsLoading}
          onPickChip={onPickChip}
        />
      </div>

      {/* Always render the panel; toggle visibility via accordion class
          so the exit animation runs on dismiss/chip-change. Hidden
          when no chip is picked or when the user closed it for the
          current chip. */}
      <ExamplePromptPanel
        suggestions={exampleSuggestions}
        open={showExamples}
        onPick={onPickExample}
        onDismiss={onDismissExamples}
        disabled={pluginsLoading || pendingPluginId !== null}
      />

      {error ? (
        <div role="alert" className="home-hero__error">
          {error}
        </div>
      ) : null}
    </section>
  );
});

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

interface PromptHighlightPart {
  kind: 'text' | 'slot';
  text: string;
  key?: string;
  filled?: boolean;
}

const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;

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
        <span>{t('newproj.toggleSpeakerNotes')}</span>
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
          label: option.isDefault ? `${option.title} (Default)` : option.title,
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
                {visibleOptions.length} available
              </div>
            </div>
          ) : null}
          {groupedOptions.length === 0 ? (
            <div className="home-hero__footer-select-empty">No matches</div>
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
  preview?: {
    title: string;
    swatches?: string[];
    logoUrl?: string;
  };
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
      <Icon name={name} size={compact ? 11 : 13} />
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
      return t('newproj.designSystem');
    case 'fidelity':
      return t('newproj.fidelityLabel');
    case 'speakerNotes':
      return t('newproj.toggleSpeakerNotes');
    case 'model':
      return t('newproj.modelLabel');
    case 'ratio':
      return '比例';
    case 'duration':
      return '时长';
    case 'resolution':
      return '分辨率';
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
    return footerSpeakerNotesEnabled(value) ? t('newproj.toggleSpeakerNotes') : '无演讲备注';
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

// Each suggestion carries both the source plugin (so click can route
// through the same `requestPluginContextUse(record, 'use-with-query')`
// path the plugin card menu uses) and a pre-rendered, locale-aware
// preview the card displays. HomeView resolves the preview through
// the same renderer it'd use on submit, so the card body is exactly
// the sentence the user is about to send.
export interface ExampleSuggestion {
  plugin: InstalledPluginRecord;
  preview: string;
}

interface ExamplePromptPanelProps {
  suggestions: ExampleSuggestion[];
  open: boolean;
  onPick: (record: InstalledPluginRecord) => void;
  onDismiss: () => void;
  disabled: boolean;
}

// Manus-style suggestion panel. Sits below the composer card + migrate
// rail and surfaces 3-4 representative `useCase.query` previews as
// content-bearing cards (not chip pills). The panel stays mounted so
// the accordion exit animation runs on dismiss; `.accordion-collapsible
// .open` toggles visibility per the shared motion contract in
// `apps/web/src/index.css`. A small close button hides the panel for
// the current chip; switching chips re-arms it (state lives in
// HomeView).
function ExamplePromptPanel({
  suggestions,
  open,
  onPick,
  onDismiss,
  disabled,
}: ExamplePromptPanelProps) {
  const hasContent = suggestions.length > 0;
  const isOpen = open && hasContent;
  return (
    <div
      className={`home-hero__examples accordion-collapsible${isOpen ? ' open' : ''}`}
      aria-hidden={isOpen ? undefined : true}
      data-testid="home-hero-example-prompts"
    >
      <div className="accordion-collapsible-inner">
        <section className="home-hero__examples-panel">
          <header className="home-hero__examples-head">
            <span className="home-hero__examples-title">Example prompts</span>
            <button
              type="button"
              className="home-hero__examples-close"
              onClick={onDismiss}
              aria-label="Dismiss example prompts"
              data-testid="home-hero-example-dismiss"
              disabled={disabled || !isOpen}
            >
              <Icon name="close" size={12} />
            </button>
          </header>
          <div className="home-hero__examples-grid" role="list">
            {suggestions.map(({ plugin, preview }) => (
              <button
                key={plugin.id}
                type="button"
                role="listitem"
                className="home-hero__example-card"
                data-testid={`home-hero-example-${plugin.id}`}
                onClick={() => onPick(plugin)}
                disabled={disabled || !isOpen}
                title={preview}
              >
                <span className="home-hero__example-card-body">{preview}</span>
                <Icon
                  name="arrow-up"
                  size={12}
                  className="home-hero__example-card-arrow"
                />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

interface RailGroupProps {
  group: ChipGroup;
  activeChipId: string | null;
  pendingChipId: string | null;
  pendingPluginId: string | null;
  pluginsLoading: boolean;
  onPickChip: (chip: HomeHeroChip) => void;
}

function RailGroup({
  group,
  activeChipId,
  pendingChipId,
  pendingPluginId,
  pluginsLoading,
  onPickChip,
}: RailGroupProps) {
  const t = useT();
  const chips = useMemo(() => chipsForGroup(group), [group]);
  return (
    <div
      className={`home-hero__rail-group home-hero__rail-group--${group}`}
      data-rail-group={group}
    >
      {chips.map((chip) => {
        const isActive = activeChipId === chip.id;
        const isPending = pendingChipId === chip.id;
        const cls = ['home-hero__rail-chip', `home-hero__rail-chip--${group}`];
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
            aria-pressed={isActive}
            aria-selected={isActive}
            title={homeHeroChipTitle(chip, t)}
          >
            <Icon name={chip.icon} size={14} className="home-hero__rail-chip-icon" />
            <span className="home-hero__rail-chip-label">{homeHeroChipLabel(chip.id, t)}</span>
          </button>
        );
      })}
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
    case 'folder': return t('homeHero.chip.folder');
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
    case 'folder': return t('homeHero.chip.folderHint');
    case 'template': return t('homeHero.chip.templateHint');
    default: return homeHeroChipLabel(chip.id, t);
  }
}
