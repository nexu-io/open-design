/**
 * B6's normative rule: plural voiceover carve always targets a group.
 *
 * Split out of `useFxCarve.ts`, which owned all of this before the file grew
 * past a size where "carve targets a group" was still one thing to read —
 * same reason `useFxCarve.ts` itself was split out of
 * `propertyPanelAudioFxGroup.tsx`.
 */

import {
  classifyAudioName,
  HF_AUDIO_CARVE_ATTR,
  normalizeCarveSettings,
  couldBeCarveBed,
  isNamedCarveBed,
  type HfCarveSettings,
} from "@hyperframes/core/audio-carve";
import {
  HF_AUDIO_GROUP_TAG,
  resolveAudioGroups,
  resolveCarveSourceIds,
} from "@hyperframes/core/audio-groups";
import { isAudibleVideoNode } from "../../player/lib/timelineElementHelpers";

export function isCarveVoiceElement(el: Element | null): el is Element {
  return el !== null && (el.tagName === "AUDIO" || isAudibleVideoNode(el));
}

/**
 * An id for a new voiceover group, de-duped against every id already in the
 * document — group ids and plain element ids share one namespace, so both
 * have to be checked.
 */
export function mintGroupId(doc: Document): string {
  const taken = new Set([
    ...resolveAudioGroups(doc).map((g) => g.id),
    ...Array.from(doc.querySelectorAll("[id]")).map((el) => el.id),
  ]);
  if (!taken.has("voiceover")) return "voiceover";
  let n = 2;
  while (taken.has(`voiceover-${n}`)) n += 1;
  return `voiceover-${n}`;
}

export function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown })?.then === "function";
}

/**
 * "The auto-group failed, do not persist this carve" — distinct from a
 * legitimate `null`, which means the carve was deliberately cleared.
 */
export const CARVE_ABORTED = Symbol("carve-aborted");

/**
 * Plural voiceover carve, always against a group — normative, not a
 * suggestion (groups doc §1.6). Picking a second ungrouped voice clip mints a
 * group behind the two of them and points the carve at it instead, the same
 * way a hand-authored composition is expected to work; a source list already
 * naming a group is left alone; this only fires on a run of plain clip ids.
 *
 * Returns the settings unchanged, synchronously, when there is nothing to do —
 * NOT wrapped in a promise even though the caller may `await` the result. An
 * `async` function always yields a microtask, which would push every
 * `setCarve` call (grouped or not) one tick later than before this existed;
 * several tests assert on `onSetAttributeQuiet` synchronously after mount and
 * would miss that write.
 */
function withAutoGroupedSources(
  doc: Document,
  next: HfCarveSettings,
  assignGroup: ((clipIds: readonly string[], groupId: string) => Promise<void>) | undefined,
): HfCarveSettings | Promise<HfCarveSettings> {
  if (!assignGroup || next.sources.length < 2) return next;
  const groupIds = new Set(resolveAudioGroups(doc).map((g) => g.id));
  if (next.sources.some((id) => groupIds.has(id))) return next;
  const groupId = mintGroupId(doc);
  return assignGroup(next.sources, groupId).then(() => ({ ...next, sources: [groupId] }));
}

/**
 * `setCarve`'s first step: apply the auto-group rule, if a document and a
 * write-back are both available.
 *
 * Deliberately NOT an `async function`: wrapping this in one would make every
 * call return a promise-wrapped value, forcing the caller's `await` to yield
 * a microtask even on the synchronous branch — the exact bug
 * `withAutoGroupedSources`'s own sync-when-possible contract exists to avoid.
 * The caller does the `isPromiseLike` check (re-exported from here) and only
 * awaits the branch that is genuinely async.
 */
export function resolveNextCarveSettings(
  nextRaw: HfCarveSettings | null,
  doc: Document | undefined,
  assignGroup: ((clipIds: readonly string[], groupId: string) => Promise<void>) | undefined,
): HfCarveSettings | Promise<HfCarveSettings | typeof CARVE_ABORTED> | null {
  const resolved = nextRaw && doc ? withAutoGroupedSources(doc, nextRaw, assignGroup) : nextRaw;
  // A failed auto-group resolves to the sentinel rather than rejecting: the
  // write has already toasted, and the caller's job is simply not to persist a
  // carve whose `sources` name a group that was never written — which reads, at
  // playback, as a carve that silently stops ducking. Caught here rather than
  // in the caller so the synchronous branch above stays synchronous.
  return isPromiseLike(resolved)
    ? resolved.catch((): typeof CARVE_ABORTED => CARVE_ABORTED)
    : resolved;
}

export interface CarveCandidate {
  id: string;
  label: string;
  kind: ReturnType<typeof classifyAudioName>;
}

/**
 * One row per ungrouped clip that overlaps the bed, one row per group that has
 * ANY overlapping member (union, not per-clip — a narration group spanning
 * the whole timeline is relevant even if each of its segments only overlaps
 * part of the bed). Grouped members never appear individually.
 */
/**
 * The ids a carve may never name, for a bed of this id.
 *
 * A carve names what the bed ducks UNDER, so the bed can never be on that
 * list — directly or through the bus it plays into. The caller filters the bed
 * element out of `others`, but that only removes the bed itself: its siblings
 * survive and roll up into the very group the bed is a member of, which came
 * back as a candidate and, being the only one, was applied unprompted. And a
 * group bed's own id never matches any <audio> id at all, so nothing stopped a
 * group carving against itself.
 */
function excludedFor(groupByMember: Map<string, { id: string }>, bedId?: string): Set<string> {
  const selfGroupId = bedId ? groupByMember.get(bedId)?.id : undefined;
  return new Set([bedId, selfGroupId].filter((id): id is string => !!id));
}

export function collectCarveCandidates(
  doc: Document,
  others: readonly Element[],
  overlapsBed: (a: Element) => boolean,
  /** The bed's own id, so neither it nor the group it belongs to is offered. */
  bedId?: string,
): CarveCandidate[] {
  const groupByMember = new Map(
    resolveAudioGroups(doc).flatMap((group) => group.memberIds.map((id) => [id, group] as const)),
  );
  const excluded = excludedFor(groupByMember, bedId);
  const offeredGroupIds = new Set<string>();
  const described: CarveCandidate[] = [];
  for (const a of others.filter(isCarveVoiceElement)) {
    const group = groupByMember.get(a.id);
    if (excluded.has(a.id) || (group && excluded.has(group.id))) continue;
    if (!group) {
      if (overlapsBed(a)) {
        described.push({
          id: a.id,
          label: a.id,
          kind: classifyAudioName(a.id, a.getAttribute("src")),
        });
      }
      continue;
    }
    if (offeredGroupIds.has(group.id)) continue;
    const members = group.memberIds
      .map((id) => doc.getElementById(id))
      // Not `instanceof HTMLAudioElement`: these belong to the composition's
      // iframe document, so the constructor is a different realm's and the
      // instanceof is false for every one (mirrors resolveCarveVoices in
      // useFxCarve.ts).
      .filter((el): el is HTMLElement => isCarveVoiceElement(el));
    if (!members.some(overlapsBed)) continue;
    offeredGroupIds.add(group.id);
    described.push({
      id: group.id,
      label: `${group.label} (${members.length})`,
      kind: classifyAudioName(
        group.label,
        ...members.flatMap((m) => [m.id, m.getAttribute("src")]),
      ),
    });
  }
  return described;
}

/**
 * The two near-end questions about a track, asked of its name.
 *
 * `couldBeBed` — may a carve be written onto this at all? A carve makes room in
 * a bed for a voice, so a voice track is the one thing that can never be the
 * bed. The far-end rule (`couldBeCarveSource` — music and sfx are out) has
 * existed since it was written and had no caller; this is the half nothing
 * asked, and without it a narration clip was offered the control and, finding
 * exactly one candidate, had a carve applied against the group it belonged to.
 *
 * `autoBed` — may one be applied WITHOUT the author asking? Stricter. Showing
 * the module on a track named `a1` is a suggestion; writing `data-fx-carve`
 * onto it is a decision, and a decision taken off a name that said nothing is
 * how a carve turns up that nobody remembers configuring. The same split the
 * source side already makes between what the picker may show (`sourceOptions`)
 * and what it may choose unprompted (`autoSourceIds`).
 *
 * Reads the element's `data-label` as well as its id and `src`, because a clip's
 * display name is a hint its filename may not carry. A BUS is excluded outright
 * — see the first branch.
 */
export function carveBedRoles(
  id: string | null | undefined,
  node: Element | null | undefined,
): { couldBeBed: boolean; autoBed: boolean } {
  // A BUS is never a bed, whatever it is called. Its rack reaches `useFxCarve`
  // too, and reading `data-label` — which is what lets a group be classified at
  // all — made a bus labelled "Music bed" read as music: it then auto-carved
  // against the same voice its own member clip had already auto-carved against,
  // and the bed ran through both sets of filters. Nothing caught that, because
  // the only guard (`carverAgainst`) asks "is somebody naming ME as a source",
  // never "is my own bus, or my own member, already carved".
  //
  // A bus could not do the whole job anyway: the level half of the carve reads
  // the bed's own `src` to measure how far over the voice it sits, and a bus has
  // no `src` — so a bus carve was always the spectral half alone, filters with
  // no level match. `data-fx-carve` is a clip attribute; the skill has said so
  // ("A carve stays on the clip") since the bus was documented.
  //
  // Not `couldBeBed: false` alone: that leaves `autoBed` free to fire from a
  // name, which is the half that wrote these unasked.
  if (node?.tagName?.toLowerCase() === HF_AUDIO_GROUP_TAG) {
    return { couldBeBed: false, autoBed: false };
  }
  const parts = [id, node?.getAttribute("src"), node?.getAttribute("data-label")];
  return { couldBeBed: couldBeCarveBed(...parts), autoBed: isNamedCarveBed(...parts) };
}

/**
 * Whether some element's own carve attribute names `targetId` as a source.
 *
 * Sources are EXPANDED first. A plural carve now names a group rather than a
 * clip list — that is what `audio_carve_ungrouped_sources` exists to push
 * authors toward — so a raw `.includes(targetId)` never matched a member again,
 * and the far-end guard this feeds was silently defeated by the very shape the
 * lint rule asks for. The result: the carve module was offered on a voice clip
 * a bed is already ducking against, and switching it on wrote a reciprocal
 * carve — each side measuring audio the other is already attenuating.
 */
function carvesAgainst(doc: Document, other: HTMLElement, targetId: string): boolean {
  try {
    const raw = other.getAttribute(HF_AUDIO_CARVE_ATTR);
    if (!raw) return false;
    const sources = normalizeCarveSettings(JSON.parse(raw)).sources;
    return resolveCarveSourceIds(doc, sources).includes(targetId);
  } catch {
    // An unreadable carve on some other element says nothing about this one.
    return false;
  }
}

/**
 * Is some other track carving against this one, and which?
 *
 * A carve is a relationship — a bed is carved against a voice — and the voice is
 * the far end of it. Offering the same control there offers to carve a track
 * against itself by proxy, and switching it on left a setting with no source it
 * could legally name. Read off the other elements' own carve attributes, because
 * that is where the relationship is recorded.
 */
export function carverAgainst(
  doc: Document | undefined,
  id: string | null | undefined,
): string | null {
  if (!doc || !id) return null;
  const others = Array.from(doc.querySelectorAll<HTMLElement>(`[${HF_AUDIO_CARVE_ATTR}]`));
  const carver = others.find((other) => other.id !== id && carvesAgainst(doc, other, id));
  return carver ? carver.id || "another track" : null;
}
