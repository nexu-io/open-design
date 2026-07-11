// Feature-local hook for the React component (.jsx/.tsx) viewer: loads the
// raw source, detects whether this file is a module loaded by a sibling HTML
// entry (issue #2744 — such a file has no standalone preview), builds the
// sandboxed preview srcDoc, and drives the reload/mode/share-menu state.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ProjectFile } from '../../../types';
import { findHtmlEntriesReferencing } from '../../../runtime/jsx-module-refs';
import { buildReactComponentSrcdoc } from '../../../runtime/react-component';
import { dismissPort as realDismissPort, fileTextPort as realFileTextPort, projectFilesPort as realProjectFilesPort } from '../dependencies';
import type { DismissPort, FileTextPort, ProjectFilesPort } from '../ports';

export interface ReactComponentViewerController {
  mode: 'preview' | 'source';
  setMode: (mode: 'preview' | 'source') => void;
  source: string | null;
  srcDoc: string;
  reload: () => void;
  shareMenuOpen: boolean;
  setShareMenuOpen: (open: boolean) => void;
  shareContainerRef: MutableRefObject<HTMLDivElement | null>;
  isModule: boolean;
  moduleEntries: string[];
}

export function useReactComponentViewer(
  fileTextPort: FileTextPort,
  projectFilesPort: ProjectFilesPort,
  dismissPort: DismissPort,
  projectId: string,
  file: ProjectFile,
): ReactComponentViewerController {
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState<string | null>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareContainerRef = useRef<HTMLDivElement | null>(null);
  // HTML entries that load this file as a Babel module. `null` = still
  // checking; `[]` = standalone artifact; non-empty = a module of a
  // multi-file React prototype, which has no standalone preview.
  const [moduleEntries, setModuleEntries] = useState<string[] | null>(null);
  const isModule = (moduleEntries?.length ?? 0) > 0;

  useEffect(() => {
    setSource(null);
    let cancelled = false;
    void fileTextPort.fetchProjectFileText(projectId, file.name).then((text) => {
      if (!cancelled) setSource(text ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [fileTextPort, projectId, file.name, file.mtime, reloadKey]);

  useEffect(() => {
    setModuleEntries(null);
    let cancelled = false;
    void (async () => {
      try {
        const files = await projectFilesPort.fetchProjectFiles(projectId);
        const htmlNames = files
          .filter((entry) => /\.html?$/i.test(entry.name))
          .map((entry) => entry.name);
        const htmlSources = new Map<string, string>();
        await Promise.all(
          htmlNames.map(async (name) => {
            const text = await fileTextPort.fetchProjectFileText(projectId, name).catch(() => null);
            if (text != null) htmlSources.set(name, text);
          }),
        );
        if (cancelled) return;
        setModuleEntries(findHtmlEntriesReferencing(file.name, htmlSources));
      } catch {
        if (!cancelled) setModuleEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileTextPort, projectFilesPort, projectId, file.name, file.mtime, reloadKey]);

  useEffect(() => {
    if (!shareMenuOpen) return undefined;
    return dismissPort.subscribeOutsideDismiss(
      () => shareContainerRef.current,
      () => setShareMenuOpen(false),
    );
  }, [dismissPort, shareMenuOpen]);

  const exportTitle = useMemo(() => file.name.replace(/\.(jsx|tsx)$/i, '') || file.name, [file.name]);

  useEffect(() => {
    if (source === null || moduleEntries === null || isModule) {
      // No source yet, still checking module status, or this file is a module
      // with no standalone preview — never build the React runtime srcdoc.
      setSrcDoc('');
      return undefined;
    }

    let cancelled = false;
    const build = () => {
      const nextSrcDoc = buildReactComponentSrcdoc(source, { title: exportTitle });
      if (!cancelled) setSrcDoc(nextSrcDoc);
    };

    if (source.length > 100_000) {
      setSrcDoc('');
      const timeout = setTimeout(build, 0);
      return () => {
        cancelled = true;
        clearTimeout(timeout);
      };
    }

    build();
    return () => {
      cancelled = true;
    };
  }, [source, exportTitle, moduleEntries, isModule]);

  return {
    mode,
    setMode,
    source,
    srcDoc,
    reload: () => setReloadKey((n) => n + 1),
    shareMenuOpen,
    setShareMenuOpen,
    shareContainerRef,
    isModule,
    moduleEntries: moduleEntries ?? [],
  };
}

export function useWiredReactComponentViewer(
  projectId: string,
  file: ProjectFile,
): ReactComponentViewerController {
  return useReactComponentViewer(realFileTextPort, realProjectFilesPort, realDismissPort, projectId, file);
}
