// Feature-local hook for the markdown viewer's core interactive behavior:
// load/debounced-autosave the file text, view-mode toggle, the toolbar
// "Copy" action, and pasted/dropped image upload + snippet insertion.
// Mirrors `MemorySection.tsx`'s shape — one hook owning a cohesive slab of
// state, with the deps-bag pattern for cross-cutting inputs.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
} from 'react';
import type { ProjectFile } from '../../../types';
import {
  markdownFilePort as realMarkdownFilePort,
  shareLinkClipboardPort as realShareLinkClipboardPort,
} from '../dependencies';
import type { MarkdownFilePort, ShareLinkClipboardPort } from '../ports';
import {
  isMarkdownImageFile,
  markdownBaseHtml,
  markdownDirectory,
  markdownImageAlt,
  markdownRelativeProjectPath,
  mergeMarkdownSaveOptions,
  type MarkdownSaveOptions,
} from '../rules';
import type { MarkdownSaveState, MarkdownViewerMode } from '../types';

export interface MarkdownViewerDeps {
  projectId: string;
  file: ProjectFile;
  onFileSaved?: () => Promise<void> | void;
}

export interface MarkdownViewerController {
  text: string | null;
  setText: (value: string | ((current: string | null) => string | null)) => void;
  /** The rendered-but-not-yet-shiki-highlighted HTML, or `null` while `text` is loading. */
  baseHtml: string | null;
  editorRef: MutableRefObject<HTMLTextAreaElement | null>;
  mode: MarkdownViewerMode;
  setMode: (mode: MarkdownViewerMode) => void;
  downloadMenuOpen: boolean;
  setDownloadMenuOpen: (updater: boolean | ((current: boolean) => boolean)) => void;
  copied: boolean;
  copy: () => Promise<void>;
  saveState: MarkdownSaveState;
  savedAt: number | null;
  saveMarkdownText: (value: string, options?: MarkdownSaveOptions) => void;
  insertTextAtSelection: (insert: string) => void;
  insertImageFiles: (files: File[]) => Promise<boolean>;
  handleEditorPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  handleEditorDrop: (event: ReactDragEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;
  isError: boolean;
  exportTitle: string;
}

export function useMarkdownViewer(
  filePort: MarkdownFilePort,
  clipboardPort: ShareLinkClipboardPort,
  deps: MarkdownViewerDeps,
): MarkdownViewerController {
  const { projectId, file, onFileSaved } = deps;

  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [mode, setMode] = useState<MarkdownViewerMode>('split');
  const [saveState, setSaveState] = useState<MarkdownSaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, bumpSavedRevision] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveAfterFlightRef = useRef<MarkdownSaveOptions | null>(null);
  const textRef = useRef('');
  const lastSavedTextRef = useRef<string | null>(null);
  const loadedFileKeyRef = useRef<string | null>(null);
  const markdownFileKey = `${projectId}::${file.name}`;
  const status = file.artifactManifest?.status ?? 'complete';
  const isStreaming = status === 'streaming';
  const isError = status === 'error';
  const exportTitle = file.name.replace(/\.mdx?$/i, '') || file.name;

  useEffect(() => {
    const sameLoadedFile = loadedFileKeyRef.current === markdownFileKey;
    if (
      sameLoadedFile &&
      lastSavedTextRef.current !== null &&
      textRef.current !== lastSavedTextRef.current
    ) {
      return undefined;
    }
    if (!sameLoadedFile) setText(null);
    let cancelled = false;
    void filePort.fetchProjectFileText(projectId, file.name).then((next) => {
      if (cancelled) return;
      if (
        loadedFileKeyRef.current === markdownFileKey &&
        lastSavedTextRef.current !== null &&
        textRef.current !== lastSavedTextRef.current
      ) {
        return;
      }
      const loaded = next ?? '';
      if (
        sameLoadedFile &&
        lastSavedTextRef.current !== null &&
        textRef.current === lastSavedTextRef.current &&
        loaded === lastSavedTextRef.current
      ) {
        loadedFileKeyRef.current = markdownFileKey;
        pendingSaveAfterFlightRef.current = null;
        setSaveState((current) => current === 'saved' ? current : 'idle');
        return;
      }
      textRef.current = loaded;
      lastSavedTextRef.current = loaded;
      loadedFileKeyRef.current = markdownFileKey;
      pendingSaveAfterFlightRef.current = null;
      setSaveState('idle');
      setText(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [filePort, projectId, file.name, file.mtime, markdownFileKey]);

  const saveMarkdownText = useCallback(
    (value: string, options: MarkdownSaveOptions = {}) => {
      const run = async (nextValue: string, saveOptions: MarkdownSaveOptions): Promise<void> => {
        if (lastSavedTextRef.current === nextValue) {
          const showSaving = saveOptions.showSaving !== false;
          if (textRef.current === nextValue) setSaveState(showSaving ? 'saved' : 'idle');
          if (saveOptions.refreshFiles !== false && onFileSaved) {
            void Promise.resolve(onFileSaved()).catch(() => undefined);
          }
          return;
        }
        if (saveInFlightRef.current) {
          pendingSaveAfterFlightRef.current = pendingSaveAfterFlightRef.current
            ? mergeMarkdownSaveOptions(pendingSaveAfterFlightRef.current, saveOptions)
            : saveOptions;
          return;
        }
        saveInFlightRef.current = true;
        const showSaving = saveOptions.showSaving !== false;
        if (showSaving) setSaveState('saving');
        try {
          const saved = await filePort.writeProjectTextFile(projectId, file.name, nextValue);
          if (!saved) throw new Error('write failed');
          lastSavedTextRef.current = nextValue;
          bumpSavedRevision((n) => n + 1);
          setSavedAt(Date.now());
          if (textRef.current === nextValue) setSaveState(showSaving ? 'saved' : 'idle');
          if (saveOptions.refreshFiles !== false && onFileSaved) {
            void Promise.resolve(onFileSaved()).catch(() => undefined);
          }
        } catch {
          if (textRef.current === nextValue) setSaveState('error');
        } finally {
          saveInFlightRef.current = false;
          const pending = pendingSaveAfterFlightRef.current;
          if (pending) {
            pendingSaveAfterFlightRef.current = null;
            const latest = textRef.current;
            if (latest !== lastSavedTextRef.current) {
              void run(latest, pending);
            } else {
              const showPendingSaving = pending.showSaving !== false;
              if (textRef.current === latest) setSaveState(showPendingSaving ? 'saved' : 'idle');
              if (pending.refreshFiles !== false && onFileSaved) {
                void Promise.resolve(onFileSaved()).catch(() => undefined);
              }
            }
          }
        }
      };
      void run(value, options);
    },
    [file.name, filePort, onFileSaved, projectId],
  );

  const flushPendingMarkdownSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const latest = textRef.current;
    if (lastSavedTextRef.current !== null && latest !== lastSavedTextRef.current) {
      saveMarkdownText(latest, { refreshFiles: false, showSaving: false });
    }
  }, [saveMarkdownText]);

  useEffect(() => {
    return () => {
      flushPendingMarkdownSave();
    };
  }, [flushPendingMarkdownSave]);

  useEffect(() => {
    if (text === null) return undefined;
    textRef.current = text;
    if (text === lastSavedTextRef.current) return undefined;
    setSaveState((current) => current === 'saved' ? 'idle' : current);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveMarkdownText(textRef.current, { refreshFiles: false, showSaving: false });
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [saveMarkdownText, text]);

  const copy = useCallback(async () => {
    if (text == null) return;
    const didCopy = await clipboardPort.copyToClipboard(text);
    if (didCopy) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [clipboardPort, text]);

  const insertTextAtSelection = useCallback((insert: string) => {
    setText((current) => {
      if (current === null) return current;
      const editor = editorRef.current;
      if (!editor) return `${current}${insert}`;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
      requestAnimationFrame(() => {
        const nextCursor = start + insert.length;
        editor.focus();
        editor.setSelectionRange(nextCursor, nextCursor);
      });
      return next;
    });
  }, []);

  const insertImageFiles = useCallback(
    async (files: File[]): Promise<boolean> => {
      const images = files.filter((item) => isMarkdownImageFile(item));
      if (images.length === 0) return false;
      const targetDir = markdownDirectory(file.name);
      const result = await filePort.uploadProjectFiles(projectId, images, targetDir);
      if (result.uploaded.length > 0) {
        await onFileSaved?.();
        const snippet = result.uploaded
          .map((item) => {
            const alt = markdownImageAlt(item.name);
            const path = markdownRelativeProjectPath(file.name, item.path);
            return `![${alt}](${path})`;
          })
          .join('\n');
        insertTextAtSelection(`\n${snippet}\n`);
      }
      return true;
    },
    [file.name, filePort, insertTextAtSelection, onFileSaved, projectId],
  );

  const handleEditorPaste = useCallback((event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (!files.some(isMarkdownImageFile)) return;
    event.preventDefault();
    void insertImageFiles(files);
  }, [insertImageFiles]);

  const handleEditorDrop = useCallback((event: ReactDragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.some(isMarkdownImageFile)) return;
    event.preventDefault();
    void insertImageFiles(files);
  }, [insertImageFiles]);

  const baseHtml = useMemo(
    () => (text === null ? null : markdownBaseHtml(text, projectId, file.name)),
    [file.name, projectId, text],
  );

  return {
    text,
    setText,
    baseHtml,
    editorRef,
    mode,
    setMode,
    downloadMenuOpen,
    setDownloadMenuOpen,
    copied,
    copy,
    saveState,
    savedAt,
    saveMarkdownText,
    insertTextAtSelection,
    insertImageFiles,
    handleEditorPaste,
    handleEditorDrop,
    isStreaming,
    isError,
    exportTitle,
  };
}

export function useWiredMarkdownViewer(deps: MarkdownViewerDeps): MarkdownViewerController {
  return useMarkdownViewer(realMarkdownFilePort, realShareLinkClipboardPort, deps);
}
