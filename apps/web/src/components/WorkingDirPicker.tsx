import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Icon, type IconName } from './Icon';
import styles from './WorkingDirPicker.module.css';

interface Props {
  /**
   * Currently selected local working directory shown inline with a clear
   * button, or null to show only the "select" label (e.g. when the selection
   * is surfaced elsewhere, like the project composer's linked-dir chips).
   */
  workingDir: string | null;
  /** Most-recently-used directories, most-recent-first. */
  recentDirs: string[];
  /** Open the native folder picker. */
  onPickDirectory: () => void;
  /** Re-select a previously used directory. */
  onSelectRecent: (dir: string) => void;
  /** Clear the current selection. Only reachable when `workingDir` is set. */
  onClear?: () => void;
  /** Extra class applied to the outer wrapper, for layout by the host. */
  className?: string;
  /** Optional empty-state label for hosts that need a shorter trigger. */
  emptyLabel?: string;
  /** The selected directory no longer exists on disk — flag it in red. */
  invalid?: boolean;
  /**
   * Panel direction. `'down'` (default) suits the Home composer where there
   * is room below; `'up'` suits the in-project composer whose trigger sits at
   * the bottom of the viewport, so a downward panel would be clipped.
   */
  placement?: 'down' | 'up';
  /** Fired when the panel opens, so the host can re-validate freshness. */
  onOpen?: () => void;
  /**
   * Attach another Open Design project as context. Optional: hosts that do not
   * offer project references (or surface them elsewhere) omit it and the row
   * does not render. Lives here rather than in the composer's + menu because
   * it is the same question the folder rows answer — what does the agent get
   * to read besides this conversation.
   */
  onReferenceProject?: () => void;
  /** Attach a local code checkout as context. Optional, same reasoning. */
  onLinkLocalCode?: () => void;
  /**
   * A non-directory selection to name on the trigger when no working directory
   * is set — the project 引用其它项目 attached, or the checkout 关联本地代码
   * linked. It behaves exactly like a chosen directory (per product: 工作目录会
   * 换成后边的文件名，hover 的时候前边的 icon 会换成关闭的，和现在选择最近使用的
   * 文件夹的逻辑一样): the trigger takes its name and its glyph, and the same
   * hover × clears it. A directory wins when both exist — it is the row's
   * primary answer, and the extra picks stay visible as chips beside it.
   */
  selection?: { label: string; icon: IconName; title?: string; onClear: () => void } | null;
}

function basename(dir: string): string {
  return dir.split(/[/\\]/).filter(Boolean).pop() ?? dir;
}

/**
 * Working-directory picker: a borderless trigger that opens a panel with
 * "Choose folder" and a "Recent folders" submenu. Picking a directory grants
 * the agent read-only awareness of those local files (via the project's
 * `linkedDirs` → `--add-dir`); it does NOT import the folder into Design
 * Files. Shared by the Home composer and the in-project composer; layout is
 * left to the host via `className`.
 */
export function WorkingDirPicker({
  workingDir,
  recentDirs,
  onPickDirectory,
  onSelectRecent,
  onClear,
  className,
  emptyLabel,
  placement = 'down',
  invalid = false,
  onOpen,
  onReferenceProject,
  onLinkLocalCode,
  selection = null,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setRecentOpen(false);
      return;
    }
    function onPointer(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* One trigger, one current answer: the directory if there is one, otherwise
     whatever the last two menu rows attached. Everything downstream (label,
     glyph, tooltip, the hover ×) reads these three, so a non-directory pick
     cannot drift into a different affordance. */
  const activeLabel = workingDir ? basename(workingDir) : selection?.label ?? null;
  const activeIcon: IconName = workingDir ? 'folder-2' : selection?.icon ?? 'folder-2';
  const activeClear = workingDir ? onClear : selection?.onClear;
  /* One slot, one answer (per product: 这个条件互斥，只能去掉一个才能选其他的
     内容) — the × on the trigger is the way out, and the panel says so rather
     than silently ignoring clicks. */
  /* The single-slot rule (only the newest pick survives) lives in the HOST,
     not here: this component is only handed `selection` when there is NO
     working directory (see HomeHero's `workdirSelection`), so it can never see
     the two occupying the slot together. HomeHero holds both and enforces it. */

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap}${className ? ` ${className}` : ''}`}
      data-testid="working-dir-picker"
    >
      <div className={styles.triggerRow}>
        <button
          type="button"
          className={`${styles.trigger}${invalid ? ` ${styles.triggerInvalid}` : ''}`}
          data-testid="working-dir-trigger"
          aria-expanded={open}
          title={
            invalid
              ? t('homeWorkingDir.missing')
              : (workingDir ?? selection?.title ?? selection?.label ?? t('homeWorkingDir.hint'))
          }
          onClick={() =>
            setOpen((v) => {
              if (!v) onOpen?.();
              return !v;
            })
          }
        >
          <Icon name={activeIcon} size={16} className={styles.triggerIcon} />
          <span className={styles.triggerLabel}>
            {activeLabel ?? emptyLabel ?? t('homeWorkingDir.trigger')}
          </span>
          <Icon name="chevron-down" size={16} className={styles.triggerChevron} />
        </button>
        {/* Clear-the-directory control, overlaid on the trigger's leading
            folder glyph: with a directory chosen, hovering the row swaps the
            folder for this × (per product), and the panel's 移除工作目录 row is
            gone with it. A SIBLING of the trigger, not a child — the trigger is
            itself a <button> and buttons cannot nest — which also keeps the ×
            a real focusable control rather than a hover-only target with no
            keyboard path, now that the menu row no longer offers one. */}
        {activeLabel && activeClear ? (
          <button
            type="button"
            className={styles.triggerClear}
            data-testid="working-dir-clear"
            aria-label={t('homeWorkingDir.clear')}
            title={t('homeWorkingDir.clear')}
            onClick={() => {
              activeClear();
              setOpen(false);
            }}
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          className={`${styles.panel}${placement === 'up' ? ` ${styles.panelUp}` : ''}`}
          role="menu"
          data-testid="working-dir-panel"
        >
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            data-testid="working-dir-pick"
            onClick={() => {
              setOpen(false);
              onPickDirectory();
            }}
          >
            <Icon name="folder-2" size={14} className={styles.itemIcon} />
            <span>{workingDir ? t('homeWorkingDir.replace') : t('homeWorkingDir.pick')}</span>
          </button>

          <div
            className={styles.submenuRow}
            onMouseEnter={() => setRecentOpen(true)}
            onMouseLeave={() => setRecentOpen(false)}
          >
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              aria-haspopup="menu"
              aria-expanded={recentOpen}
              data-testid="working-dir-recent"
              onClick={() => setRecentOpen((v) => !v)}
            >
              <Icon name="history" size={14} className={styles.itemIcon} />
              <span>{t('homeWorkingDir.recent')}</span>
              <Icon name="chevron-right" size={14} className={styles.itemChevron} />
            </button>
            {recentOpen ? (
              <div
                className={`${styles.flyout}${placement === 'up' ? ` ${styles.flyoutUp}` : ''}`}
                role="menu"
                data-testid="working-dir-recent-list"
              >
                {recentDirs.length === 0 ? (
                  <div className={styles.empty}>{t('homeWorkingDir.recentEmpty')}</div>
                ) : (
                  recentDirs.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      role="menuitem"
                      className={styles.recentItem}
                      title={dir}
                      onClick={() => {
                        onSelectRecent(dir);
                        setOpen(false);
                      }}
                    >
                      <Icon name="folder-2" size={14} className={styles.itemIcon} />
                      <span className={styles.recentName}>{basename(dir)}</span>
                      <span className={styles.recentPath}>{dir}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {onReferenceProject || onLinkLocalCode ? (
            <div className={styles.divider} role="separator" />
          ) : null}
          {onReferenceProject ? (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              data-testid="working-dir-reference-project"
              onClick={() => {
                setOpen(false);
                onReferenceProject();
              }}
            >
              <Icon name="folder-transfer" size={14} className={styles.itemIcon} />
              <span>{t('chat.plus.referenceProject')}</span>
            </button>
          ) : null}
          {onLinkLocalCode ? (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              data-testid="working-dir-local-code"
              onClick={() => {
                setOpen(false);
                onLinkLocalCode();
              }}
            >
              <Icon name="file-code" size={14} className={styles.itemIcon} />
              <span>{t('chat.plus.linkLocalCode')}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
