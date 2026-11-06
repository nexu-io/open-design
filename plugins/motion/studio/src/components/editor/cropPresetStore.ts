import { create } from "zustand";

export interface CropPresetBarTarget {
  hfId?: string;
  id?: string;
}

interface CropPresetBarState {
  openFor: CropPresetBarTarget | null;
  open: (target: CropPresetBarTarget) => void;
  close: () => void;
}

/** Which clip the crop preset bar is open for; the canvas shows it while that element is selected. */
export const useCropPresetBarStore = create<CropPresetBarState>((set) => ({
  openFor: null,
  open: (target) => set({ openFor: target }),
  close: () => set({ openFor: null }),
}));

export function isCropBarTarget(element: Element, target: CropPresetBarTarget | null): boolean {
  if (!target) return false;
  const hfId = element.getAttribute("data-hf-id");
  if (target.hfId && hfId) return target.hfId === hfId;
  return Boolean(target.id) && element.id === target.id;
}

/** The crop lift is a stylesheet rule, so the inline clip-path is still the committed one. */
export function committedClipPath(element: Element): string | null {
  const style = element.getAttribute("style") ?? "";
  const match = /(?:^|;)\s*clip-path\s*:\s*([^;]+)/i.exec(style);
  return match?.[1]?.trim() ?? null;
}
