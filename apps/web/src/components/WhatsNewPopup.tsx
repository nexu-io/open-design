import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Variants } from 'motion/react';

import { Icon } from './Icon';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import { fetchWhatsNew, openExternalUrl } from '../providers/registry';
import {
  localizedWhatsNewContent,
  markWhatsNewSeen,
  readLastSeenWhatsNewVersion,
  resolveWhatsNewPrompt,
} from '../lib/whats-new';
import { useAnalytics } from '../analytics/provider';
import { trackWhatsNewPopupClick, trackWhatsNewPopupSurfaceView } from '../analytics/events';
import styles from './WhatsNewPopup.module.css';

// Post-update highlights card, shown once per version on the home surface
// after the app comes back on a new version (desktop update or web reload).
// Copy/image/link come from the release feed's optional `whatsNew` block via
// /api/whats-new; without one the card falls back to generic i18n copy that
// points at the release notes.

const cardIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 8,
    transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] },
  },
};

type CardModel = {
  version: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string;
  hasReleaseNotes: boolean;
};

export function WhatsNewPopup() {
  const { t, locale } = useI18n();
  const analytics = useAnalytics();
  const [card, setCard] = useState<CardModel | null>(null);
  const surfaceTrackedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void fetchWhatsNew().then((info) => {
      if (!mounted || info == null) return;
      const decision = resolveWhatsNewPrompt(info, readLastSeenWhatsNewVersion());
      if (decision === 'baseline') {
        markWhatsNewSeen(info.version);
        return;
      }
      if (decision !== 'show') return;
      if (info.content != null) {
        const localized = localizedWhatsNewContent(info.content, locale);
        setCard({
          version: info.version,
          title: localized.title,
          body: localized.body,
          imageUrl: info.content.imageUrl ?? null,
          linkUrl: localized.linkUrl ?? info.releaseUrl,
          hasReleaseNotes: true,
        });
      } else {
        setCard({
          version: info.version,
          title: t('whatsNew.updatedTitle', { version: info.version }),
          body: t('whatsNew.genericBody'),
          imageUrl: null,
          linkUrl: info.releaseUrl,
          hasReleaseNotes: false,
        });
      }
    });
    return () => {
      mounted = false;
    };
    // The card resolves once per mount; live locale switches keep the copy it
    // resolved with rather than refetching mid-display.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (card == null || surfaceTrackedRef.current) return;
    surfaceTrackedRef.current = true;
    trackWhatsNewPopupSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'whats_new_popup',
      app_version: card.version,
      has_release_notes: card.hasReleaseNotes,
    });
  }, [analytics.track, card]);

  const dismiss = useCallback(() => {
    if (card == null) return;
    markWhatsNewSeen(card.version);
    trackWhatsNewPopupClick(analytics.track, {
      page_name: 'home',
      area: 'whats_new_popup',
      element: 'dismiss',
      action: 'dismiss',
      app_version: card.version,
    });
    setCard(null);
  }, [analytics.track, card]);

  useEffect(() => {
    if (card == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [card, dismiss]);

  const openLink = useCallback(() => {
    if (card == null) return;
    markWhatsNewSeen(card.version);
    trackWhatsNewPopupClick(analytics.track, {
      page_name: 'home',
      area: 'whats_new_popup',
      element: 'see_whats_new',
      action: 'open_link',
      app_version: card.version,
    });
    void openExternalUrl(card.linkUrl);
    setCard(null);
  }, [analytics.track, card]);

  return (
    <AnimatePresence>
      {card != null ? (
        <motion.section
          aria-labelledby="whats-new-popup-title"
          className={styles.card}
          data-testid="whats-new-popup"
          role="dialog"
          variants={cardIn}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className={styles.header}>
            <span className={styles.headerIcon} aria-hidden>
              <Icon name="info" size={15} strokeWidth={2} />
            </span>
            <h2 className={styles.title} id="whats-new-popup-title">
              {card.title}
            </h2>
            <Button
              aria-label={t('whatsNew.dismissAria')}
              className={styles.close}
              data-testid="whats-new-dismiss"
              size="icon"
              variant="ghost"
              onClick={dismiss}
            >
              <Icon name="close" size={14} strokeWidth={2} />
            </Button>
          </div>
          <div className={styles.content}>
            <p className={styles.body}>{card.body}</p>
            {card.imageUrl != null ? (
              <img alt="" className={styles.image} src={card.imageUrl} />
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button
              data-testid="whats-new-cta"
              variant="primary"
              onClick={openLink}
            >
              {t('whatsNew.cta')}
            </Button>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
