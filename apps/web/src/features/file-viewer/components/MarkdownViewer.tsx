// Wired markdown viewer: composes the viewer/highlight/scroll-sync hooks and
// binds them to the presentational view. Public export identical to the
// pre-extraction `MarkdownViewer` in `apps/web/src/components/FileViewer.tsx`.
import { useMemo } from 'react';
import { useI18n } from '../../../i18n';
import type { ProjectFile } from '../../../types';
import { exportAsMd } from '../../../runtime/exports';
import { useWiredMarkdownHighlight } from '../hooks/useMarkdownHighlight.hooks';
import { useWiredMarkdownScrollSync } from '../hooks/useMarkdownScrollSync.hooks';
import { useWiredMarkdownViewer } from '../hooks/useMarkdownViewer.hooks';
import { markdownAutoSaveLabel, markdownAutoSaveStatus } from '../formatters';
import { MarkdownViewerView } from './MarkdownViewerView';

export function MarkdownViewer({
  projectId,
  file,
  onFileSaved,
}: {
  projectId: string;
  file: ProjectFile;
  onFileSaved?: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const viewer = useWiredMarkdownViewer({ projectId, file, onFileSaved });
  const highlight = useWiredMarkdownHighlight(viewer.baseHtml, t);
  const scrollSync = useWiredMarkdownScrollSync(viewer.mode, viewer.editorRef, viewer.text, highlight.html);

  const autoSaveStatus = markdownAutoSaveStatus(viewer.saveState, viewer.savedAt);
  const autoSaveLabel = useMemo(
    () => markdownAutoSaveLabel(autoSaveStatus, viewer.savedAt, locale, t),
    [autoSaveStatus, locale, t, viewer.savedAt],
  );

  return (
    <MarkdownViewerView
      t={t}
      isStreaming={viewer.isStreaming}
      isError={viewer.isError}
      mode={viewer.mode}
      onSetMode={viewer.setMode}
      autoSaveStatus={autoSaveStatus}
      autoSaveLabel={autoSaveLabel}
      onRetrySave={() => {
        if (viewer.text !== null) viewer.saveMarkdownText(viewer.text);
      }}
      onCopy={() => void viewer.copy()}
      copied={viewer.copied}
      text={viewer.text}
      downloadMenuOpen={viewer.downloadMenuOpen}
      onSetDownloadMenuOpen={viewer.setDownloadMenuOpen}
      onExportMd={() => {
        if (viewer.text !== null) exportAsMd(viewer.text, viewer.exportTitle);
      }}
      html={highlight.html}
      editorRef={viewer.editorRef}
      onEditorFocus={() => scrollSync.activateMarkdownScrollPane('editor')}
      onEditorChange={(value) => {
        scrollSync.activateMarkdownScrollPane('editor');
        viewer.setText(value);
      }}
      onEditorScroll={scrollSync.handleMarkdownEditorScroll}
      onEditorPaste={viewer.handleEditorPaste}
      onEditorDrop={viewer.handleEditorDrop}
      markdownPreviewPaneRef={scrollSync.markdownPreviewPaneRef}
      onPreviewActivate={() => scrollSync.activateMarkdownScrollPane('preview')}
      onPreviewScroll={scrollSync.handleMarkdownPreviewScroll}
      markdownArticleRef={highlight.markdownArticleRef}
      onMarkdownBodyClick={(event) => void highlight.handleMarkdownBodyClick(event)}
    />
  );
}
