// Feature-local hook for the composer's currently-applied plugin: the
// snapshot shown as a chip in the staged-context bar, plus the
// inline-mention "backed by an applied plugin" bridge ref that lets the
// auto-clear effect below tell an inline `@<plugin>` token apart from a
// plugin the user applied through the tools panel. Genuinely cross-cutting
// state (read/written by the design-toolbox-apply functions, the
// mention-insert family, `handleEditorChange`, `reset`, and the
// `PluginsSection`/`StagedRunContexts` JSX handlers) that previously sat
// bare in the orchestrator with no owning hook.
//
// Owns its own deps-bag callbacks (Phase 6 "a hook should own its own
// deps-bag callbacks" pattern): `handlePluginApplied` and the auto-clear
// effect need `setDraft`/`clearPluginsSection`, cross-cluster pieces this
// hook takes as params rather than requiring the orchestrator to assemble
// them itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppliedPluginSnapshot, ApplyResult } from '@open-design/contracts';
import { mentionTokenPresent } from '../../../utils/inlineMentions';

export type InlineBackedPlugin = { id: string; label: string } | null;

export interface AppliedPluginParams {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  clearPluginsSection: () => void;
}

export interface AppliedPluginController {
  activeAppliedPlugin: AppliedPluginSnapshot | null;
  setActiveAppliedPlugin: Dispatch<SetStateAction<AppliedPluginSnapshot | null>>;
  inlineBackedPluginRef: MutableRefObject<InlineBackedPlugin>;
  setInlineBackedPlugin: (value: InlineBackedPlugin) => void;
  handlePluginApplied: (brief: string, applied: ApplyResult) => void;
  handlePluginCleared: () => void;
  removeAppliedPlugin: () => void;
}

export function useAppliedPlugin({
  draft,
  setDraft,
  clearPluginsSection,
}: AppliedPluginParams): AppliedPluginController {
  const [activeAppliedPlugin, setActiveAppliedPlugin] = useState<AppliedPluginSnapshot | null>(null);
  const inlineBackedPluginRef = useRef<InlineBackedPlugin>(null);

  const setInlineBackedPlugin = useCallback((value: InlineBackedPlugin) => {
    inlineBackedPluginRef.current = value;
  }, []);

  // Fired by PluginsSection.onApplied every time its own brief changes.
  // Functional setState so a stale closure from the @-mention flow (which
  // awaits applyById after setDraft) still sees the latest draft value
  // before deciding whether to seed.
  const handlePluginApplied = useCallback((brief: string, applied: ApplyResult) => {
    setActiveAppliedPlugin(applied.appliedPlugin);
    if (typeof brief === 'string' && brief.length > 0) {
      setDraft((cur) => (cur.trim().length === 0 ? brief : cur));
    }
  }, [setDraft]);

  // Fired by PluginsSection.onCleared when the section clears itself (e.g.
  // the user removed its last context chip) — must NOT call
  // `clearPluginsSection` back, that would re-enter the section that just
  // told us it cleared.
  const handlePluginCleared = useCallback(() => {
    inlineBackedPluginRef.current = null;
    setActiveAppliedPlugin(null);
  }, []);

  // Fired by StagedRunContexts.onRemovePlugin when the user removes the
  // plugin chip from the staged-context bar (external to PluginsSection),
  // so this DOES need to actively tell the section to clear itself.
  const removeAppliedPlugin = useCallback(() => {
    clearPluginsSection();
    setActiveAppliedPlugin(null);
  }, [clearPluginsSection]);

  // Drops the inline-mention bridge (and clears the section) once the
  // applied plugin's `@<label>` token is hand-deleted from the draft.
  useEffect(() => {
    const inlinePlugin = inlineBackedPluginRef.current;
    if (!activeAppliedPlugin || inlinePlugin?.id !== activeAppliedPlugin.pluginId) return;
    if (mentionTokenPresent(draft, inlinePlugin.label)) return;
    inlineBackedPluginRef.current = null;
    clearPluginsSection();
  }, [activeAppliedPlugin, draft, clearPluginsSection]);

  return {
    activeAppliedPlugin,
    setActiveAppliedPlugin,
    inlineBackedPluginRef,
    setInlineBackedPlugin,
    handlePluginApplied,
    handlePluginCleared,
    removeAppliedPlugin,
  };
}
