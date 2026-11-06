import { formatTimelineBlock } from "../player/lib/describeClips";
import { buildProjectApiPath } from "../utils/projectRouting";
import { useState, useCallback, useRef, useEffect } from "react";
import { copyTextToClipboard } from "../utils/clipboard";
import { readTagSnippetByTarget } from "../utils/sourcePatcher";
import { toProjectAbsolutePath, type AgentModalAnchorPoint } from "../utils/studioHelpers";
import { liveMarkupWithoutPreviewMarks } from "../utils/authoredSource";
import { buildElementAgentPrompt, type DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player";
import { studioApiFetch } from "../utils/studioApiFetch";

// ── Types ──

export interface UseAskAgentModalParams {
  projectId: string | null;
  activeCompPath: string | null;
  projectDir: string | null;
  projectIdRef: React.MutableRefObject<string | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  domEditSelection: DomEditSelection | null;
}

// ── Hook ──

export function useAskAgentModal({
  activeCompPath,
  projectDir,
  projectIdRef,
  showToast,
  domEditSelectionRef,
  domEditSelection,
}: UseAskAgentModalParams) {
  // ── State ──

  const [agentPromptTagSnippet, setAgentPromptTagSnippet] = useState<string | undefined>();
  const [agentPromptSelectionContext, setAgentPromptSelectionContext] = useState<
    string | undefined
  >();
  const [agentModalAnchorPoint, setAgentModalAnchorPoint] = useState<AgentModalAnchorPoint | null>(
    null,
  );
  const [copiedAgentPrompt, setCopiedAgentPrompt] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  // ── Refs ──

  const copiedAgentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Callbacks ──

  const preloadAgentPromptSnippet = useCallback(
    async (selection: DomEditSelection) => {
      const pid = projectIdRef.current;
      if (!pid) return;

      const targetPath = selection.sourceFile || activeCompPath || "index.html";
      try {
        const response = await studioApiFetch(
          buildProjectApiPath(pid, `/files/${encodeURIComponent(targetPath)}`),
        );
        if (!response.ok) return;

        const data = (await response.json()) as { content?: string };
        const html = data.content;
        const tagSnippet =
          typeof html === "string" ? readTagSnippetByTarget(html, selection) : undefined;

        setAgentPromptTagSnippet((current) => {
          if (domEditSelectionRef.current !== selection) return current;
          return tagSnippet;
        });
      } catch {
        // Runtime outerHTML is still available as a synchronous copy fallback.
      }
    },
    [activeCompPath, domEditSelectionRef, projectIdRef],
  );

  const handleAskAgent = useCallback(() => {
    if (!domEditSelection) return;
    setAgentPromptTagSnippet(undefined);
    setAgentPromptSelectionContext(undefined);
    setAgentModalAnchorPoint(null);
    void preloadAgentPromptSnippet(domEditSelection);
    setAgentModalOpen(true);
  }, [domEditSelection, preloadAgentPromptSnippet]);

  const handleAgentModalSubmit = useCallback(
    async (userInstruction: string) => {
      if (!domEditSelection) return;

      const targetPath = domEditSelection.sourceFile || activeCompPath || "index.html";
      const tagSnippet =
        agentPromptTagSnippet ?? liveMarkupWithoutPreviewMarks(domEditSelection.element);
      const prompt = buildElementAgentPrompt({
        selection: domEditSelection,
        currentTime: usePlayerStore.getState().currentTime,
        timeline: formatTimelineBlock(usePlayerStore.getState().elements),
        tagSnippet,
        selectionContext: agentPromptSelectionContext,
        userInstruction,
        sourceFilePath: toProjectAbsolutePath(projectDir, targetPath),
      });

      const copied = await copyTextToClipboard(prompt);
      if (!copied) {
        showToast("Could not copy prompt to clipboard.", "error");
        return;
      }

      setAgentModalOpen(false);
      setAgentPromptSelectionContext(undefined);
      setAgentModalAnchorPoint(null);
      if (copiedAgentTimerRef.current) clearTimeout(copiedAgentTimerRef.current);
      setCopiedAgentPrompt(true);
      copiedAgentTimerRef.current = setTimeout(() => setCopiedAgentPrompt(false), 1600);
    },
    [
      activeCompPath,
      agentPromptSelectionContext,
      agentPromptTagSnippet,
      domEditSelection,
      projectDir,
      showToast,
    ],
  );

  // ── Effects ──

  // Clear agent-prompt state when selection changes
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    setAgentPromptTagSnippet(undefined);
    setAgentPromptSelectionContext(undefined);
    setAgentModalAnchorPoint(null);
    setCopiedAgentPrompt(false);
  }, [domEditSelection]);

  // Cleanup copiedAgentTimerRef
  // eslint-disable-next-line no-restricted-syntax
  useEffect(
    () => () => {
      if (copiedAgentTimerRef.current) clearTimeout(copiedAgentTimerRef.current);
    },
    [],
  );

  return {
    // State
    agentModalOpen,
    agentModalAnchorPoint,
    copiedAgentPrompt,
    agentPromptSelectionContext,

    // Setters (consumed by handlePreviewCanvasMouseDown and other callers)
    setAgentModalOpen,
    setAgentPromptSelectionContext,
    setAgentModalAnchorPoint,

    // Callbacks
    preloadAgentPromptSnippet,
    handleAskAgent,
    handleAgentModalSubmit,
  };
}
