// Import from Figma — offline `.fig` decode (or a Figma URL) → webpage.
//
// Reachable from the composer "+" menu on the homepage and in a project chat.
// A dropped/browsed `.fig` is decoded fully offline on the daemon (no Figma
// account) into a `figma/` snapshot; the modal shows the recovered inventory
// and hands the host a ready-to-send reshape prompt. A pasted Figma URL is
// delegated to the host (`onFigmaUrl`), which routes it through the existing
// od-figma-migration scenario (OAuth lives in the run pipeline).
//
// Copy is i18n-keyed; only the "+" menu entry label was keyed originally.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import type { FigmaImportResult, WorkspaceCollabContext } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { Icon } from './Icon';
import { modalOverlay, modalContent } from '../motion';
import { importProjectFigma } from '../providers/registry';
import { useI18n } from '../i18n';
import styles from './FigmaImportModal.module.css';

interface Props {
  onClose: () => void;
  /** Resolve the project to import into — an existing id (chat) or a freshly
   *  created one (homepage). Null means it couldn't be resolved. */
  resolveProjectId: () => Promise<string | null>;
  /** Exact authority of the project being imported into. Project surfaces pass
   * the persisted project scope; Home passes the context captured by create. */
  workspaceContext?: WorkspaceCollabContext | null;
  /** Fired after a successful `.fig` import with the snapshot + project id. */
  onImported: (result: FigmaImportResult, projectId: string) => void;
  /** Fired when the user submits a Figma URL instead of a file; omit to hide
   *  the URL tab. */
  onFigmaUrl?: (url: string, notes: string) => void;
}

type Mode = 'file' | 'url';
type Status = 'idle' | 'importing' | 'done' | 'error';

const FIGMA_URL_RE = /^https:\/\/(?:www\.)?figma\.com\/(?:file|design)\/[A-Za-z0-9]+/;

export function FigmaImportModal({
  onClose,
  resolveProjectId,
  workspaceContext = null,
  onImported,
  onFigmaUrl,
}: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FigmaImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'importing') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, status]);

  const pickFile = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const fig = files.find((f) => f.name.toLowerCase().endsWith('.fig'));
    if (!fig) {
      setError(t('figma.import.notFigError'));
      return;
    }
    setMode('file');
    setFile(fig);
    setError(null);
  }, []);

  const runImport = useCallback(async () => {
    if (!file) return;
    setStatus('importing');
    setError(null);
    const projectId = await resolveProjectId();
    if (!projectId) {
      setStatus('error');
      setError('Could not open a project to import into.');
      return;
    }
    const outcome = await importProjectFigma(
      projectId,
      file,
      notes ? { notes } : undefined,
      workspaceContext,
    );
    if (!outcome.ok) {
      setStatus('error');
      setError(outcome.error);
      return;
    }
    setResult(outcome.result);
    setStatus('done');
    // Hand the snapshot + prompt to the host (prefill composer / navigate).
    onImported(outcome.result, projectId);
  }, [file, notes, onImported, resolveProjectId, workspaceContext]);

  const submitUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!FIGMA_URL_RE.test(trimmed)) {
      setError('Enter a Figma file URL (https://figma.com/file/… or /design/…).');
      return;
    }
    onFigmaUrl?.(trimmed, notes.trim());
    onClose();
  }, [url, notes, onFigmaUrl, onClose]);

  const importing = status === 'importing';

  const modal = (
    <motion.div
      className={styles.backdrop}
      onClick={() => (importing ? undefined : onClose())}
      // Swallow drag/drop on the backdrop so a near-miss never makes the
      // browser navigate to (open) the dropped .fig and lose the dialog.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="presentation"
    >
      <motion.div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        // The whole dialog is a drop target (not just the inner dashed zone),
        // so dropping a .fig anywhere in the modal captures it.
        onDragOver={(e) => {
          e.preventDefault();
          if (status !== 'done') setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (status !== 'done') pickFile(Array.from(e.dataTransfer.files ?? []));
        }}
        variants={modalContent}
        initial="hidden"
        animate="visible"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label={t('figma.import.dialogAria')}
      >
        <header className={styles.head}>
          <span className={styles.headTitle}>
            <Icon name="import" size={16} /> {t('figma.import.dialogAria')}
          </span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')} disabled={importing}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {status === 'done' && result ? (
          <FigmaImportSummary result={result} />
        ) : (
          <>
            {onFigmaUrl ? (
              <div className={styles.tabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'file'}
                  className={styles.tab}
                  data-active={mode === 'file'}
                  onClick={() => setMode('file')}
                >
                  {t('figma.import.tabFile')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'url'}
                  className={styles.tab}
                  data-active={mode === 'url'}
                  onClick={() => setMode('url')}
                >
                  Figma URL
                </button>
              </div>
            ) : null}

            {mode === 'file' ? (
              <div
                className={styles.dropzone}
                data-drag={dragOver ? 'true' : 'false'}
                onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  pickFile(Array.from(e.dataTransfer.files ?? []));
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); }
                }}
              >
                <Icon name={file ? 'check' : 'upload'} size={26} className={styles.dropIcon} />
                <p className={styles.dropTitle}>
                  {file ? file.name : (<>Drop a <code>.fig</code> here, or <span className={styles.dropLink}>browse</span></>)}
                </p>
                <p className={styles.dropHint}>
                  {t('figma.import.dropHint')}
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".fig"
                  className={styles.fileInput}
                  onChange={(e) => {
                    pickFile(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
              </div>
            ) : (
              <div className={styles.urlPane}>
                <input
                  type="url"
                  className={styles.urlInput}
                  placeholder="https://figma.com/design/…"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(null); }}
                />
                <p className={styles.dropHint}>
                  {t('figma.import.urlHint')}
                </p>
              </div>
            )}

            <textarea
              className={styles.notes}
              placeholder={t('figma.import.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />

            {error ? <p className={styles.error}>{error}</p> : null}

            <footer className={styles.foot}>
              <Button variant="ghost" onClick={onClose} disabled={importing}>{t('common.cancel')}</Button>
              {mode === 'file' ? (
                <Button onClick={() => void runImport()} disabled={!file || importing}>
                  {importing ? (<><Icon name="spinner" size={14} className={styles.spin} /> {t('figma.import.decoding')}</>) : t('figma.import.submit')}
                </Button>
              ) : (
                <Button onClick={submitUrl} disabled={!url.trim()}>{t('figma.import.submit')}</Button>
              )}
            </footer>
          </>
        )}
      </motion.div>
    </motion.div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}

function FigmaImportSummary({ result }: { result: FigmaImportResult }) {
  const { t } = useI18n();
  const inv = result.inventory;
  return (
    <div className={styles.summaryPane}>
      <p className={styles.summaryLead}>
        <Icon name="check" size={15} /> {t('figma.import.importedLabel')} <strong>{result.label}</strong>
        {inv.decoded ? '' : t('figma.import.assetsOnlySuffix')}
      </p>
      <ul className={styles.summaryStats}>
        <li><strong>{inv.nodeCount}</strong> {t('figma.import.statNodes')}</li>
        <li><strong>{inv.pageCount}</strong> {t('figma.import.statPages')}</li>
        <li><strong>{inv.frameCount}</strong> {t('figma.import.statFrames')}</li>
        <li><strong>{inv.componentCount}</strong> {t('figma.import.statComponents')}</li>
        <li><strong>{inv.colors.length}</strong> {t('figma.import.statColors')}</li>
        <li><strong>{inv.fonts.length}</strong> {t('figma.import.statFonts')}</li>
        <li><strong>{inv.assetCount}</strong> {t('figma.import.statAssets')}</li>
      </ul>
      {inv.colors.length ? (
        <div className={styles.swatches} aria-label={t('figma.import.colorsAria')}>
          {inv.colors.slice(0, 16).map((c) => (
            <span key={c} className={styles.swatch} style={{ background: c }} title={c} />
          ))}
        </div>
      ) : null}
      <p className={styles.summaryFoot}>{t('figma.import.summaryFoot')}</p>
    </div>
  );
}
