// DOM helpers for CaptionOverlay — word box reading, transform I/O, wrapper management

export interface WordBox {
  segmentId: string;
  groupId: string;
  groupIndex: number;
  wordIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function readWordBoxes(
  iframe: HTMLIFrameElement,
  model: {
    groupOrder: string[];
    groups: Map<string, { segmentIds: string[] }>;
  },
  overlayEl: HTMLElement,
): WordBox[] {
  let doc: Document | null = null;
  let win: Window | null = null;
  try {
    doc = iframe.contentDocument;
    win = iframe.contentWindow;
  } catch {
    return [];
  }
  if (!doc || !win) return [];

  const iframeDisplayRect = iframe.getBoundingClientRect();
  const overlayRect = overlayEl.getBoundingClientRect();
  const nativeW = parseFloat(iframe.style.width) || iframeDisplayRect.width;
  const cssScale = iframeDisplayRect.width / nativeW;
  const offsetX = iframeDisplayRect.left - overlayRect.left;
  const offsetY = iframeDisplayRect.top - overlayRect.top;

  const groupEls = doc.querySelectorAll<HTMLElement>(".caption-group");
  const boxes: WordBox[] = [];

  for (let gi = 0; gi < model.groupOrder.length; gi++) {
    const groupId = model.groupOrder[gi];
    const group = model.groups.get(groupId);
    if (!group) continue;
    const groupEl = groupEls[gi] as HTMLElement | undefined;
    if (!groupEl) continue;
    const computed = win.getComputedStyle(groupEl);
    if (parseFloat(computed.opacity) <= 0.01 || computed.visibility === "hidden") continue;
    const resolvedWordEls: HTMLElement[] = [];
    for (const child of groupEl.children) {
      const c = child as HTMLElement;
      if (c.dataset.captionWrapper === "true") {
        const inner = c.querySelector<HTMLElement>(":scope > span");
        if (inner) resolvedWordEls.push(inner);
      } else if (c.tagName === "SPAN") {
        resolvedWordEls.push(c);
      }
    }
    if (resolvedWordEls.length === 0 && groupEl.textContent?.trim()) {
      const textNode = groupEl.childNodes[0];
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const words = (textNode.textContent || "").split(/\s+/).filter(Boolean);
        const frag = doc.createDocumentFragment();
        for (const word of words) {
          const span = doc.createElement("span");
          span.textContent = word + " ";
          span.style.display = "inline";
          frag.appendChild(span);
          resolvedWordEls.push(span);
        }
        groupEl.replaceChild(frag, textNode);
      } else {
        const singleSpan = groupEl.querySelector<HTMLElement>(":scope > span");
        if (singleSpan && singleSpan.textContent?.trim()) {
          const words = singleSpan.textContent.split(/\s+/).filter(Boolean);
          const frag = doc.createDocumentFragment();
          for (const word of words) {
            const span = doc.createElement("span");
            span.textContent = word + " ";
            span.style.display = "inline";
            frag.appendChild(span);
            resolvedWordEls.push(span);
          }
          singleSpan.replaceWith(frag);
        }
      }
    }
    for (let wi = 0; wi < group.segmentIds.length; wi++) {
      const segId = group.segmentIds[wi];
      const wordEl = resolvedWordEls[wi] as HTMLElement | undefined;
      if (!wordEl) continue;
      const rect = wordEl.getBoundingClientRect();
      boxes.push({
        segmentId: segId,
        groupId,
        groupIndex: gi,
        wordIndex: wi,
        x: rect.left * cssScale + offsetX,
        y: rect.top * cssScale + offsetY,
        width: rect.width * cssScale,
        height: rect.height * cssScale,
      });
    }
  }
  return boxes;
}

export function getWordEl(
  iframe: HTMLIFrameElement,
  groupIndex: number,
  wordIndex: number,
): HTMLElement | null {
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    return null;
  }
  if (!doc) return null;
  const groupEl = doc.querySelectorAll<HTMLElement>(".caption-group")[groupIndex];
  if (!groupEl) return null;
  const wordEls: HTMLElement[] = [];
  for (const child of groupEl.children) {
    const el = child as HTMLElement;
    if (el.dataset.captionWrapper === "true") {
      const inner = el.querySelector<HTMLElement>(":scope > span");
      if (inner) wordEls.push(inner);
    } else if (el.tagName === "SPAN") {
      wordEls.push(el);
    }
  }
  return wordEls[wordIndex] ?? null;
}

/**
 * Read GSAP's internal transform state for an element.
 * GSAP stores transforms in its own cache, not in el.style.transform.
 */
export function readGsapTransform(
  el: HTMLElement,
  iframeWin: Window,
): { x: number; y: number; scale: number; rotation: number } {
  const gsap = (
    iframeWin as unknown as { gsap?: { getProperty?: (el: HTMLElement, prop: string) => number } }
  ).gsap;
  if (gsap && gsap.getProperty) {
    return {
      x: gsap.getProperty(el, "x") || 0,
      y: gsap.getProperty(el, "y") || 0,
      scale: gsap.getProperty(el, "scale") || 1,
      rotation: gsap.getProperty(el, "rotation") || 0,
    };
  }
  const t = el.style.transform || "";
  const scaleMatch = t.match(/scale\(([^)]+)\)/);
  const rotMatch = t.match(/rotate\(([^)]+)deg\)/);
  const txyMatch = t.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
  return {
    x: txyMatch ? parseFloat(txyMatch[1]) : 0,
    y: txyMatch ? parseFloat(txyMatch[2]) : 0,
    scale: scaleMatch ? parseFloat(scaleMatch[1]) : 1,
    rotation: rotMatch ? parseFloat(rotMatch[1]) : 0,
  };
}

/**
 * Get or create an inline-block wrapper span around a word element.
 * Transforms are applied to the wrapper so the word's GSAP animations are preserved.
 */
export function getOrCreateWrapper(el: HTMLElement): HTMLElement {
  if (el.dataset.captionWrapper === "true") return el;
  const parent = el.parentElement;
  if (parent && parent.dataset.captionWrapper === "true") return parent;
  const doc = el.ownerDocument;
  const wrapper = doc.createElement("span");
  wrapper.style.display = "inline-block";
  wrapper.dataset.captionWrapper = "true";
  el.parentNode?.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

/**
 * Write transform values to a wrapper span around the word element.
 */
export function writeTransform(
  el: HTMLElement,
  iframeWin: Window,
  x: number,
  y: number,
  scale: number,
  rotation: number,
) {
  const wrapper = getOrCreateWrapper(el);
  const gsap = (
    iframeWin as unknown as {
      gsap?: { set?: (el: HTMLElement, props: Record<string, number>) => void };
    }
  ).gsap;
  if (gsap && gsap.set) {
    gsap.set(wrapper, { x, y, scale, rotation });
  } else {
    wrapper.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rotation.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
  }
}

// ---------------------------------------------------------------------------
// Iframe registry — lets non-component code (undo/redo in useAppHotkeys)
// reapply a restored model's transforms to the live preview.
// ---------------------------------------------------------------------------

let registeredIframe: React.RefObject<HTMLIFrameElement | null> | null = null;

export function registerCaptionIframe(ref: React.RefObject<HTMLIFrameElement | null>): () => void {
  registeredIframe = ref;
  return () => {
    if (registeredIframe === ref) registeredIframe = null;
  };
}

/**
 * True when the caption preview iframe is mounted AND visible. The caption
 * store's isEditMode stays true while the preview is merely hidden, so hotkeys must not
 * route ⌘Z to the caption stack unless the user can see the captions the undo would change.
 */
export function isCaptionPreviewVisible(): boolean {
  const iframe = registeredIframe?.current;
  return Boolean(iframe?.isConnected && iframe.offsetParent !== null);
}

/** Reapply every segment's transform from a (restored) model to the preview DOM. */
export function applyCaptionModelToIframe(model: {
  groupOrder: string[];
  groups: Map<string, { segmentIds: string[] }>;
  segments: Map<string, { style: { x?: number; y?: number; scaleX?: number; rotation?: number } }>;
}): void {
  const iframe = registeredIframe?.current;
  if (!iframe) return;
  let win: Window | null = null;
  try {
    win = iframe.contentWindow;
  } catch {
    return;
  }
  if (!win) return;
  for (let gi = 0; gi < model.groupOrder.length; gi++) {
    const group = model.groups.get(model.groupOrder[gi]);
    if (!group) continue;
    for (let wi = 0; wi < group.segmentIds.length; wi++) {
      const seg = model.segments.get(group.segmentIds[wi]);
      if (!seg) continue;
      const wordEl = getWordEl(iframe, gi, wi);
      if (!wordEl) continue;
      const s = seg.style;
      writeTransform(wordEl, win, s.x ?? 0, s.y ?? 0, s.scaleX ?? 1, s.rotation ?? 0);
    }
  }
}

/** Compute style deltas from the current wrapper transform — used by syncToStore in the overlay. */
export function computeTransformStyle(el: HTMLElement, iframeWin: Window): Record<string, number> {
  const wrapper = getOrCreateWrapper(el);
  const { x, y, scale, rotation } = readGsapTransform(wrapper, iframeWin);
  const style: Record<string, number> = {};
  if (Math.abs(x) > 0.5) style.x = x;
  if (Math.abs(y) > 0.5) style.y = y;
  if (Math.abs(scale - 1) > 0.001) {
    style.scaleX = scale;
    style.scaleY = scale;
  }
  if (Math.abs(rotation) > 0.1) style.rotation = rotation;
  return style;
}
