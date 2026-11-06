import type { usePanelLayout } from "../hooks/usePanelLayout";
import { useContext, useMemo, type ReactNode } from "react";
import { createStableContext } from "../utils/hmrStableContext";

type PanelLayoutValue = ReturnType<typeof usePanelLayout>;

const PanelLayoutContext = createStableContext<PanelLayoutValue | null>("PanelLayoutContext", null);

export function usePanelLayoutContext(): PanelLayoutValue {
  const ctx = useContext(PanelLayoutContext);
  if (!ctx) throw new Error("usePanelLayoutContext must be used within PanelLayoutProvider");
  return ctx;
}

export function PanelLayoutProvider({
  value: { rightCollapsed, setRightCollapsed, rightPanelTab, setRightPanelTab },
  children,
}: {
  value: PanelLayoutValue;
  children: ReactNode;
}) {
  const stable = useMemo<PanelLayoutValue>(
    () => ({ rightCollapsed, setRightCollapsed, rightPanelTab, setRightPanelTab }),
    [rightCollapsed, setRightCollapsed, rightPanelTab, setRightPanelTab],
  );
  return <PanelLayoutContext value={stable}>{children}</PanelLayoutContext>;
}
