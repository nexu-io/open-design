import { useCallback, useContext, useMemo, type ReactNode } from "react";
import { createStableContext } from "../utils/hmrStableContext";
import { trackDesignInput, type DesignInputUi } from "../utils/designInputTracking";

// Carries which inspector UI and which section the currently-rendered design-panel
// inputs belong to, so commit sites only pass { control, name } and never thread
// section/ui through every call. Providers nest: PropertyPanel sets `ui` once at the
// top; each Section sets `section` and inherits `ui` from the parent.

interface DesignPanelInputContextValue {
  ui: DesignInputUi;
  section: string;
}

const DesignPanelInputContext = createStableContext<DesignPanelInputContextValue>(
  "DesignPanelInputContext",
  { ui: "classic", section: "unknown" },
);

export function DesignPanelInputProvider({
  ui,
  section,
  children,
}: {
  ui?: DesignInputUi;
  section?: string;
  children: ReactNode;
}) {
  const parent = useContext(DesignPanelInputContext);
  const value = useMemo(
    () => ({ ui: ui ?? parent.ui, section: section ?? parent.section }),
    [ui, section, parent.ui, parent.section],
  );
  return (
    <DesignPanelInputContext.Provider value={value}>{children}</DesignPanelInputContext.Provider>
  );
}

/**
 * Returns a stable `track(control, name)` fn bound to the current UI + section.
 * Call it from any input's commit handler.
 */
export function useTrackDesignInput(): (control: string, name: string) => void {
  const { ui, section } = useContext(DesignPanelInputContext);
  return useCallback(
    (control: string, name: string) => trackDesignInput({ ui, section, control, name }),
    [ui, section],
  );
}
