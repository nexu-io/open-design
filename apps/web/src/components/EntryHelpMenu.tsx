// Help launcher anchored to the bottom of the entry nav rail.
//
// Mirrors the Lovart-style "?" affordance shown in the bottom-left
// corner of the workspace: a single round button that opens a small
// popover with the four external help links we want every user to be
// one click away from — GitHub issues for help, GitHub PRs for feature
// requests, releases for the changelog, and the desktop download.
//
// The links open in a new tab (with safe `noopener` rel) and are
// labeled via the i18n dictionary so locale switching keeps the menu
// in the user's language.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { popoverIn } from '../motion';
import { useAnalytics } from '../analytics/provider';
import {
  trackHelpPopoverClick,
  trackHelpPopoverSurfaceView,
  trackHomeNavClick,
} from '../analytics/events';
import { Icon } from './Icon';
import { useT } from '../i18n';

const REPO = 'https://github.com/nexu-io/open-design';
const ISSUES_URL = `${REPO}/issues/new`;
const PRS_URL = `${REPO}/pulls`;
const RELEASES_URL = `${REPO}/releases`;
const LATEST_RELEASE_URL = `${REPO}/releases/latest`;
const X_URL = 'https://x.com/nexudotio';
const DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';

const ext = { target: '_blank', rel: 'noreferrer noopener' } as const;

export function EntryHelpMenu() {
  const t = useT();
  const analytics = useAnalytics();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // P1 surface_view — fire once each time the help popover opens so the
  // "how often is help discovered" funnel doesn't conflate hover-clicks
  // away with intentional opens.
  useEffect(() => {
    if (!open) return;
    trackHelpPopoverSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'help_resources_popover',
    });
  }, [open, analytics.track]);

  return (
    <div className="entry-help-menu" ref={wrapRef}>
      <button
        type="button"
        className="entry-nav-rail__btn entry-help-menu__trigger"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) {
              // P0 ui_click area=nav element=help — emitted at the moment
              // the user discovers the help destination, not for every
              // closed-state click.
              trackHomeNavClick(analytics.track, {
                page_name: 'home',
                area: 'nav',
                element: 'help',
              });
            }
            return next;
          });
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('entry.helpAria')}
        data-tooltip={t('entry.helpAria')}
        data-testid="entry-help-trigger"
      >
        <Icon name="help-circle" size={18} />
      </button>
      <AnimatePresence>
        {open ? (
        <motion.div
          className="entry-help-popover"
          role="menu"
          aria-label={t('entry.helpMenuAria')}
          variants={popoverIn}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <a
            className="entry-help-popover__item"
            href={ISSUES_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'get_help_on_github',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="comment" size={14} />
            </span>
            <span>{t('entry.helpGetHelp')}</span>
          </a>
          <a
            className="entry-help-popover__item"
            href={PRS_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'submit_a_feature_request',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="sparkles" size={14} />
            </span>
            <span>{t('entry.helpSubmitFeature')}</span>
          </a>
          <a
            className="entry-help-popover__item"
            href={LATEST_RELEASE_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'whats_new',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="bell" size={14} />
            </span>
            <span>{t('entry.helpWhatsNew')}</span>
          </a>
          <div className="entry-help-popover__divider" aria-hidden />
          <a
            className="entry-help-popover__item"
            href={RELEASES_URL}
            {...ext}
            role="menuitem"
            onClick={() => {
              trackHelpPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'help_resources_popover',
                element: 'download_desktop_app',
                surface: 'popover',
              });
              setOpen(false);
            }}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="download" size={14} />
            </span>
            <span>{t('entry.helpDownloadDesktop')}</span>
          </a>
          <div className="entry-help-popover__divider" aria-hidden />
          <a
            className="entry-help-popover__item"
            href={X_URL}
            {...ext}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="external-link" size={14} />
            </span>
            <span>Follow @nexudotio on X</span>
          </a>
          <a
            className="entry-help-popover__item"
            href={DISCORD_URL}
            {...ext}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="entry-help-popover__icon" aria-hidden>
              <Icon name="discord" size={14} />
            </span>
            <span>Join Discord</span>
          </a>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
