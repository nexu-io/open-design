export type AlignmentOp =
  | 'align-left' | 'align-center-h' | 'align-right'
  | 'align-top' | 'align-center-v' | 'align-bottom'
  | 'distribute-h' | 'distribute-v';

export interface PositionedTarget {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeAlignedPositions(
  targets: PositionedTarget[],
  op: AlignmentOp,
): Record<string, { left: string; top: string }> | null {
  if (targets.length < 2) return null;
  const result: Record<string, { left: string; top: string }> = {};

  switch (op) {
    case 'align-left': {
      // ponytail: O(n) loop, n ≤ ~50, fast enough
      const ref = Math.min(...targets.map((t) => t.left));
      for (const t of targets) result[t.id] = { left: `${Math.round(ref)}px`, top: `${Math.round(t.top)}px` };
      return result;
    }
    case 'align-right': {
      const ref = Math.max(...targets.map((t) => t.left + t.width));
      for (const t of targets) result[t.id] = { left: `${Math.round(ref - t.width)}px`, top: `${Math.round(t.top)}px` };
      return result;
    }
    case 'align-center-h': {
      const bbox = targetsReduceToBbox(targets);
      const cx = bbox.left + bbox.width / 2;
      for (const t of targets) result[t.id] = { left: `${Math.round(cx - t.width / 2)}px`, top: `${Math.round(t.top)}px` };
      return result;
    }
    case 'align-top': {
      const ref = Math.min(...targets.map((t) => t.top));
      for (const t of targets) result[t.id] = { left: `${Math.round(t.left)}px`, top: `${Math.round(ref)}px` };
      return result;
    }
    case 'align-bottom': {
      const ref = Math.max(...targets.map((t) => t.top + t.height));
      for (const t of targets) result[t.id] = { left: `${Math.round(t.left)}px`, top: `${Math.round(ref - t.height)}px` };
      return result;
    }
    case 'align-center-v': {
      const bbox = targetsReduceToBbox(targets);
      const cy = bbox.top + bbox.height / 2;
      for (const t of targets) result[t.id] = { left: `${Math.round(t.left)}px`, top: `${Math.round(cy - t.height / 2)}px` };
      return result;
    }
    case 'distribute-h': {
      const n = targets.length;
      if (n < 3) return null;
      const sorted = [...targets].sort((a, b) => a.left - b.left);
      const first = sorted[0]!;
      const last = sorted[n - 1]!;
      const gap = (last.left - (first.left + first.width)) / (n - 1);
      for (let i = 1; i < n - 1; i++) {
        const t = sorted[i]!;
        result[t.id] = {
          left: `${Math.round(first.left + first.width + gap * i)}px`,
          top: `${Math.round(t.top)}px`,
        };
      }
      return result;
    }
    case 'distribute-v': {
      const n = targets.length;
      if (n < 3) return null;
      const sorted = [...targets].sort((a, b) => a.top - b.top);
      const first = sorted[0]!;
      const last = sorted[n - 1]!;
      const gap = (last.top - (first.top + first.height)) / (n - 1);
      for (let i = 1; i < n - 1; i++) {
        const t = sorted[i]!;
        result[t.id] = {
          left: `${Math.round(t.left)}px`,
          top: `${Math.round(first.top + first.height + gap * i)}px`,
        };
      }
      return result;
    }
  }
}

function targetsReduceToBbox(targets: PositionedTarget[]): { left: number; top: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of targets) {
    if (t.left < minX) minX = t.left;
    if (t.top < minY) minY = t.top;
    if (t.left + t.width > maxX) maxX = t.left + t.width;
    if (t.top + t.height > maxY) maxY = t.top + t.height;
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}
