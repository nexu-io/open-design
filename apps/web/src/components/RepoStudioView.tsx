import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  RepoStudioApplyResponse,
  RepoStudioComponent,
  RepoStudioControl,
  RepoStudioControlValue,
  RepoStudioDiffResponse,
  RepoStudioInspectResponse,
  RepoStudioVerifyResponse,
} from '@open-design/contracts';
import type { ManualEditBridgeMessage, ManualEditTarget } from '../edit-mode/types';
import { applyRepoStudioControl, diffRepoStudio, inspectRepoStudio, verifyRepoStudio } from '../providers/repo-studio';

const ROOT_KEY = 'open-design:repo-studio-root';
const MANIFEST_KEY = 'open-design:repo-studio-manifest-url';
const DEFAULT_MANIFEST_URL = 'http://127.0.0.1:5050/__rune_studio/manifest';

type Viewport = 'phone' | 'tablet' | 'desktop';

export function RepoStudioView({ onBack }: { onBack: () => void }) {
  const [root, setRoot] = useState(() => localStorage.getItem(ROOT_KEY) ?? '/project/rune');
  const [manifestUrl, setManifestUrl] = useState(() => localStorage.getItem(MANIFEST_KEY) ?? DEFAULT_MANIFEST_URL);
  const [session, setSession] = useState<RepoStudioInspectResponse | null>(null);
  const [selected, setSelected] = useState<ManualEditTarget | null>(null);
  const [targets, setTargets] = useState<ManualEditTarget[]>([]);
  const [viewport, setViewport] = useState<Viewport>('phone');
  const [fixture, setFixture] = useState<'busy-day' | 'live'>('busy-day');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastApply, setLastApply] = useState<RepoStudioApplyResponse | null>(null);
  const [lastVerify, setLastVerify] = useState<RepoStudioVerifyResponse | null>(null);
  const [sourceDiff, setSourceDiff] = useState<RepoStudioDiffResponse | null>(null);
  const [undoStack, setUndoStack] = useState<RepoStudioApplyResponse[]>([]);
  const [redoStack, setRedoStack] = useState<RepoStudioApplyResponse[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const selectedComponent = useMemo(
    () => componentForTarget(session, selected),
    [selected, session],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as ManualEditBridgeMessage | null;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
      if (data.type === 'od-edit-targets') setTargets(data.targets);
      if (data.type === 'od-edit-select') setSelected(data.target);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const load = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await inspectRepoStudio({ root, manifestUrl });
      localStorage.setItem(ROOT_KEY, root);
      localStorage.setItem(MANIFEST_KEY, manifestUrl);
      setSession(next);
      setSelected(null);
      setTargets([]);
      setLastApply(null);
      setLastVerify(null);
      setUndoStack([]);
      setRedoStack([]);
      setSourceDiff(await diffRepoStudio({ root: next.root, manifestUrl: next.manifestUrl }));
      setMessage(`Connected to ${next.manifest.appName}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const applyControl = async (component: RepoStudioComponent, control: RepoStudioControl, value: string) => {
    if (!session) return;
    const option = control.options.find((candidate) => String(candidate.value) === value);
    if (!option) return;
    await applyValue(component.id, control.id, option.value, `${control.label} changed to ${option.label}`, true);
  };

  const applyValue = async (
    componentId: string,
    controlId: string,
    value: RepoStudioControlValue,
    successMessage: string,
    recordHistory: boolean,
  ): Promise<boolean> => {
    if (!session) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await applyRepoStudioControl({
        root: session.root,
        manifestUrl: session.manifestUrl,
        componentId,
        controlId,
        value,
      });
      setLastApply(result);
      if (recordHistory && String(result.previousValue) !== String(result.value)) {
        setUndoStack((current) => [...current, result]);
        setRedoStack([]);
      }
      setMessage(successMessage);
      const refreshed = await inspectRepoStudio({ root: session.root, manifestUrl: session.manifestUrl });
      setSession(refreshed);
      setSourceDiff(await diffRepoStudio({ root: session.root, manifestUrl: session.manifestUrl }));
      setReloadKey((value) => value + 1);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const transaction = undoStack.at(-1);
    if (!transaction) return;
    const applied = await applyValue(
      transaction.componentId,
      transaction.controlId,
      transaction.previousValue,
      `Undid ${transaction.controlId}`,
      false,
    );
    if (!applied) return;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, transaction]);
  };

  const redo = async () => {
    const transaction = redoStack.at(-1);
    if (!transaction) return;
    const applied = await applyValue(
      transaction.componentId,
      transaction.controlId,
      transaction.value,
      `Redid ${transaction.controlId}`,
      false,
    );
    if (!applied) return;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, transaction]);
  };

  const runVerification = async (verificationId: string) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyRepoStudio({
        root: session.root,
        manifestUrl: session.manifestUrl,
        verificationId,
      });
      setLastVerify(result);
      setMessage(result.ok ? 'Verification passed' : 'Verification failed');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const previewUrl = session ? withFixture(session.manifest.previewUrl, fixture) : '';
  const viewportWidth = viewport === 'phone' ? 430 : viewport === 'tablet' ? 820 : 1280;

  return (
    <main className="repo-studio">
      <header className="repo-studio__topbar">
        <button type="button" className="repo-studio__button" onClick={onBack}>← Back</button>
        <div>
          <h1>Repo Studio</h1>
          <p>Edit registered application components against real source code.</p>
        </div>
        <div className="repo-studio__topbar-actions">
          <button type="button" className="repo-studio__button" onClick={() => void undo()} disabled={busy || undoStack.length === 0}>Undo</button>
          <button type="button" className="repo-studio__button" onClick={() => void redo()} disabled={busy || redoStack.length === 0}>Redo</button>
          <button type="button" className="repo-studio__button repo-studio__button--primary" onClick={load} disabled={busy}>
            {session ? 'Reload project' : 'Open project'}
          </button>
        </div>
      </header>

      <section className="repo-studio__connect">
        <label>Project root<input value={root} onChange={(event) => setRoot(event.target.value)} /></label>
        <label>Manifest URL<input value={manifestUrl} onChange={(event) => setManifestUrl(event.target.value)} /></label>
      </section>

      {error ? <div className="repo-studio__notice repo-studio__notice--error">{error}</div> : null}
      {message ? <div className="repo-studio__notice">{message}</div> : null}

      <div className="repo-studio__workspace">
        <aside className="repo-studio__sidebar">
          <h2>Components</h2>
          {session?.manifest.components.map((component) => (
            <button
              key={component.id}
              type="button"
              className={`repo-studio__component${selectedComponent?.id === component.id ? ' is-active' : ''}`}
              onClick={() => selectComponentInPreview(component, iframeRef.current, targets, setSelected)}
            >
              <strong>{component.label}</strong>
              <span>{component.sourceFile}</span>
            </button>
          )) ?? <p>Open a project to load registered components.</p>}
        </aside>

        <section className="repo-studio__canvas-column">
          <div className="repo-studio__canvas-toolbar">
            <div className="repo-studio__segmented">
              {(['phone', 'tablet', 'desktop'] as const).map((item) => (
                <button key={item} type="button" className={viewport === item ? 'is-active' : ''} onClick={() => setViewport(item)}>{item}</button>
              ))}
            </div>
            <select value={fixture} onChange={(event) => setFixture(event.target.value as 'busy-day' | 'live')}>
              <option value="busy-day">Busy-day fixture</option>
              <option value="live">Live data</option>
            </select>
          </div>
          <div className="repo-studio__canvas">
            {session ? (
              <iframe
                key={`${previewUrl}:${reloadKey}`}
                ref={iframeRef}
                title={`${session.manifest.appName} preview`}
                src={previewUrl}
                style={{ width: viewportWidth }}
                onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: 'od-edit-mode', enabled: true }, '*')}
              />
            ) : <div className="repo-studio__empty">Start the target dev server, then open its project manifest.</div>}
          </div>
        </section>

        <aside className="repo-studio__inspector">
          <h2>Inspector</h2>
          {selectedComponent ? (
            <>
              <h3>{selectedComponent.label}</h3>
              <code>{selectedComponent.sourceFile}</code>
              {selectedComponent.controls.map((control) => (
                <label key={control.id}>
                  {control.label}
                  <select value={String(control.value)} disabled={busy} onChange={(event) => void applyControl(selectedComponent, control, event.target.value)}>
                    {control.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
                  </select>
                </label>
              ))}
            </>
          ) : <p>Click a highlighted component in the preview.</p>}

          {session?.manifest.verification.length ? (
            <section className="repo-studio__checks">
              <h3>Verification</h3>
              {session.manifest.verification.map((check) => (
                <button key={check.id} type="button" className="repo-studio__button" disabled={busy} onClick={() => void runVerification(check.id)}>{check.label}</button>
              ))}
            </section>
          ) : null}

          {lastApply ? (
            <details open className="repo-studio__result">
              <summary>Last source edit</summary>
              <p>{lastApply.file}</p>
              <pre>{lastApply.afterSnippet}</pre>
            </details>
          ) : null}
          {lastVerify ? (
            <details open className="repo-studio__result">
              <summary>{lastVerify.ok ? 'Verification passed' : 'Verification failed'}</summary>
              <pre>{`${lastVerify.stdout}\n${lastVerify.stderr}`.trim()}</pre>
            </details>
          ) : null}
          {sourceDiff ? (
            <details open className="repo-studio__result">
              <summary>{sourceDiff.clean ? 'No registered source changes' : 'Registered source diff'}</summary>
              <pre>{sourceDiff.diff || 'Clean working tree for registered files.'}</pre>
            </details>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function withFixture(rawUrl: string, fixture: 'busy-day' | 'live'): string {
  const url = new URL(rawUrl);
  if (fixture === 'live') url.searchParams.delete('studio-fixture');
  else url.searchParams.set('studio-fixture', fixture);
  return url.toString();
}

function componentForTarget(session: RepoStudioInspectResponse | null, target: ManualEditTarget | null): RepoStudioComponent | null {
  if (!session || !target) return null;
  return session.manifest.components.find((component) => selectorTargetId(component.selector) === target.id) ?? null;
}

function selectorTargetId(selector: string): string | null {
  return selector.match(/data-od-id=["']([^"']+)["']/)?.[1] ?? null;
}

function selectComponentInPreview(
  component: RepoStudioComponent,
  iframe: HTMLIFrameElement | null,
  targets: ManualEditTarget[],
  setSelected: (target: ManualEditTarget | null) => void,
) {
  const id = selectorTargetId(component.selector);
  if (!id) return;
  iframe?.contentWindow?.postMessage({ type: 'od-edit-selected-target', id }, '*');
  setSelected(targets.find((target) => target.id === id) ?? null);
}
