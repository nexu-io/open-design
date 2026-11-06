/**
 * The audio-group scan cached per preview document, and the mechanism that
 * keeps it honest.
 *
 * Split out of `timelineDOM.ts` (600-line studio ceiling). Self-contained: the
 * cache, its revision counter, the observer that bumps it, and the one reader.
 */

import { isElementNode } from "@hyperframes/core/runtime/dom-realm";
import {
  HF_AUDIO_GROUP_ATTR,
  HF_AUDIO_GROUP_TAG,
  resolveAudioGroups,
} from "@hyperframes/core/audio-groups";
import { HF_AUDIO_AUTOMATION_ATTR } from "@hyperframes/core/audio-automation";
import { HF_AUDIO_FX_ATTR } from "@hyperframes/core/audio-fx";

// One `<hf-audio-group>` scan per document, not per clip — resolveAudioGroups
// walks the whole tree, and a parse touches every clip in it.
interface GroupInfo {
  label: string;
  volume: number;
  hidden: boolean;
  fxChain?: string;
  automation?: string;
}

/**
 * The cached scan, plus the DOM revision it was taken at.
 *
 * Keeping the revision beside the entry is what makes staleness *detectable*
 * rather than a documented obligation. The cache is keyed on the document, and
 * group edits are applied as live patches precisely so the iframe never
 * reloads, so the key alone never changes: an explicit "remember to invalidate"
 * contract silently rots the first time a new writer forgets — which is exactly
 * what happened with the FX rack, whose group writes go through the DOM editor
 * rather than the timeline's own writers.
 */
const groupInfoCache = new WeakMap<
  Document,
  { revision: number; entries: Map<string, GroupInfo> }
>();

/** Bumped by every observed mutation to group state in a document. */
const groupRevisions = new WeakMap<Document, number>();
const groupObservers = new WeakMap<Document, MutationObserver>();

function countGroupChanges(doc: Document, records: readonly MutationRecord[]): void {
  // Only a group element added or removed counts: childList fires for every node a playing
  // preview inserts. Attribute records always count; the observer filter already narrowed them.
  const relevant = records.some(
    (record) =>
      record.type !== "childList" ||
      [...record.addedNodes, ...record.removedNodes].some(
        (node) =>
          isElementNode(node) &&
          (node.tagName.toLowerCase() === HF_AUDIO_GROUP_TAG ||
            node.hasAttribute(HF_AUDIO_GROUP_ATTR) ||
            node.querySelector?.(`${HF_AUDIO_GROUP_TAG},[${HF_AUDIO_GROUP_ATTR}]`) != null),
      ),
  );
  if (relevant) groupRevisions.set(doc, (groupRevisions.get(doc) ?? 0) + 1);
}

/**
 * Watch a document for any change to group state, so the cache expires itself.
 *
 * One observer per document, attached the first time a group is read from it.
 * It watches the attributes a group's identity is made of, anywhere in the
 * tree, plus added/removed nodes — which covers a group element appearing, a
 * member joining or leaving, and any group attribute being edited, by any
 * writer, without that writer having to know this cache exists.
 */
function observeGroupState(doc: Document): void {
  if (groupObservers.has(doc) || typeof MutationObserver === "undefined" || !doc.body) return;
  const observer = new MutationObserver((records) => countGroupChanges(doc, records));
  groupObservers.set(doc, observer);
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    // Every attribute `resolveAudioGroups`/`buildGroup` reads, including
    // `data-automation` — which `GroupInfo` does not cache TODAY, so omitting it
    // was inert, but group automation lanes already exist and the first person
    // to cache one would have got a silently never-firing observer. That is the
    // precise rot this observer replaced.
    attributeFilter: [
      HF_AUDIO_GROUP_ATTR,
      HF_AUDIO_FX_ATTR,
      HF_AUDIO_AUTOMATION_ATTR,
      "data-label",
      "data-volume",
      "data-hidden",
      "id",
    ],
  });
}

/**
 * Drop the cached group scan for a document.
 *
 * Belt to the observer's braces: a caller that has just written and wants the
 * very next read to be honest cannot wait for the observer's microtask. Callers
 * that forget are no longer punished — the revision check catches them.
 */
export function invalidateGroupInfoCache(doc: Document | null | undefined): void {
  if (doc) groupInfoCache.delete(doc);
}

export function groupInfoFor(doc: Document | null | undefined, groupId: string): GroupInfo {
  if (!doc) return { label: groupId, volume: 1, hidden: false };
  observeGroupState(doc);
  // A write earlier in this task has not reached the observer's callback yet.
  const unseen = groupObservers.get(doc)?.takeRecords();
  if (unseen?.length) countGroupChanges(doc, unseen);
  const revision = groupRevisions.get(doc) ?? 0;
  const cached = groupInfoCache.get(doc);
  let info = cached && cached.revision === revision ? cached.entries : undefined;
  if (!info) {
    info = new Map(
      resolveAudioGroups(doc).map((group) => [
        group.id,
        {
          label: group.label,
          volume: group.volume,
          hidden: group.hidden,
          ...(group.fxChain ? { fxChain: group.fxChain } : {}),
          ...(group.automation ? { automation: group.automation } : {}),
        },
      ]),
    );
    groupInfoCache.set(doc, { revision, entries: info });
  }
  return info.get(groupId) ?? { label: groupId, volume: 1, hidden: false };
}
