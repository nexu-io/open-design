import { usePlayerStore } from "../player/store/playerStore";
import type { EditMoment } from "../components/editor/manualEditsTypes";
import type { DragStamp } from "./draggedGsapPosition";

export function playheadMoment(): EditMoment {
  const { currentTime, activeKeyframePct } = usePlayerStore.getState();
  return { time: currentTime, keyframePct: activeKeyframePct };
}

/** The playhead an edit writes at: its gesture's press, else the playhead now. */
export function editMoment(stamp?: DragStamp): EditMoment {
  return stamp?.at ?? playheadMoment();
}
