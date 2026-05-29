import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';

// Mirrors what apps/desktop preload exposes via contextBridge. Kept inline
// so the web bundle does not import the desktop package.
type DesktopExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

interface OpenDesignDesktopApi {
  exportDiagnostics(): Promise<DesktopExportResult>;
}

declare global {
  interface Window {
    openDesignDesktop?: OpenDesignDesktopApi;
  }
}

const DIAGNOSTICS_EXPORT_PATH = '/api/diagnostics/export';
const DIAGNOSTICS_FILENAME_PREFIX = 'open-design-diagnostics';
const STATUS_CLEAR_MS = 6000;

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

function fileNameFromHeader(header: string | null): string | null {
  if (header == null) return null;
  const match = /filename\*=UTF-8''([^;\n]+)|filename="([^"]+)"|filename=([^;\n]+)/i.exec(header);
  if (match == null) return null;
  const raw = match[1] ?? match[2] ?? match[3];
  if (raw == null) return null;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

function fallbackFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${DIAGNOSTICS_FILENAME_PREFIX}-${stamp}.zip`;
}

async function exportViaHttp(): Promise<{ filename: string }> {
  const res = await fetch(DIAGNOSTICS_EXPORT_PATH, { credentials: 'same-origin' });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // ignore body parse errors
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const filename = fileNameFromHeader(res.headers.get('content-disposition')) ?? fallbackFilename();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { filename };
}

/**
 * Designed for the Settings → About panel. Renders a labeled button with a
 * short status line below it. Works in both the Electron shell (uses native
 * save dialog via window.openDesignDesktop) and the browser (triggers a
 * browser download via the daemon HTTP endpoint).
 */
export function ExportDiagnosticsRow() {
  const t = useT();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (clearTimer.current != null) clearTimeout(clearTimer.current);
  }, []);

  const scheduleClear = () => {
    if (clearTimer.current != null) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setStatus({ kind: 'idle' }), STATUS_CLEAR_MS);
  };

  const handleClick = async () => {
    if (status.kind === 'busy') return;
    setStatus({ kind: 'busy' });
    try {
      if (window.openDesignDesktop != null) {
        const result = await window.openDesignDesktop.exportDiagnostics();
        if (result.ok) {
          setStatus({ kind: 'success', message: t('diagnostics.exportSuccess').replace('{path}', result.path) });
          scheduleClear();
          return;
        }
        if (result.cancelled) {
          setStatus({ kind: 'idle' });
          return;
        }
        setStatus({ kind: 'error', message: t('diagnostics.exportFailed').replace('{message}', result.message) });
        scheduleClear();
        return;
      }
      const { filename } = await exportViaHttp();
      setStatus({ kind: 'success', message: t('diagnostics.exportSuccess').replace('{path}', filename) });
      scheduleClear();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ kind: 'error', message: t('diagnostics.exportFailed').replace('{message}', message) });
      scheduleClear();
    }
  };

  const busy = status.kind === 'busy';
  return (
    <div className="diagnostics-export-row">
      <button
        type="button"
        className="ghost diagnostics-export-button"
        onClick={() => void handleClick()}
        disabled={busy}
        data-status={status.kind}
      >
        <Icon name="download" size={14} />
        <span>{busy ? t('diagnostics.exporting') : t('diagnostics.exportButton')}</span>
      </button>
      {status.kind === 'success' || status.kind === 'error' ? (
        <p className={`diagnostics-export-status ${status.kind}`} role="status">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
