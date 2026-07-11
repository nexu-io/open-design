// Presentational half of the design-system section preview: an HTML file
// renders in a sandboxed iframe (srcDoc once assets are inlined, direct URL
// until then); any other kind renders as an <img>. Moved verbatim out of
// `components/FileWorkspace.tsx` as part of the ADR-0002 vertical-slice
// decomposition.
import type { ProjectFile } from '../../../types';
import type { DesignSystemInlinePreviewController } from '../hooks/useDesignSystemInlinePreview.hooks';

export function DesignSystemInlinePreviewView({
  file,
  url,
  srcDoc,
  srcDocReady,
}: DesignSystemInlinePreviewController & { file: ProjectFile }) {
  if (file.kind === 'html') {
    return (
      <iframe
        title={file.name}
        src={srcDocReady && srcDoc ? undefined : url}
        srcDoc={srcDoc ?? undefined}
        sandbox="allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox"
      />
    );
  }
  return <img src={`${url}?v=${Math.round(file.mtime)}`} alt={file.name} />;
}
