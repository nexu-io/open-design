/**
 * Promote-to-variable from the Design panel. Provides the same bind gesture the
 * Variables tab offers (declare a variable defaulting to the element's current
 * value + write the declarative binding), surfaced contextually on individual
 * property controls. A control asks about its channel (text / src / a style
 * prop) and gets back: whether it can be promoted, whether it is already bound,
 * and callbacks to promote or to edit the bound variable's default in place.
 */

import type { Composition, CompositionVariable } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import {
  applyBind,
  buildBindActions,
  rgbToHex,
  type BindAction,
} from "../components/panels/VariablesBindElement";
import {
  matchAction,
  readBindingFrom,
  uniqueId,
  type PromoteChannel,
} from "./variablePromoteHelpers";
import { useContext, useEffect, useMemo, useState } from "react";
import { createStableContext } from "../utils/hmrStableContext";

export type { PromoteChannel };

export interface ChannelPromote {
  /** The bind action for this channel, present only when the element supports it. */
  action: BindAction | null;
  /** Id of the variable this channel is already bound to, or null. */
  boundId: string | null;
  /** The bound variable's declaration (for its type + current default), if bound. */
  declaration: CompositionVariable | null;
  /** Declare a new variable (default = current value) and bind this channel to it. */
  promote: () => void;
  /** Update the bound variable's default value in place. */
  setDefault: (value: string) => void;
}

interface VariablePromoteContextValue {
  session: Composition | null;
  selection: DomEditSelection | null;
  actions: BindAction[];
  declarations: CompositionVariable[];
  persist: (label: string, mutate: (session: Composition) => void) => Promise<boolean>;
  onPersistError: (error: unknown) => void;
}

const VariablePromoteContext = createStableContext<VariablePromoteContextValue | null>(
  "VariablePromoteContext",
  null,
);

function readBinding(session: Composition, hfId: string, channel: PromoteChannel): string | null {
  const snapshot = session.getElement(hfId);
  if (!snapshot) return null;
  return readBindingFrom(snapshot, channel);
}

export function VariablePromoteProvider({
  session,
  selection,
  persist,
  onPersistError,
  children,
}: {
  session: Composition | null;
  selection: DomEditSelection | null;
  persist: (label: string, mutate: (session: Composition) => void) => Promise<boolean>;
  onPersistError: (error: unknown) => void;
  children: React.ReactNode;
}) {
  // Re-derive actions/bindings after each persisted schema edit.
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!session) return;
    return session.on("change", () => setRevision((r) => r + 1));
  }, [session]);

  const actions = useMemo(() => {
    if (!session || !selection) return [];
    return buildBindActions(selection, session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selection, revision]);

  const declarations = useMemo(() => {
    if (!session) return [];
    return session.getVariableDeclarations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, revision]);

  const value = useMemo<VariablePromoteContextValue>(
    () => ({ session, selection, actions, declarations, persist, onPersistError }),
    [session, selection, actions, declarations, persist, onPersistError],
  );

  return (
    <VariablePromoteContext.Provider value={value}>{children}</VariablePromoteContext.Provider>
  );
}

/**
 * Binding state + actions for one control's channel. Returns null when there is
 * no selection, no session, or the channel is neither bindable nor bound here —
 * so a control renders plain unless promoting genuinely applies.
 */
export function useVariablePromoteChannel(channel: PromoteChannel): ChannelPromote | null {
  const ctx = useContext(VariablePromoteContext);
  const key = channel.kind === "style" ? `style:${channel.prop}` : channel.kind;

  return useMemo(() => {
    if (!ctx || !ctx.session || !ctx.selection?.hfId) return null;
    const { session, selection, actions, declarations, persist, onPersistError } = ctx;
    const hfId = selection.hfId!;
    const action = matchAction(actions, channel);
    const boundId = readBinding(session, hfId, channel);
    if (!action && !boundId) return null;
    const declaration = boundId ? (declarations.find((d) => d.id === boundId) ?? null) : null;

    return {
      action,
      boundId,
      declaration,
      promote: () => {
        if (!action) return;
        // Right-click promote auto-names, so always mint a fresh id — unlike the
        // Variables-tab card, where the user types the id and may intentionally
        // reuse one. Auto-binding to a colliding pre-existing variable here would
        // silently couple two unrelated elements.
        const id = uniqueId(action.suggestedId, declarations);
        void persist(`Bind ${action.label.toLowerCase()} to variable "${id}"`, (s) =>
          applyBind(s, hfId, action, id),
        ).catch(onPersistError);
      },
      setDefault: (raw: string) => {
        if (!boundId || !declaration) return;
        const next = declaration.type === "color" ? rgbToHex(raw) : raw;
        void persist(`Set default for "${boundId}"`, (s) =>
          s.setVariableValue(boundId, next),
        ).catch(onPersistError);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key]);
}
