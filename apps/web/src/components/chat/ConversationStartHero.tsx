// The empty-conversation intro (per product: 新会话的空白区显示首页内容).
//
// A fresh conversation inside a project used to open on a blank pane. It now
// shows Home's own opening — the rotating 让我们创建… headline, its subtitle and
// postcard, and the type entry cards (with Home's covers) — built from the same
// pieces Home renders, so the two cannot drift.
//
// Its states follow Home's too (per product: 所有的状态都使用首页的状态，点击后
// 也是). Picking a type is Home's mode switch: the headline pins to the type,
// the cards give way to that type's template gallery (or its example prompts),
// and the type's plugin binds to the composer without touching the draft.
// Using a template binds its plugin and seeds its prompt; Remix opens a new
// project exactly as on Home. The one deliberate difference: the project's chat
// composer stays the input, so whatever is sent lands in THIS conversation
// rather than creating a new project. Removing the plugin chip from the
// composer returns to the cards, the way clearing Home's type does.

import { useEffect, useMemo, useState } from 'react';
import { useProjectCollabContext } from '../../collab/collab-context';
import { useI18n } from '../../i18n';
import { navigate } from '../../router';
import { duplicatePluginAsProject, listPlugins } from '../../state/projects';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { buildCommunityTemplates, type TemplateDemo } from '../CommunityTemplatePreview';
import { CommunityView, communityTypeForChip } from '../CommunityView';
import { homeHeroChipDescription, homeHeroChipPromptExamplesForLocale, pluginMatchesExampleChip } from '../HomeHero';
import { homeHeroChipLabel } from '../home-hero/chip-labels';
import { HOME_TYPE_ROW_MORE_IDS, orderedCreateChips, type HomeHeroChip } from '../home-hero/chips';
import { HeroPostcard } from '../home-hero/HeroPostcard';
import { RotatingTitleWord } from '../home-hero/RotatingTitleWord';
import { TypeEntryCards } from '../home-hero/TypeEntryCards';
import { localizePluginTitle } from '../plugins-home/localization';
import styles from './ConversationStartHero.module.css';

/** Mirrors HomeHero's `{word}` slot / `,` word-list contract for `homeHero.title`. */
const TITLE_WORD_SLOT = '{word}';
const TITLE_WORD_SEPARATOR = ',';

export interface ConversationStartPluginUse {
  pluginId: string;
  /** The Home type this use belongs to — pins the headline. */
  chipId: string;
  /** `null` leaves the composer draft alone; a string replaces it. */
  draft: string | null;
  /** Names the composer's plugin chip (a type pick reads as its type). */
  label?: string;
}

export function ConversationStartHero({
  activeChipId,
  onUsePlugin,
  disabled = false,
}: {
  /** The picked Home type, or null while the type cards show. */
  activeChipId: string | null;
  /** Bind a plugin to the composer (and pin `chipId`), Home's pick semantics. */
  onUsePlugin: (use: ConversationStartPluginUse) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const { workspaceContext } = useProjectCollabContext();
  const chips = useMemo(
    () => orderedCreateChips().filter((chip) => chip.action.kind === 'apply-scenario'),
    [],
  );
  // Home's catalogue: the entry covers and the picked type's gallery both
  // project from it. `listPlugins` resolves to [] when the daemon is not up,
  // which leaves the covers on their icons and the gallery empty.
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    void listPlugins({ workspaceContext }).then((rows) => {
      if (!cancelled) setPlugins(rows);
    });
    return () => { cancelled = true; };
  }, [workspaceContext]);

  // Same derivation as HomeView's `entryTypeCovers`: the first poster-backed
  // community template of each Home type.
  const covers = useMemo(() => {
    const result: Partial<Record<string, TemplateDemo>> = {};
    for (const template of buildCommunityTemplates(plugins, locale, t, workspaceContext)) {
      if (!template.cardMedia?.poster) continue;
      for (const chipId of HOME_TYPE_ROW_MORE_IDS) {
        if (!result[chipId] && communityTypeForChip(chipId) === template.type) {
          result[chipId] = template;
        }
      }
    }
    return result;
  }, [plugins, locale, t, workspaceContext]);

  const activeChip = activeChipId ? chips.find((chip) => chip.id === activeChipId) ?? null : null;
  // Same gallery selection as HomeView: WebGL reuses Community's Prototype
  // gallery filtered to its own slice.
  const isWebglGallery = activeChipId === 'webgl';
  const galleryType = isWebglGallery ? 'Prototype' : communityTypeForChip(activeChipId);
  const galleryCatalog = useMemo(
    () => isWebglGallery ? plugins.filter((record) => pluginMatchesExampleChip(record, 'webgl')) : plugins,
    [plugins, isWebglGallery],
  );
  const promptExamples = activeChipId && !galleryType
    ? homeHeroChipPromptExamplesForLocale(activeChipId, locale)
    : [];

  const template = t('homeHero.title');
  const slot = template.indexOf(TITLE_WORD_SLOT);
  const words = t('homeHero.titleWords').split(TITLE_WORD_SEPARATOR).map((word) => word.trim()).filter(Boolean);
  // Once a type is picked the headline stops rotating and names it, the same
  // label the type's card carries.
  const pinnedWord = activeChipId ? homeHeroChipLabel(activeChipId, t) : null;

  function chipPluginId(chip: HomeHeroChip | null): string | null {
    return chip && chip.action.kind === 'apply-scenario' ? chip.action.pluginId : null;
  }

  function pickChip(chip: HomeHeroChip) {
    const pluginId = chipPluginId(chip);
    if (!pluginId) return;
    // A type is a mode switch, not a prompt: the draft stays as typed.
    onUsePlugin({ pluginId, chipId: chip.id, draft: null, label: homeHeroChipLabel(chip.id, t) });
  }

  function useExample(example: string) {
    const pluginId = chipPluginId(activeChip);
    if (!pluginId || !activeChipId) return;
    onUsePlugin({ pluginId, chipId: activeChipId, draft: example });
  }

  async function remix(templateId: string) {
    const record = plugins.find((plugin) => plugin.id === templateId);
    if (!record) return;
    try {
      const result = await duplicatePluginAsProject(record.id, {
        name: localizePluginTitle(locale, record),
      }, workspaceContext);
      navigate({
        kind: 'project',
        projectId: result.projectId,
        conversationId: result.conversationId,
        fileName: result.relPath,
      });
    } catch {
      // Home surfaces this as an inline error; the gallery's own busy state
      // clears on its timeout, so a failed remix simply leaves the page as is.
    }
  }

  const headingText = (
    <div className="home-hero__heading-text">
      <h1
        className={`home-hero__title home-hero__heading--start ${styles.title}`}
        aria-label={slot === -1 ? undefined : `${template.slice(0, slot)}${pinnedWord ?? words[0] ?? ''}${template.slice(slot + TITLE_WORD_SLOT.length)}`}
      >
        {slot === -1 ? template : (
          <>
            {template.slice(0, slot)}
            <RotatingTitleWord
              words={words}
              pinned={pinnedWord}
              colorByWord={{
                [homeHeroChipLabel('prototype', t)]: '#028BFD',
                [homeHeroChipLabel('deck', t)]: '#FB9942',
                [homeHeroChipLabel('document', t)]: '#4AC26B',
              }}
            />
            {template.slice(slot + TITLE_WORD_SLOT.length)}
          </>
        )}
      </h1>
      <p className={`home-hero__subtitle home-hero__heading--start ${styles.subtitle}`}>{t('homeHero.subtitle')}</p>
    </div>
  );

  return (
    <div className={styles.root} data-testid="conversation-start-hero" data-active-chip={activeChipId ?? undefined}>
      {activeChipId ? (
        <div className={styles.heading}>{headingText}</div>
      ) : (
        <div className={`home-hero__heading-row ${styles.heading}`}>
          {headingText}
          <HeroPostcard />
        </div>
      )}
      {activeChipId ? null : (
        <TypeEntryCards
          chips={chips}
          disabled={disabled}
          labelFor={(id) => homeHeroChipLabel(id, t)}
          descriptionFor={(id) => homeHeroChipDescription(id, t)}
          covers={covers}
          onPick={pickChip}
        />
      )}
      {activeChipId && galleryType ? (
        <CommunityView
          contentOnly
          selectedType={galleryType}
          catalog={galleryCatalog}
          onUsePrompt={(target) => onUsePlugin({
            pluginId: target.templateId,
            chipId: isWebglGallery ? 'webgl' : target.chipId,
            draft: target.prompt,
          })}
          onUsePlugin={(record, action, target) => onUsePlugin({
            pluginId: record.id,
            chipId: isWebglGallery ? 'webgl' : target.chipId,
            draft: action === 'use-with-query' ? target.prompt : null,
          })}
          onRemixTemplate={({ templateId }) => { void remix(templateId); }}
        />
      ) : null}
      {promptExamples.length > 0 ? (
        <div className="home-hero__prompt-examples" data-testid="home-hero-prompt-examples">
          <div className="home-hero__prompt-examples-grid">
            {promptExamples.map((example) => (
              <button
                key={example}
                type="button"
                className="home-hero__prompt-example"
                data-testid="home-hero-prompt-example"
                disabled={disabled}
                onClick={() => useExample(example)}
              >
                <span>{example}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
