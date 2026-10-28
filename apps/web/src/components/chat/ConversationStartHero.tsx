// The empty-conversation intro (per product: 新会话的空白区显示首页内容).
//
// A fresh conversation inside a project used to open on a blank pane. It now
// shows Home's own opening — the rotating 让我们创建… headline, its subtitle and
// postcard, and the type entry cards — built from the same pieces Home renders,
// so the two cannot drift. The project's chat composer stays the input: picking
// a type fills that composer with the type's first localized example prompt
// (not auto-sent), so whatever is sent lands in THIS conversation rather than
// creating a new project the way Home's cards do.

import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { homeHeroChipDescription, homeHeroChipPromptExamplesForLocale } from '../HomeHero';
import { homeHeroChipLabel } from '../home-hero/chip-labels';
import { orderedCreateChips, type HomeHeroChip } from '../home-hero/chips';
import { HeroPostcard } from '../home-hero/HeroPostcard';
import { RotatingTitleWord } from '../home-hero/RotatingTitleWord';
import { TypeEntryCards } from '../home-hero/TypeEntryCards';
import styles from './ConversationStartHero.module.css';

/** Mirrors HomeHero's `{word}` slot / `,` word-list contract for `homeHero.title`. */
const TITLE_WORD_SLOT = '{word}';
const TITLE_WORD_SEPARATOR = ',';

export function ConversationStartHero({ onPickPrompt, disabled = false }: {
  onPickPrompt: (prompt: string) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const chips = useMemo(
    () => orderedCreateChips().filter((chip) => chip.action.kind === 'apply-scenario'),
    [],
  );
  const template = t('homeHero.title');
  const slot = template.indexOf(TITLE_WORD_SLOT);
  const words = t('homeHero.titleWords').split(TITLE_WORD_SEPARATOR).map((word) => word.trim()).filter(Boolean);

  function pick(chip: HomeHeroChip) {
    const label = homeHeroChipLabel(chip.id, t);
    onPickPrompt(homeHeroChipPromptExamplesForLocale(chip.id, locale)[0] ?? label);
  }

  return (
    <div className={styles.root} data-testid="conversation-start-hero">
      <div className={`home-hero__heading-row ${styles.heading}`}>
        <div className="home-hero__heading-text">
          <h1
            className={`home-hero__title ${styles.title}`}
            aria-label={slot === -1 ? undefined : `${template.slice(0, slot)}${words[0] ?? ''}${template.slice(slot + TITLE_WORD_SLOT.length)}`}
          >
            {slot === -1 ? template : (
              <>
                {template.slice(0, slot)}
                <RotatingTitleWord
                  words={words}
                  pinned={null}
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
          <p className={`home-hero__subtitle ${styles.subtitle}`}>{t('homeHero.subtitle')}</p>
        </div>
        <HeroPostcard />
      </div>
      <TypeEntryCards
        chips={chips}
        disabled={disabled}
        labelFor={(id) => homeHeroChipLabel(id, t)}
        descriptionFor={(id) => homeHeroChipDescription(id, t)}
        onPick={pick}
      />
    </div>
  );
}
