// Wired plain-text viewer: binds the fetch/copy hook to its presentational
// view.
import type { ProjectFile } from '../../../types';
import { useWiredTextFileContent } from '../hooks/useTextFileContent.hooks';
import { TextViewerView } from './TextViewerView';

export function TextViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const { text, displayText, lineCount, copied, reload, copy } = useWiredTextFileContent(
    projectId,
    file,
  );
  return (
    <TextViewerView
      text={text}
      displayText={displayText}
      lineCount={lineCount}
      copied={copied}
      onReload={reload}
      onCopy={() => void copy()}
    />
  );
}
