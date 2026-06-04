import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { popoverIn, staggerContainer, listItem } from '../motion';
import { LOCALE_LABEL, LOCALES, useI18n, type Locale } from '../i18n';
import { Icon } from './Icon';

/**
 * Compact language switcher rendered as a foot-pill in the entry view's
 * lower-left corner. Mirrors the "Local CLI · agent" pill so it doesn't
 * fight for visual weight, but remains discoverable for first-time users
 * who'd rather not dig into the settings dialog just to swap languages.
 */
export function LanguageMenu() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lang-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="foot-pill lang-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={LOCALE_LABEL[locale]}
      >
        <Icon name="languages" size={12} />
        <span>{LOCALE_LABEL[locale]}</span>
        <Icon name="chevron-down" size={11} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="lang-menu-popover"
            role="menu"
            variants={popoverIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              style={{ display: 'contents' }}
            >
              {LOCALES.map((code) => {
                const active = locale === code;
                return (
                  <motion.button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`lang-menu-item${active ? ' active' : ''}`}
                    onClick={() => {
                      setLocale(code as Locale);
                      setOpen(false);
                    }}
                    variants={listItem}
                  >
                    <span className="lang-menu-label">{LOCALE_LABEL[code]}</span>
                    <span className="lang-menu-code">{code}</span>
                    {active ? (
                      <span className="lang-menu-check" aria-hidden>
                        <Icon name="check" size={12} />
                      </span>
                    ) : null}
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
