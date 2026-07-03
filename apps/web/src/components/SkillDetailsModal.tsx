import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '@open-design/components';
import type { SkillDetail, SkillSummary } from '@open-design/contracts';
import { useI18n } from '../i18n';
import {
  localizeSkillDescription,
  localizeSkillName,
  localizeSkillPrompt,
} from '../i18n/content';
import { fetchSkill } from '../providers/registry';
import { Icon } from './Icon';

interface Props {
  skillId: string;
  summary?: SkillSummary | null;
  onClose: () => void;
}

export function SkillDetailsModal({ skillId, summary, onClose }: Props) {
  const { locale, t } = useI18n();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setLoadError(false);
    void fetchSkill(skillId).then((next) => {
      if (cancelled) return;
      if (!next) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setDetail(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [skillId, reloadToken]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const skill = loadError ? summary : detail ?? summary;
  const title = skill ? localizeSkillName(locale, skill) : skillId;
  const description = skill
    ? localizeSkillDescription(locale, skill) || skill.description
    : '';
  const examplePrompt = skill ? localizeSkillPrompt(locale, skill) : '';
  const triggers = skill?.triggers?.filter(Boolean) ?? [];

  const modal = (
    <Dialog
      backdropClassName="plugin-details-modal-backdrop"
      className="plugin-details-modal skill-details-modal"
      includeChromeClassName={false}
      ariaLabel={`${title} details`}
      onClose={onClose}
      closeOnEscape
      data-testid="skill-details-modal"
      data-skill-id={skillId}
    >
      <header className="plugin-details-modal__head">
        <div className="plugin-details-modal__head-titles">
          <div className="plugin-details-modal__head-row">
            <h2 className="plugin-details-modal__title">{title}</h2>
          </div>
          <div className="plugin-details-modal__meta">
            <span>{skillId}</span>
            {skill?.mode ? <span>· {skill.mode}</span> : null}
            {skill?.source ? <span>· {skill.source}</span> : null}
            {skill?.category ? <span>· {skill.category}</span> : null}
          </div>
        </div>
        <div className="plugin-details-modal__head-actions">
          <button
            ref={closeRef}
            type="button"
            className="plugin-details-modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
            title="Close (Esc)"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <div className="plugin-details-modal__body">
        {loadError ? (
          <section className="plugin-details-modal__section" role="alert">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                Couldn&apos;t load skill details
              </h3>
            </div>
            <p className="plugin-details-modal__description">
              The daemon did not return the full skill detail. Try again before using this skill.
            </p>
            <button
              type="button"
              className="plugin-details-modal__secondary"
              onClick={() => setReloadToken((current) => current + 1)}
            >
              {t('preview.retry')}
            </button>
          </section>
        ) : null}
        {loading && !skill ? (
          <section className="plugin-details-modal__section">
            <p className="plugin-details-modal__section-hint">
              {t('settings.libraryLoading')}
            </p>
          </section>
        ) : null}
        {!loadError && description ? (
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">Overview</h3>
            </div>
            <p className="plugin-details-modal__description">{description}</p>
          </section>
        ) : null}
        {!loadError && triggers.length > 0 ? (
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">Triggers</h3>
            </div>
            <div className="plugin-details-modal__chips">
              {triggers.map((trigger) => (
                <span key={trigger} className="plugin-details-modal__chip">
                  {trigger}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        {!loadError && examplePrompt ? (
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                Example prompt
              </h3>
            </div>
            <pre className="plugin-details-modal__query">{examplePrompt}</pre>
          </section>
        ) : null}
        {!loadError && detail?.body ? (
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">SKILL.md</h3>
            </div>
            <pre className="plugin-details-modal__query skill-details-modal__body">
              {detail.body}
            </pre>
          </section>
        ) : null}
      </div>

      <footer className="plugin-details-modal__foot">
        <button
          type="button"
          className="plugin-details-modal__secondary"
          onClick={onClose}
        >
          {t('common.close')}
        </button>
      </footer>
    </Dialog>
  );
  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
