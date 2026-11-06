/**
 * Pure manifest-transform helpers for SlideshowPanel.
 * No React, no side-effects — fully unit-testable.
 */

import type { SlideshowManifest, SlideRef, SlideHotspot } from "@hyperframes/core/slideshow";

// ── Scene shape used by the panel UI ──────────────────────────────────────

export interface SceneInfo {
  id: string;
  label: string;
  start: number;
  duration: number;
}

// ── Pure manifest transforms ───────────────────────────────────────────────

/** Toggle a scene in the main-line slide list. */
export function toggleMainLineSlide(
  manifest: SlideshowManifest,
  sceneId: string,
): SlideshowManifest {
  const exists = manifest.slides.some((s) => s.sceneId === sceneId);
  const slides: SlideRef[] = exists
    ? manifest.slides.filter((s) => s.sceneId !== sceneId)
    : [...manifest.slides, { sceneId }];
  return { ...manifest, slides };
}

// fallow-ignore-next-line complexity
/** Move a main-line slide up or down by one position. */
/** Swap the slide with `sceneId` one step up/down within a slide list. */
function swapSlide(slides: SlideRef[], sceneId: string, direction: "up" | "down"): SlideRef[] {
  const idx = slides.findIndex((s) => s.sceneId === sceneId);
  if (idx === -1) return slides;
  const next = direction === "up" ? idx - 1 : idx + 1;
  if (next < 0 || next >= slides.length) return slides;
  const out = [...slides];
  const a = out[idx];
  const b = out[next];
  if (!a || !b) return slides;
  out[idx] = b;
  out[next] = a;
  return out;
}

export function reorderMainLineSlide(
  manifest: SlideshowManifest,
  sceneId: string,
  direction: "up" | "down",
): SlideshowManifest {
  return mapSlidesIn(manifest, undefined, (slides) => swapSlide(slides, sceneId, direction));
}

/** Reorder a slide within a branch sequence (parallel to reorderMainLineSlide). */
export function reorderBranchSlide(
  manifest: SlideshowManifest,
  sequenceId: string,
  sceneId: string,
  direction: "up" | "down",
): SlideshowManifest {
  return mapSlidesIn(manifest, sequenceId, (slides) => swapSlide(slides, sceneId, direction));
}

/** Apply fn to a branch's slide list (sequenceId) or the main line (undefined). */
function mapSlidesIn(
  manifest: SlideshowManifest,
  sequenceId: string | undefined,
  fn: (slides: SlideRef[]) => SlideRef[],
): SlideshowManifest {
  if (sequenceId === undefined) {
    return { ...manifest, slides: fn(manifest.slides) };
  }
  return {
    ...manifest,
    slideSequences: (manifest.slideSequences ?? []).map((seq) =>
      seq.id === sequenceId ? { ...seq, slides: fn(seq.slides) } : seq,
    ),
  };
}

/** Update notes on a main-line slide (adds slide entry if absent). */
export function setSlideNotes(
  manifest: SlideshowManifest,
  sceneId: string,
  notes: string,
  sequenceId?: string,
): SlideshowManifest {
  return mapSlidesIn(manifest, sequenceId, (slides) => {
    const exists = slides.some((s) => s.sceneId === sceneId);
    if (exists) return slides.map((s) => (s.sceneId === sceneId ? { ...s, notes } : s));
    return sequenceId === undefined ? [...slides, { sceneId, notes }] : slides;
  });
}

/** Push a fragment hold-point time onto a main-line slide. Deduplicates + sorts. */
export function addFragment(
  manifest: SlideshowManifest,
  sceneId: string,
  time: number,
  sequenceId?: string,
): SlideshowManifest {
  return mapSlidesIn(manifest, sequenceId, (slides) => {
    const exists = slides.some((s) => s.sceneId === sceneId);
    if (exists)
      return slides.map((s) => {
        if (s.sceneId !== sceneId) return s;
        const frags = [...new Set([...(s.fragments ?? []), time])].sort((a, b) => a - b);
        return { ...s, fragments: frags };
      });
    return sequenceId === undefined ? [...slides, { sceneId, fragments: [time] }] : slides;
  });
}

/** Remove a fragment hold-point by value from a main-line slide. */
export function removeFragment(
  manifest: SlideshowManifest,
  sceneId: string,
  time: number,
  sequenceId?: string,
): SlideshowManifest {
  return mapSlidesIn(manifest, sequenceId, (slides) =>
    slides.map((s) =>
      s.sceneId === sceneId
        ? { ...s, fragments: (s.fragments ?? []).filter((f) => f !== time) }
        : s,
    ),
  );
}

/** Create a new branch sequence. Rejects duplicate ids. */
export function createSequence(
  manifest: SlideshowManifest,
  id: string,
  label: string,
): SlideshowManifest {
  const existing = manifest.slideSequences ?? [];
  if (existing.some((seq) => seq.id === id)) return manifest;
  return {
    ...manifest,
    slideSequences: [...existing, { id, label, slides: [] }],
  };
}

/** Rename an existing branch sequence label. */
export function renameSequence(
  manifest: SlideshowManifest,
  id: string,
  label: string,
): SlideshowManifest {
  return {
    ...manifest,
    slideSequences: (manifest.slideSequences ?? []).map((seq) =>
      seq.id === id ? { ...seq, label } : seq,
    ),
  };
}

function pruneHotspots(slides: SlideRef[], targetId: string): SlideRef[] {
  return slides.map((s) => {
    if (!s.hotspots) return s;
    const hotspots = s.hotspots.filter((h) => h.target !== targetId);
    return hotspots.length === s.hotspots.length ? s : { ...s, hotspots };
  });
}

/** Delete a branch sequence by id, removing any hotspot targeting it. */
export function deleteSequence(manifest: SlideshowManifest, id: string): SlideshowManifest {
  const remainingSequences = (manifest.slideSequences ?? []).filter((seq) => seq.id !== id);
  return {
    ...manifest,
    slides: pruneHotspots(manifest.slides, id),
    slideSequences: remainingSequences.map((seq) => ({
      ...seq,
      slides: pruneHotspots(seq.slides, id),
    })),
  };
}

/** Add or remove a scene slide from a branch sequence. */
export function assignToBranch(
  manifest: SlideshowManifest,
  sequenceId: string,
  sceneId: string,
  assign: boolean,
): SlideshowManifest {
  return {
    ...manifest,
    slideSequences: (manifest.slideSequences ?? []).map((seq) => {
      if (seq.id !== sequenceId) return seq;
      if (assign) {
        if (seq.slides.some((s) => s.sceneId === sceneId)) return seq;
        return { ...seq, slides: [...seq.slides, { sceneId }] };
      }
      return { ...seq, slides: seq.slides.filter((s) => s.sceneId !== sceneId) };
    }),
  };
}

/** Add a hotspot to a main-line slide. */
export function addHotspot(
  manifest: SlideshowManifest,
  sceneId: string,
  hotspot: SlideHotspot,
  sequenceId?: string,
): SlideshowManifest {
  return mapSlidesIn(manifest, sequenceId, (slides) =>
    slides.map((s) => {
      if (s.sceneId !== sceneId) return s;
      const existing = s.hotspots ?? [];
      if (existing.some((h) => h.id === hotspot.id)) return s;
      return { ...s, hotspots: [...existing, hotspot] };
    }),
  );
}

/** Remove a hotspot by id from a main-line slide. */
export function removeHotspot(
  manifest: SlideshowManifest,
  sceneId: string,
  hotspotId: string,
  sequenceId?: string,
): SlideshowManifest {
  return mapSlidesIn(manifest, sequenceId, (slides) =>
    slides.map((s) =>
      s.sceneId === sceneId
        ? { ...s, hotspots: (s.hotspots ?? []).filter((h) => h.id !== hotspotId) }
        : s,
    ),
  );
}
