// Feature-local hook for the read-only document (pdf/doc/ppt/xlsx) preview:
// fetches a summarized preview whenever the target file identity changes.
import { useEffect, useState } from 'react';
import { documentPreviewPort } from '../dependencies';
import type { DocumentPreviewPort } from '../ports';
import type { DocumentPreview } from '../types';

export interface DocumentPreviewController {
  preview: DocumentPreview | null;
  loading: boolean;
}

export function useDocumentPreview(
  port: DocumentPreviewPort,
  projectId: string,
  fileName: string,
  fileMtime: number,
): DocumentPreviewController {
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    void port.fetchProjectFilePreview(projectId, fileName).then((next) => {
      if (!cancelled) {
        setPreview(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [port, projectId, fileName, fileMtime]);

  return { preview, loading };
}

export function useWiredDocumentPreview(
  projectId: string,
  fileName: string,
  fileMtime: number,
): DocumentPreviewController {
  return useDocumentPreview(documentPreviewPort, projectId, fileName, fileMtime);
}
