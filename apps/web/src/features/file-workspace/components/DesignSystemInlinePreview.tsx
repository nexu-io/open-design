// Wired design-system section preview: binds the inline-preview hook (srcDoc
// fetch + asset inlining) to its presentational view. Thin by design — the
// fetch/inline state machine lives in `useDesignSystemInlinePreview`, the
// markup in `DesignSystemInlinePreviewView`, so each is tested in isolation.
import type { ProjectFile } from '../../../types';
import { useWiredDesignSystemInlinePreview } from '../hooks/useDesignSystemInlinePreview.hooks';
import { DesignSystemInlinePreviewView } from './DesignSystemInlinePreviewView';

export function DesignSystemInlinePreview({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const controller = useWiredDesignSystemInlinePreview(projectId, file);
  return <DesignSystemInlinePreviewView file={file} {...controller} />;
}
