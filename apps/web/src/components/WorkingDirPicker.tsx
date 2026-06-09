import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';
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
  placement = 'down',
  invalid = false,
  onOpen,
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
          title={invalid ? t('homeWorkingDir.missing') : (workingDir ?? t('homeWorkingDir.hint'))}
          onClick={() =>
            setOpen((v) => {
              if (!v) onOpen?.();
              return !v;
            })
          }
        >
          <Icon name="folder" size={13} className={styles.triggerIcon} />
          <span className={styles.triggerLabel}>
            {workingDir ? basename(workingDir) : t('homeWorkingDir.trigger')}
          </span>
          <Icon name="chevron-down" size={11} className={styles.triggerChevron} />
        </button>
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
            <Icon name="folder" size={14} className={styles.itemIcon} />
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
              <Icon name="chevron-right" size={12} className={styles.itemChevron} />
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
                      <Icon name="folder" size={13} className={styles.itemIcon} />
                      <span className={styles.recentName}>{basename(dir)}</span>
                      <span className={styles.recentPath}>{dir}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {workingDir && onClear ? (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              data-testid="working-dir-clear"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              <Icon name="close" size={14} className={styles.itemIcon} />
              <span>{t('homeWorkingDir.clear')}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
