import type { DomEditSelection } from "./domEditingTypes";
import { findPreviewNode } from "./domEditingElement";

/**
 * Build the "live preview" callback the 3D-transform sub-view fires while a
 * value is being dragged: apply a gsap.set() to the matching node inside the
 * preview iframe so the edit is reflected immediately, before it's committed.
 *
 * Extracted so the identical closure exists once — shared by the legacy
 * PropertyPanel Layout section and the flat Layout group (PropertyPanelFlat).
 */
export function createGsapLivePreview(iframeRef: { readonly current: HTMLIFrameElement | null }) {
  return (el: DomEditSelection, props: Record<string, number>) => {
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow as
      | { gsap?: { set: (t: Element, v: Record<string, number>) => void } }
      | null
      | undefined;
    const node = findPreviewNode(iframe?.contentDocument, el);
    if (win?.gsap && node) win.gsap.set(node, props);
  };
}
