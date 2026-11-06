import { buildProjectApiPath } from "../utils/projectRouting";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { LintFinding } from "../components/LintModal";
import { usePlayerStore } from "../player";
import { isPreviewBooted, whenPreviewBooted } from "../player/store/playerStore";
import { studioApiFetch } from "../utils/studioApiFetch";

interface RawFinding {
  severity?: string;
  message?: string;
  file?: string;
  fixHint?: string;
  elementId?: string;
  selector?: string;
  code?: string;
}

function parseFinding(f: RawFinding): LintFinding & { elementId?: string; file?: string } {
  return {
    severity: f.severity === "error" ? ("error" as const) : ("warning" as const),
    message: f.message ?? "",
    file: f.file,
    fixHint: f.fixHint,
    elementId: f.elementId,
  };
}

async function fetchLintFindings(projectId: string) {
  const res = await studioApiFetch(buildProjectApiPath(projectId, `/lint`));
  const data = await res.json();
  return ((data.findings ?? []) as RawFinding[]).map(parseFinding);
}

export function useLintModal(projectId: string | null, refreshKey?: number) {
  const [lintModal, setLintModal] = useState<LintFinding[] | null>(null);
  const [linting, setLinting] = useState(false);
  const [backgroundFindings, setBackgroundFindings] = useState<
    Array<LintFinding & { elementId?: string; file?: string }>
  >([]);
  const autoLintRanRef = useRef(false);

  const runBackgroundLint = useCallback(async () => {
    if (!projectId) return;
    if (!isPreviewBooted(projectId) && !(await whenPreviewBooted(projectId))) return;
    try {
      setBackgroundFindings(await fetchLintFindings(projectId));
    } catch {}
  }, [projectId]);

  const handleLint = useCallback(async () => {
    if (!projectId) return;
    setLinting(true);
    try {
      const parsed = await fetchLintFindings(projectId);
      setLintModal(parsed);
      setBackgroundFindings(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLintModal([{ severity: "error", message: `Failed to run lint: ${msg}` }]);
    } finally {
      setLinting(false);
    }
  }, [projectId]);

  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    if (projectId !== prevProjectIdRef.current) {
      autoLintRanRef.current = false;
      prevProjectIdRef.current = projectId;
    }
    if (!projectId || autoLintRanRef.current) return;
    autoLintRanRef.current = true;
    void runBackgroundLint();
  }, [projectId, runBackgroundLint]);

  useEffect(() => {
    if (!projectId || !refreshKey) return;
    const timer = setTimeout(() => void runBackgroundLint(), 1000);
    return () => clearTimeout(timer);
  }, [projectId, refreshKey, runBackgroundLint]);

  const closeLintModal = useCallback(() => setLintModal(null), []);

  const groupFindings = useCallback(
    (keyFn: (f: (typeof backgroundFindings)[0]) => string | undefined) => {
      const map = new Map<string, { count: number; messages: string[] }>();
      for (const f of backgroundFindings) {
        const key = keyFn(f);
        if (!key) continue;
        const prev = map.get(key) ?? { count: 0, messages: [] };
        prev.count += 1;
        prev.messages.push(f.message);
        map.set(key, prev);
      }
      return map;
    },
    [backgroundFindings],
  );

  const findingsByElement = useMemo(() => groupFindings((f) => f.elementId), [groupFindings]);
  const findingsByFile = useMemo(() => groupFindings((f) => f.file), [groupFindings]);
  // The badge counts findings, not files: the manual result when present, else the background one.
  const badgeFindings = lintModal ?? backgroundFindings;
  const lintFindingCount = badgeFindings.length;
  const hasLintError = badgeFindings.some((f) => f.severity === "error");

  // Sync lint findings directly to the player store — eliminates the
  // mirroring useEffect that was previously in App.tsx.
  useEffect(() => {
    usePlayerStore.getState().setLintFindingsByElement(findingsByElement);
  }, [findingsByElement]);

  return {
    lintModal,
    linting,
    handleLint,
    closeLintModal,
    backgroundFindings,
    findingsByElement,
    findingsByFile,
    lintFindingCount,
    hasLintError,
  };
}
