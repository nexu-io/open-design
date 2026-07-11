// Feature-local hook for the dropdown's navigation/layout state: whether it
// is open, which tab is active, and the wrapping element ref the
// outside-click dismiss effect reads. Pure UI state with no transport and —
// deliberately — no effects: the accumulating-subscription effect that reads
// this state (outside-click / Escape dismiss) stays in the single-instance
// orchestrator per the slice's effect-placement rule, so it can't double-fire
// and can use `document` directly (only files under `features/**` are
// transport/DOM-free).
import { useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { HandoffTab } from '../types';

export interface HandoffMenuNavController {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  activeTab: HandoffTab;
  setActiveTab: Dispatch<SetStateAction<HandoffTab>>;
  /** The `.handoff-wrap` element; outside-click dismiss reads it to decide
   * whether a pointerdown landed inside the menu. */
  wrapRef: MutableRefObject<HTMLDivElement | null>;
}

export function useHandoffMenuNav(): HandoffMenuNavController {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HandoffTab>('editor');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  return { open, setOpen, activeTab, setActiveTab, wrapRef };
}
