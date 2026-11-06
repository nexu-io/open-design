import { formatTimelineAttributeNumber } from "../player/components/timelineEditing";

export function patchDocumentRootDuration(
  doc: Document | null | undefined,
  contentEnd: number,
): boolean {
  if (!doc || !Number.isFinite(contentEnd) || contentEnd <= 0) return false;
  const nodes = Array.from(doc.querySelectorAll("[data-composition-id]"));
  const root =
    nodes.find((node) => !node.parentElement?.closest("[data-composition-id]")) ?? nodes[0] ?? null;
  if (!root) return false;
  root.setAttribute("data-duration", formatTimelineAttributeNumber(contentEnd));
  return true;
}
