import { useEffect } from "react";
import type { Composition } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditing";

function toHfIds(group: DomEditSelection[], primary: DomEditSelection | null): string[] {
  const source = group.length > 0 ? group : primary ? [primary] : [];
  return source.flatMap((s) => (s.hfId ? [s.hfId] : []));
}

/**
 * Stage 7 Step 2 — mirrors Studio canvas selection into the SDK session.
 *
 * Calls session.setSelection(hfIds) whenever domEditSelection or
 * domEditGroupSelections changes. Pure effect; no existing hook modified.
 */
export function useSdkSelectionSync(
  session: Composition | null,
  domEditSelection: DomEditSelection | null,
  domEditGroupSelections: DomEditSelection[],
): void {
  useEffect(() => {
    if (!session) return;
    session.setSelection(toHfIds(domEditGroupSelections, domEditSelection));
  }, [session, domEditSelection, domEditGroupSelections]);
}
