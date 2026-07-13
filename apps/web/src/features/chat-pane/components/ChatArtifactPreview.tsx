import { Icon } from '../../../components/Icon';
import { isRenderableSketchJson, SketchPreview } from '../../../components/SketchPreview';
import type { ProjectFile } from '../../../types';
import { chatArtifactIcon, chatArtifactShortKind } from '../rules';

export function ChatArtifactFallback({ kind }: { kind: ProjectFile['kind'] }) {
  return (
    <span className="chat-design-artifact-fallback">
      <Icon name={chatArtifactIcon(kind)} size={28} />
      <span>{chatArtifactShortKind(kind)}</span>
    </span>
  );
}

export function ChatArtifactPreview({
  projectId,
  file,
  projectRawUrl,
}: {
  projectId: string | null;
  file: ProjectFile;
  // Threaded in rather than imported directly — see `UserMessage.tsx` for
  // why this dumb component doesn't reach into `providers/` itself.
  projectRawUrl: (projectId: string, filePath: string) => string;
}) {
  if (!projectId) {
    return <ChatArtifactFallback kind={file.kind} />;
  }

  const url = `${projectRawUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  if (isRenderableSketchJson(file)) {
    return <SketchPreview projectId={projectId} file={file} />;
  }
  if (file.kind === 'image' || file.kind === 'sketch') {
    return <img src={url} alt="" loading="lazy" />;
  }
  if (file.kind === 'html') {
    return (
      <iframe
        title={file.name}
        src={url}
        sandbox="allow-scripts allow-downloads"
        loading="lazy"
      />
    );
  }
  if (file.kind === 'video') {
    return <video src={url} muted playsInline preload="metadata" />;
  }
  return <ChatArtifactFallback kind={file.kind} />;
}
