// Feature-local hook for the composer's draft text: the `draft` state (seeded
// from `initialDraft` or a persisted localStorage value), a synchronous
// `draftRef` mirror event handlers off a stale closure read/write (notably
// the annotation listener, where two uploads can resolve concurrently), the
// placeholder-carousel scenario selection, and the seed-once/persist effects.
// Transport (localStorage) is INJECTED as the slice port so the hook holds no
// import to a provider — see `dependencies.ts`.
//
// Both effects below are internal state management (reacting to a prop and
// this hook's own state, not an external `window`/`document`/`EventSource`
// subscription), so they stay in the hook per the accumulating-subscription
// rule.
//
// `replaceEditorDraft`/`insertInlineMentionSeparator` need the Lexical editor
// ref, which is shared across every popover/cluster and stays orchestrator-
// owned — so it's taken as a hook param (a plain React ref, not a
// `providers/` import) rather than imported.
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { LexicalComposerInputHandle } from '../../../components/composer/LexicalComposerInput';
import type { PlaceholderScenario } from '../../../components/home-hero/placeholderScenarios';
import { composerDraftPort } from '../dependencies';
import type { ComposerDraftPort } from '../ports';

export interface ComposerDraftParams {
  initialDraft?: string;
  draftStorageKey?: string;
  editorRef: MutableRefObject<LexicalComposerInputHandle | null>;
}

export interface ComposerDraftController {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  draftRef: MutableRefObject<string>;
  seededRef: MutableRefObject<boolean>;
  placeholderScenario: PlaceholderScenario | null;
  setPlaceholderScenario: Dispatch<SetStateAction<PlaceholderScenario | null>>;
  replaceEditorDraft: (text: string) => void;
  insertInlineMentionSeparator: () => void;
  clearDraft: () => void;
}

export function useComposerDraft(
  { initialDraft, draftStorageKey, editorRef }: ComposerDraftParams,
  port: ComposerDraftPort,
): ComposerDraftController {
  const [draft, setDraft] = useState(() => initialDraft ?? port.readComposerDraft(draftStorageKey) ?? "");
  const [placeholderScenario, setPlaceholderScenario] = useState<PlaceholderScenario | null>(null);
  // Synchronous mirror of `draft`. Kept in lockstep with `draft` by
  // `handleEditorChange` (the editor is the single source for typing) and by
  // the programmatic-set paths below.
  const draftRef = useRef(draft);

  // initialDraft is only honored on the first non-empty value the parent
  // hands us. After we seed once, the composer is fully under user control —
  // re-renders that pass the same prompt back must not reseed. If the
  // initial useState above already consumed a non-empty initialDraft we mark
  // it seeded immediately, so an early clear by the user (typing or
  // backspace before the parent stops passing initialDraft) does not get
  // overwritten by the effect.
  const seededRef = useRef(Boolean(initialDraft));

  useEffect(() => {
    if (seededRef.current) return;
    if (initialDraft && initialDraft !== draft) {
      setDraft(initialDraft);
      seededRef.current = true;
    } else if (initialDraft === undefined) {
      seededRef.current = true;
    }
  }, [initialDraft, draft]);

  useEffect(() => {
    port.writeComposerDraft(draftStorageKey, draft);
  }, [port, draftStorageKey, draft]);

  function replaceEditorDraft(text: string) {
    draftRef.current = text;
    setDraft(text);
    editorRef.current?.setText(text);
  }

  function insertInlineMentionSeparator() {
    const current = editorRef.current?.getText() ?? draftRef.current;
    if (current.trim() && !/\s$/.test(current)) {
      editorRef.current?.insertText(' ');
    }
  }

  // Shared by the draft-clearing slash actions (mcp/pet) and reset/submit:
  // stops a slash command or a sent turn from reaching the agent by wiping
  // the draft in lockstep with the Lexical editor.
  function clearDraft() {
    setDraft('');
    editorRef.current?.clear();
  }

  return {
    draft,
    setDraft,
    draftRef,
    seededRef,
    placeholderScenario,
    setPlaceholderScenario,
    replaceEditorDraft,
    insertInlineMentionSeparator,
    clearDraft,
  };
}

/**
 * Wirer: binds the real localStorage-backed port. This is the default the
 * orchestrator injects; tests call `useComposerDraft` directly with a
 * hand-written fake port instead.
 */
export function useWiredComposerDraft(params: ComposerDraftParams): ComposerDraftController {
  return useComposerDraft(params, composerDraftPort);
}
