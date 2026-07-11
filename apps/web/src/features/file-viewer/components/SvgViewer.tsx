// Wired SVG viewer: binds the preview/source-toggle hook to its
// presentational view.
import type { ProjectFile } from '../../../types';
import { useWiredSvgSource } from '../hooks/useSvgSource.hooks';
import type { SvgViewerMode } from '../types';
import { SvgViewerView } from './SvgViewerView';

export interface SvgViewerProps {
  projectId: string;
  file: ProjectFile;
  initialMode?: SvgViewerMode;
  initialSource?: string | null | undefined;
}

export function SvgViewer({
  projectId,
  file,
  initialMode = 'preview',
  initialSource,
}: SvgViewerProps) {
  const { mode, setMode, source, loadingSource, sourceError, reloadKey, reload } =
    useWiredSvgSource(projectId, file.name, file.mtime, initialMode, initialSource);

  return (
    <SvgViewerView
      projectId={projectId}
      file={file}
      mode={mode}
      setMode={setMode}
      source={source}
      loadingSource={loadingSource}
      sourceError={sourceError}
      reloadKey={reloadKey}
      onReload={reload}
    />
  );
}
