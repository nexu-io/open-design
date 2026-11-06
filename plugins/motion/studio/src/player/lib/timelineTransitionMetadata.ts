import type { TimelineLike } from "./playbackTypes";

const TRANSITION_LABEL_PREFIX = "hf:transition:";

type TimelineWithLabels = TimelineLike & {
  labels?: Record<string, number>;
  getLabels?: () => Record<string, number>;
};

function transitionParts(label: string): [string, string] | null {
  if (!label.startsWith(TRANSITION_LABEL_PREFIX)) return null;
  const parts = label.slice(TRANSITION_LABEL_PREFIX.length).split(":");
  if (parts.length < 3 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

function findTimedElement(doc: Document, markerId: string): Element | null {
  for (const candidate of [markerId, `el-${markerId}`]) {
    const byId = doc.getElementById(candidate);
    if (byId?.hasAttribute("data-start")) return byId;
  }
  return (
    Array.from(doc.querySelectorAll("[data-start]")).find(
      (element) =>
        element.getAttribute("data-hf-id") === markerId ||
        element.getAttribute("data-composition-id") === markerId,
    ) ?? null
  );
}

export function transitionLabelsForDocument(
  doc: Document,
  timelines: Readonly<Record<string, TimelineLike>> | undefined,
): ReadonlyMap<Element, string> {
  const labels = new Map<Element, string>();
  if (!timelines) return labels;

  for (const timeline of Object.values(timelines) as TimelineWithLabels[]) {
    const timelineLabels = timeline.getLabels?.() ?? timeline.labels ?? {};
    for (const label of Object.keys(timelineLabels)) {
      const pair = transitionParts(label);
      if (!pair) continue;
      const outgoing = findTimedElement(doc, pair[0]);
      const incoming = findTimedElement(doc, pair[1]);
      if (outgoing && incoming) {
        labels.set(outgoing, label);
        labels.set(incoming, label);
      }
    }
  }
  return labels;
}
