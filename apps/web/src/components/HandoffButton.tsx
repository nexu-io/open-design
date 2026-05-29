// Hand-off menu in the ChatPane header — "open the design project
// folder in <local app>". Mirrors paseo's WorkspaceOpenInEditorButton:
// a single split-style button that remembers the user's last pick
// (LocalStorage) and a dropdown listing the rest. Detection runs on
// the daemon; this component just renders.

import { useEffect, useRef, useState } from 'react';
import type {
  HostEditor,
  HostEditorId,
  HostEditorsResponse,
} from '@open-design/contracts';
import { fetchHostEditors, openProjectInEditor } from '../providers/registry';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { EditorIcon } from './EditorIcon';

const PREFERRED_EDITOR_KEY = 'open-design:preferred-editor';

interface Props {
  projectId: string;
  // Optional fallback "always open in OS file manager" — falls back to the
  // existing shell.openPath bridge in case the daemon catalogue is empty
  // (highly unlikely on macOS / Win / Linux but harmless to support).
  onRequestRevealInFinder?: () => void;
}

function readPreferred(): HostEditorId | null {
  try {
    const v = window.localStorage.getItem(PREFERRED_EDITOR_KEY);
    return (v as HostEditorId) || null;
  } catch {
    return null;
  }
}

function writePreferred(id: HostEditorId): void {
  try {
    window.localStorage.setItem(PREFERRED_EDITOR_KEY, id);
  } catch {
    // ignore — quota or sandboxed
  }
}

export function HandoffButton({ projectId, onRequestRevealInFinder }: Props) {
  const t = useT();
  const [editors, setEditors] = useState<HostEditor[]>([]);
  const [platform, setPlatform] = useState<HostEditorsResponse['platform']>('unknown');
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<HostEditorId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHostEditors()
      .then((resp) => {
        if (cancelled) return;
        setEditors(resp.editors);
        setPlatform(resp.platform);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEditors([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const available = editors.filter((e) => e.available);
  const unavailable = editors.filter((e) => !e.available);
  const preferred = readPreferred();
  const primary =
    available.find((e) => e.id === preferred) ?? available[0] ?? null;
  const primaryTitle = primary
    ? t('handoff.openInTarget', { target: primary.label })
    : t('handoff.action');

  async function launch(editor: HostEditor) {
    if (!editor.available) {
      // Still try — the user might have an unprobed path (e.g. macOS
      // bundle in /Applications). The daemon will return 409 if it
      // genuinely can't find it.
    }
    setError(null);
    setBusy(editor.id);
    setOpen(false);
    writePreferred(editor.id);
    try {
      await openProjectInEditor(projectId, editor.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // Fallback: if Finder is the user's pick and the daemon spawn
      // failed, try the renderer-side reveal-in-finder bridge.
      if (editor.id === 'finder' && onRequestRevealInFinder) {
        try {
          onRequestRevealInFinder();
        } catch {
          // ignore
        }
      }
    } finally {
      setBusy(null);
    }
  }

  if (!loaded || (available.length === 0 && unavailable.length === 0)) {
    return null;
  }

  // No detected editors at all — render a Finder/Explorer/File-Manager
  // single-button fallback so the surface is never blank.
  if (available.length === 0) {
    const fallbackLabel = platform === 'win32' ? 'Explorer' : platform === 'linux' ? 'File Manager' : 'Finder';
    const fallbackId: HostEditorId =
      platform === 'win32' ? 'explorer' : platform === 'linux' ? 'file-manager' : 'finder';
    return (
      <button
        type="button"
        className="handoff-trigger handoff-trigger--solo"
        title={t('handoff.fallbackTitle', { target: fallbackLabel })}
        onClick={() => onRequestRevealInFinder?.()}
      >
        <EditorIcon editorId={fallbackId} size={20} />
        <span className="handoff-trigger-label">{fallbackLabel}</span>
      </button>
    );
  }

  return (
    <div
      className={`handoff-wrap${open ? ' open' : ''}`}
      ref={wrapRef}
      data-testid="handoff-wrap"
    >
      {/* Split control: the labeled left side launches the preferred
          editor, the right caret opens the picker. Sibling buttons
          (instead of a nested caret) so the caret has its own real
          tap target and so we don't render an invalid button-in-button. */}
      <div className="handoff-split">
        <button
          type="button"
          className="handoff-trigger"
          data-testid="handoff-trigger"
          title={primaryTitle}
          aria-label={primaryTitle}
          onClick={() => {
            if (primary && busy !== primary.id) {
              void launch(primary);
            } else {
              setOpen((v) => !v);
            }
          }}
          disabled={busy !== null}
        >
          {primary ? (
            <>
              <EditorIcon editorId={primary.id} size={20} />
              <span className="handoff-trigger-label sr-only">
                {primaryTitle}
              </span>
            </>
          ) : (
            <>
              <EditorIcon editorId="finder" size={20} />
              <span className="handoff-trigger-label sr-only">{primaryTitle}</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="handoff-caret"
          aria-label={t('handoff.chooseTargetAria')}
          data-testid="handoff-caret"
          onClick={() => setOpen((v) => !v)}
          disabled={busy !== null}
        >
          <Icon name="chevron-down" size={14} />
        </button>
      </div>
      {open ? (
        <div className="handoff-menu" role="menu" data-testid="handoff-menu">
          <div className="handoff-menu-title">{t('handoff.menuTitle')}</div>
          {available.map((editor) => (
            <button
              key={editor.id}
              type="button"
              className={`handoff-menu-item${editor.id === preferred ? ' active' : ''}`}
              role="menuitem"
              data-testid={`handoff-menu-item-${editor.id}`}
              onClick={() => void launch(editor)}
              disabled={busy === editor.id}
            >
              <EditorIcon editorId={editor.id} size={20} />
              <span>{editor.label}</span>
              {editor.id === preferred ? (
                <Icon name="check" size={12} />
              ) : null}
            </button>
          ))}
          {unavailable.length > 0 ? (
            <>
              <div className="handoff-menu-divider" />
              <div className="handoff-menu-section">{t('handoff.notInstalled')}</div>
              {unavailable.map((editor) => (
                <button
                  key={editor.id}
                  type="button"
                  className="handoff-menu-item dim"
                  role="menuitem"
                  data-testid={`handoff-menu-item-${editor.id}`}
                  onClick={() => void launch(editor)}
                  disabled={busy === editor.id}
                  title={t('handoff.notDetectedTitle', { target: editor.label })}
                >
                  <EditorIcon editorId={editor.id} size={20} />
                  <span>{editor.label}</span>
                </button>
              ))}
            </>
          ) : null}
          {error ? (
            <>
              <div className="handoff-menu-divider" />
              <div className="handoff-menu-error">{error}</div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
