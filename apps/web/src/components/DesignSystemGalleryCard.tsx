import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { VisuallyHidden } from '@open-design/components';
import { workspaceResourceReadIdentityKey, workspaceResourceUrl, type WorkspaceResourceReadIdentity } from '../collab/workspace-identity';
import { useI18n } from '../i18n';
import type { DesignSystemSummary } from '../types';
import { Icon } from './Icon';
import { DesignSystemLogo } from './DesignSystemLogo';
import { isUserSystem } from './design-system-metadata';
import styles from './DesignSystemsTab.module.css';

interface Props {
  system: DesignSystemSummary;
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
  enabled: boolean;
  isDefault: boolean;
  subtitle: string;
  statusLabel: string;
  busy: boolean;
  onSelect: () => void;
  onMakeDefault: () => void;
}

/** The catalog keeps only visible showcase documents alive, regardless of size. */
export function DesignSystemGalleryCard({
  system, resourceReadIdentity, enabled, isDefault, subtitle, statusLabel, busy,
  onSelect, onMakeDefault,
}: Props) {
  const { t } = useI18n();
  const coverRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const [inView, setInView] = useState(false);
  const [scale, setScale] = useState(0.28);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const cover = coverRef.current;
    if (!cover || !enabled) {
      setInView(false);
      setMenuPosition(null);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)));
    observer.observe(cover);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    const cover = coverRef.current;
    if (!cover) return;
    const resize = () => {
      if (cover.clientWidth) setScale(cover.clientWidth / 1000);
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize);
    observer.observe(cover);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuPosition) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setMenuPosition(null);
      }
    };
    const close = () => setMenuPosition(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuPosition]);

  return (
    <article className={styles.galleryCard} data-testid={`design-system-gallery-card-${system.id}`}>
      <button type="button" className={styles.galleryCardButton}
        data-testid={`design-system-card-${system.id}`} data-system-id={system.id}
        onClick={onSelect}>
        <span ref={coverRef} className={styles.galleryCover} aria-hidden>
          {enabled && inView ? (
            <iframe key={`${workspaceResourceReadIdentityKey(resourceReadIdentity)}:${system.updatedAt ?? ''}`}
              title={`${system.title} preview`} tabIndex={-1} aria-hidden
              sandbox="allow-scripts" loading="lazy" className={styles.galleryFrame}
              style={{ transform: `scale(${scale})` }}
              src={workspaceResourceUrl(`/api/design-systems/${encodeURIComponent(system.id)}/showcase`, resourceReadIdentity?.context ?? null)} />
          ) : <span className={`${styles.skeletonBlock} ${styles.galleryCoverSkeleton}`} />}
        </span>
        <span className={styles.galleryCardLabel}>
          <DesignSystemLogo system={system} resourceReadIdentity={resourceReadIdentity} enabled={enabled && inView} />
          <span className={styles.galleryCardName}>{system.title}</span>
          {isDefault ? <span className={styles.badgeDefault}>{t('dsManager.badgeDefault')}</span> : null}
          {isUserSystem(system) ? <span className={`${styles.statusDot} ${system.status === 'published' ? styles.statusDotPublished : styles.statusDotDraft}`} title={statusLabel} aria-label={statusLabel} /> : null}
        </span>
        <VisuallyHidden>{subtitle}</VisuallyHidden>
      </button>
      <button type="button" ref={triggerRef} className={styles.galleryMenuTrigger}
        aria-haspopup="menu" aria-expanded={Boolean(menuPosition)} aria-controls={menuPosition ? menuId : undefined}
        aria-label={`${t('designs.menuMore')} · ${system.title}`}
        onClick={() => {
          if (menuPosition) return setMenuPosition(null);
          const rect = triggerRef.current?.getBoundingClientRect();
          if (rect) setMenuPosition({ left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 112)) });
        }}>
        <Icon name="more-horizontal" size={20} />
      </button>
      {menuPosition ? createPortal(
        <div id={menuId} ref={menuRef} className={styles.galleryMenu} style={menuPosition} role="menu"
          aria-label={`${t('designs.menuMore')} · ${system.title}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setMenuPosition(null);
              triggerRef.current?.focus({ preventScroll: true });
            } else if (event.key === 'Tab') {
              triggerRef.current?.focus({ preventScroll: true });
              setMenuPosition(null);
            }
            else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }
          }}>
          <button type="button" role="menuitem" onClick={() => { setMenuPosition(null); onSelect(); }}>
            <Icon name="eye" size={16} />{t('ds.preview')}
          </button>
          {(!isUserSystem(system) || system.status === 'published') && !isDefault ? <button type="button" role="menuitem" disabled={busy}
            onClick={() => { setMenuPosition(null); triggerRef.current?.focus({ preventScroll: true }); onMakeDefault(); }}>
            <Icon name="check" size={16} />{t('dsManager.makeDefault')}
          </button> : null}
        </div>, document.body,
      ) : null}
    </article>
  );
}
