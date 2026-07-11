// Feature-local hook for the plain-text viewer: loads the raw file text,
// derives a display-safe (lossless JSON pretty-print where applicable)
// rendering, and drives the copy-to-clipboard confirmation pill.
import { useEffect, useMemo, useState } from 'react';
import type { ProjectFile } from '../../../types';
import { clipboardPort, fileTextPort } from '../dependencies';
import type { ClipboardPort, FileTextPort } from '../ports';
import { formatJsonFileTextForDisplay } from '../formatters';

export interface TextFileContentController {
  text: string | null;
  displayText: string | null;
  lineCount: number;
  reloadKey: number;
  reload: () => void;
  copied: boolean;
  copy: () => Promise<void>;
}

export function useTextFileContent(
  textPort: FileTextPort,
  clipboard: ClipboardPort,
  projectId: string,
  file: ProjectFile,
): TextFileContentController {
  const [text, setText] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(null);
    let cancelled = false;
    void textPort.fetchProjectFileText(projectId, file.name).then((next) => {
      if (!cancelled) setText(next ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [textPort, projectId, file.name, file.mtime, reloadKey]);

  const displayText = useMemo(
    () => (text == null ? null : formatJsonFileTextForDisplay(file, text)),
    [file.name, file.mime, text],
  );
  const lineCount = displayText ? displayText.split('\n').length : 0;

  const copy = async () => {
    if (text == null) return;
    await clipboard.copyTextToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return { text, displayText, lineCount, reloadKey, reload: () => setReloadKey((n) => n + 1), copied, copy };
}

export function useWiredTextFileContent(
  projectId: string,
  file: ProjectFile,
): TextFileContentController {
  return useTextFileContent(fileTextPort, clipboardPort, projectId, file);
}
