import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './GroundedPptxViewer.module.css';

interface GroundedPptxStructure {
  slideCount: number;
  slides: Array<{
    index: number;
    title: string | null;
    text: string;
    layout: { name: string; type: string | null; partName: string } | null;
  }>;
}

interface GroundedPptxResponse {
  manifest: { currentRevisionId: string; source: { originalFilename: string; projectFilePath?: string } };
  structure: GroundedPptxStructure;
}

export function GroundedPptxViewer({
  projectId,
  fileName,
  fallback,
}: {
  projectId: string;
  fileName: string;
  fallback: ReactNode;
}) {
  const [data, setData] = useState<GroundedPptxResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showUploadedSource, setShowUploadedSource] = useState(false);
  const requestVersion = useRef(0);
  const importController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    importController.current?.abort();
    setData(null);
    setUnavailable(false);
    setError(null);
    setImporting(false);
    setSelectedIndex(0);
    setShowUploadedSource(false);
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/pptx`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          if (version === requestVersion.current) setUnavailable(true);
          return;
        }
        const body = (await response.json()) as GroundedPptxResponse | { error?: string };
        if (!response.ok) {
          throw new Error('error' in body && body.error ? body.error : `HTTP ${response.status}`);
        }
        if (version === requestVersion.current) setData(body as GroundedPptxResponse);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      controller.abort();
      importController.current?.abort();
    };
  }, [projectId, fileName]);

  const selected = data?.structure.slides[selectedIndex] ?? null;
  const visibleSlides = useMemo(() => {
    if (!data) return [];
    const radius = 4;
    const start = Math.max(0, Math.min(selectedIndex - radius, data.structure.slides.length - (radius * 2 + 1)));
    return data.structure.slides.slice(start, start + radius * 2 + 1);
  }, [data, selectedIndex]);
  const revisionId = data?.manifest.currentRevisionId;
  const previewUrl = useMemo(
    () =>
      revisionId == null
        ? ''
        : `/api/projects/${encodeURIComponent(projectId)}/pptx/revisions/${encodeURIComponent(revisionId)}/slides/${selectedIndex}/preview`,
    [projectId, revisionId, selectedIndex],
  );

  if (unavailable) {
    const importCurrentFile = async () => {
      const controller = new AbortController();
      importController.current?.abort();
      importController.current = controller;
      const version = requestVersion.current;
      setImporting(true);
      setError(null);
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/pptx/import-file`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fileName }),
          signal: controller.signal,
        });
        const body = (await response.json()) as GroundedPptxResponse | { error?: string };
        if (!response.ok) {
          throw new Error('error' in body && body.error ? body.error : `HTTP ${response.status}`);
        }
        if (version === requestVersion.current && !controller.signal.aborted) {
          setData(body as GroundedPptxResponse);
          setUnavailable(false);
          setSelectedIndex(0);
        }
      } catch (cause) {
        if (!controller.signal.aborted && version === requestVersion.current) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (version === requestVersion.current) setImporting(false);
      }
    };
    return (
      <div className={styles.ungrounded}>
        {fallback}
        <div className={styles.groundingAction}>
          <strong>Use this deck as the design source</strong>
          <span>Preserve the native PowerPoint and generate from its existing slide patterns.</span>
          {error ? <span className={styles.actionError} role="alert">{error}</span> : null}
          <button type="button" disabled={importing} onClick={() => void importCurrentFile()}>
            {importing ? 'Analyzing PowerPoint…' : 'Use as grounded PowerPoint'}
          </button>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.status} role="alert">
        <strong>PowerPoint preview failed</strong>
        <span>{error}</span>
      </div>
    );
  }
  const sourceFile = data?.manifest.source.projectFilePath;
  const normalizeProjectPath = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (data && !sourceFile && !showUploadedSource) {
    return (
      <div className={styles.ungrounded}>
        {fallback}
        <div className={styles.groundingAction}>
          <strong>{data.manifest.source.originalFilename} is the uploaded grounded source</strong>
          <button type="button" onClick={() => setShowUploadedSource(true)}>
            View uploaded grounded PowerPoint
          </button>
        </div>
      </div>
    );
  }
  if (data && sourceFile && normalizeProjectPath(sourceFile) !== normalizeProjectPath(fileName)) {
    return fallback;
  }
  if (!data || !selected || !revisionId) {
    return <div className={styles.status} role="status" aria-live="polite">Analyzing native PowerPoint…</div>;
  }

  const downloadUrl = `/api/projects/${encodeURIComponent(projectId)}/pptx/revisions/${encodeURIComponent(revisionId)}/download`;
  return (
    <section className={styles.viewer} aria-label="Grounded PowerPoint viewer">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Grounded PowerPoint</span>
          <strong>{data.manifest.source.originalFilename}</strong>
          <span className={styles.canonical}>Native PPTX is the source of truth</span>
        </div>
        <a className={styles.download} href={downloadUrl} download>
          Download editable PPTX
        </a>
      </header>
      <div className={styles.body}>
        <aside className={styles.patterns} aria-label="Template patterns">
          <div className={styles.patternsHeader}>
            <strong>Template patterns</strong>
            <span>{data.structure.slideCount} source slides</span>
            <div>
              <button type="button" disabled={selectedIndex === 0} onClick={() => setSelectedIndex((index) => index - 1)}>Previous</button>
              <input
                aria-label="Slide number"
                type="number"
                min={1}
                max={data.structure.slideCount}
                value={selectedIndex + 1}
                onChange={(event) => {
                  const page = Number(event.currentTarget.value);
                  if (Number.isInteger(page) && page >= 1 && page <= data.structure.slideCount) setSelectedIndex(page - 1);
                }}
              />
              <button
                type="button"
                disabled={selectedIndex >= data.structure.slideCount - 1}
                onClick={() => setSelectedIndex((index) => index + 1)}
              >Next</button>
            </div>
          </div>
          <div className={styles.patternList}>
            {visibleSlides.map((slide) => {
              const thumbnail = `/api/projects/${encodeURIComponent(projectId)}/pptx/revisions/${encodeURIComponent(revisionId)}/slides/${slide.index}/preview`;
              return (
                <button
                  key={slide.index}
                  type="button"
                  className={`${styles.pattern} ${selectedIndex === slide.index ? styles.selected : ''}`}
                  onClick={() => setSelectedIndex(slide.index)}
                  aria-pressed={selectedIndex === slide.index}
                >
                  <img src={thumbnail} alt="" loading="lazy" />
                  <span>
                    <strong>{slide.title || `Slide ${slide.index + 1}`}</strong>
                    <small>{slide.layout?.name || slide.layout?.type || 'Custom slide'}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        <main className={styles.stage}>
          <div className={styles.slideMeta}>
            <span>Slide {selected.index + 1}</span>
            <span>{selected.layout?.type || 'custom'} pattern</span>
            <span>{revisionId}</span>
          </div>
          <div className={styles.canvas}>
            <img src={previewUrl} alt={`Slide ${selected.index + 1}: ${selected.title || 'Untitled'}`} />
          </div>
        </main>
      </div>
    </section>
  );
}
