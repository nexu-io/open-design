import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildSocialSharePayload,
  OPEN_DESIGN_GITHUB_REPO_URL,
  type SocialShareRequest,
  type SocialShareResponse,
} from '@open-design/contracts';
import {
  LOCALE_LABEL,
  LOCALES,
  useI18n,
  useT,
  type Locale,
} from '../i18n';
import { createSocialSharePayload } from '../providers/registry';
import type { AppConfig, AppTheme } from '../types';
import { formatDiscordPresenceCount, useDiscordPresence } from './useDiscordPresence';
import { Icon } from './Icon';
import { SocialShareGrid } from './SocialShareGrid';

const DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';
const X_URL = 'https://x.com/nexudotio';

export type EntrySettingsSection =
  | 'execution'
  | 'media'
  | 'composio'
  | 'orbit'
  | 'integrations'
  | 'mcpClient'
  | 'language'
  | 'appearance'
  | 'notifications'
  | 'pet'
  | 'projectLocations'
  | 'library'
  | 'about'
  | 'memory'
  | 'designSystems';

const ENTRY_THEME_OPTIONS: Array<{
  value: AppTheme;
  icon: 'sun-moon' | 'sun' | 'moon';
  labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark';
}> = [
  { value: 'system', icon: 'sun-moon', labelKey: 'settings.themeSystem' },
  { value: 'light', icon: 'sun', labelKey: 'settings.themeLight' },
  { value: 'dark', icon: 'moon', labelKey: 'settings.themeDark' },
];

interface Props {
  config: AppConfig;
  onThemeChange: (theme: AppTheme) => void;
  onOpenSettings: (section?: EntrySettingsSection) => void;
  // Fired when the gear trigger is clicked. Used by the in-project header to
  // emit the `artifact_header` / `settings` ui_click; the home/entry shell
  // leaves it undefined so that context is not mislabelled as `artifact`.
  onTrackTriggerClick?: () => void;
}

export function EntrySettingsMenu({
  config,
  onThemeChange,
  onOpenSettings,
  onTrackTriggerClick,
}: Props) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const discordPresence = useDiscordPresence();
  const [open, setOpen] = useState(false);
  const [openDesignShare, setOpenDesignShare] = useState<SocialShareResponse | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const activeTheme = config.theme ?? 'system';
  const discordOnlineLabel = discordPresence
    ? t('entry.discordOnlineLabel', {
        count: formatDiscordPresenceCount(discordPresence.onlineCount),
      })
    : null;
  const openDesignShareRequest = useMemo<SocialShareRequest>(() => {
    const text = t('socialShare.openDesignText');
    return {
      kind: 'open-design-repo',
      locale,
      title: t('socialShare.openDesignTitle'),
      text,
      copyText: t('socialShare.openDesignCopyText', {
        text,
        url: OPEN_DESIGN_GITHUB_REPO_URL,
      }),
    };
  }, [locale, t]);
  const fallbackOpenDesignShare = useMemo(
    () => buildSocialSharePayload(openDesignShareRequest),
    [openDesignShareRequest],
  );

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOpenDesignShare(null);
    void createSocialSharePayload(openDesignShareRequest)
      .then((payload) => {
        if (!cancelled) setOpenDesignShare(payload);
      })
      .catch(() => {
        if (!cancelled) setOpenDesignShare(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, openDesignShareRequest]);

  return (
    <div className="entry-settings-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="settings-icon-btn od-tooltip"
        onClick={() => {
          onTrackTriggerClick?.();
          setOpen((value) => !value);
        }}
        title={t('entry.openSettingsTitle')}
        data-tooltip={t('entry.openSettingsTitle')}
        data-tooltip-placement="bottom"
        aria-label={t('entry.openSettingsAria')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="entry-settings-menu-trigger"
      >
        <Icon name="settings" size={17} />
      </button>
      {open ? (
        <div
          className="entry-settings-menu__popover"
          role="menu"
          aria-label={t('entry.openSettingsTitle')}
          data-testid="entry-settings-menu"
        >
          <section className="entry-settings-menu__section">
            <div className="entry-settings-menu__section-title">
              <Icon name="languages" size={13} />
              <span>{t('settings.language')}</span>
            </div>
            <div className="entry-settings-menu__language-grid">
              {LOCALES.map((code) => {
                const active = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`entry-settings-menu__choice${
                      active ? ' is-active' : ''
                    }`}
                    onClick={() => {
                      setLocale(code as Locale);
                      setOpen(false);
                    }}
                  >
                    <span>{LOCALE_LABEL[code]}</span>
                    {active ? <Icon name="check" size={12} /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="entry-settings-menu__section">
            <div className="entry-settings-menu__section-title">
              <Icon name="palette" size={13} />
              <span>{t('settings.appearance')}</span>
            </div>
            <div className="entry-settings-menu__theme-row">
              {ENTRY_THEME_OPTIONS.map((option) => {
                const active = activeTheme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`entry-settings-menu__theme${
                      active ? ' is-active' : ''
                    }`}
                    onClick={() => {
                      onThemeChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Icon name={option.icon} size={13} />
                    <span>{t(option.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="entry-settings-menu__section">
            <div className="entry-settings-menu__section-title">
              <Icon name="external-link" size={13} />
              <span>{t('socialShare.openDesignSection')}</span>
            </div>
            <SocialShareGrid
              share={openDesignShare ?? fallbackOpenDesignShare}
              className="entry-settings-social-share"
              onAfterShare={() => setOpen(false)}
            />
          </section>

          <div className="entry-settings-menu__divider" aria-hidden />

          <a
            className="entry-settings-menu__item"
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer noopener"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="entry-settings-menu__item-icon" aria-hidden>
              <Icon name="discord" size={14} />
            </span>
            <span>{t('entry.discordLabel')}</span>
            {discordOnlineLabel ? (
              <span className="entry-settings-menu__item-meta">
                {discordOnlineLabel}
              </span>
            ) : null}
            <Icon name="external-link" size={12} className="entry-settings-menu__item-end" />
          </a>
          <a
            className="entry-settings-menu__item"
            href={X_URL}
            target="_blank"
            rel="noreferrer noopener"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span
              className="entry-settings-menu__item-icon entry-settings-menu__x-mark"
              aria-hidden
            >
              X
            </span>
            <span>{t('entry.followXLabel')}</span>
            <Icon name="external-link" size={12} className="entry-settings-menu__item-end" />
          </a>

          <div className="entry-settings-menu__divider" aria-hidden />

          <button
            type="button"
            className="entry-settings-menu__item entry-settings-menu__item--primary"
            data-testid="entry-settings-open-details"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <span className="entry-settings-menu__item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
            <span className="entry-settings-menu__item-meta">
              {t('homeHero.details')}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
