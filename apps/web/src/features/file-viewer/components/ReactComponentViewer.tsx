// Wired React component (.jsx/.tsx) viewer: binds the source/module-detection/
// srcDoc hook to its presentational view.
import type { ProjectFile } from '../../../types';
import { useWiredReactComponentViewer } from '../hooks/useReactComponentViewer.hooks';
import { ReactComponentViewerView } from './ReactComponentViewerView';

export function ReactComponentViewer({
  projectId,
  file,
  onOpenFileReplacing,
}: {
  projectId: string;
  file: ProjectFile;
  onOpenFileReplacing?: (openName: string, closeName: string) => void;
}) {
  const {
    mode,
    setMode,
    source,
    srcDoc,
    reload,
    shareMenuOpen,
    setShareMenuOpen,
    shareContainerRef,
    isModule,
    moduleEntries,
  } = useWiredReactComponentViewer(projectId, file);

  return (
    <ReactComponentViewerView
      file={file}
      mode={mode}
      onSetMode={setMode}
      source={source}
      srcDoc={srcDoc}
      onReload={reload}
      shareMenuOpen={shareMenuOpen}
      onSetShareMenuOpen={setShareMenuOpen}
      shareContainerRef={shareContainerRef}
      isModule={isModule}
      moduleEntries={moduleEntries}
      onOpenFileReplacing={onOpenFileReplacing}
    />
  );
}
