import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { keyHint } from "./studioShortcuts";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import type { TimelineLinkEdit } from "./timelineCallbacks";
import { linkedMembersOf } from "./audioClipLink";
import {
  canDetachAudio,
  canLinkPair,
  findMergePair,
  isPairInSync,
  sharesSourceFile,
} from "../../components/editor/mediaLinkEdits";

interface LinkMenuItem {
  label: string;
  shortcut?: string;
  destructive?: boolean;
  disabledReason?: string;
  run: () => void;
}

const keyOf = (el: TimelineElement) => el.key ?? el.id;

const tagOf = (el: TimelineElement) => el.tag.trim().toLowerCase();

function loneSameFilePartner(
  element: TimelineElement,
  elements: readonly TimelineElement[],
): TimelineElement | null {
  const opposite = { video: "audio", audio: "video" }[tagOf(element)];
  if (!opposite || element.link) return null;
  const candidates = elements.filter(
    (el) =>
      !el.link &&
      tagOf(el) === opposite &&
      el.track !== element.track &&
      sharesSourceFile([element, el]),
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function partnerSuffix(element: TimelineElement, others: readonly TimelineElement[]): string {
  const partners = others.filter((el) => keyOf(el) !== keyOf(element));
  const [partner] = partners;
  if (partners.length !== 1 || !partner) return "";
  const pair = [tagOf(element), tagOf(partner)].sort().join("+");
  return pair === "audio+video" ? ` ${tagOf(partner)}` : "";
}

function linkItem(
  element: TimelineElement,
  elements: readonly TimelineElement[],
  selected: TimelineElement[],
  selectedKeys: ReadonlySet<string>,
  onLinkEdit: (edit: TimelineLinkEdit) => unknown,
): LinkMenuItem | null {
  const selectedPair = canLinkPair(selected) && selectedKeys.has(keyOf(element));
  const soleSelection = selected.every((el) => keyOf(el) === keyOf(element));
  const partner = !selectedPair && soleSelection ? loneSameFilePartner(element, elements) : null;
  const linkPair = selectedPair ? selected : partner ? [element, partner] : null;
  if (!linkPair) return null;
  const suffix = partnerSuffix(element, linkPair);
  return {
    label: `Link${suffix && ` to${suffix}`}`,
    ...(selectedPair ? { shortcut: keyHint("linkToggle") } : {}),
    run: () => onLinkEdit({ kind: "link", elements: linkPair }),
  };
}

/** The link-model items for a clip, in wireframe order (detach · unlink/link · merge · delete-one). */
export function resolveLinkMenuItems(input: {
  element: TimelineElement;
  elements: readonly TimelineElement[];
  selectedKeys: ReadonlySet<string>;
  onLinkEdit?: (edit: TimelineLinkEdit) => unknown;
  onDeleteElementOnly?: (element: TimelineElement) => unknown;
}): LinkMenuItem[] {
  const { element, elements, selectedKeys, onLinkEdit, onDeleteElementOnly } = input;
  const items: LinkMenuItem[] = [];
  if (!onLinkEdit) return items;
  const members = linkedMembersOf(element, elements);
  const linked = members.length > 1;
  if (canDetachAudio(element)) {
    items.push({
      label: "Detach audio",
      shortcut: keyHint("detachAudio"),
      run: () => onLinkEdit({ kind: "detach", element }),
    });
  }
  const selected = elements.filter((el) => selectedKeys.has(keyOf(el)));
  if (linked) {
    items.push({
      label: `Unlink${partnerSuffix(element, members) && ` from${partnerSuffix(element, members)}`}`,
      shortcut: keyHint("linkToggle"),
      run: () => onLinkEdit({ kind: "unlink", elements: members }),
    });
  } else {
    const link = linkItem(element, elements, selected, selectedKeys, onLinkEdit);
    if (link) items.push(link);
  }
  const pair = findMergePair(element, elements);
  if (pair) {
    items.push({
      label: "Merge audio back into video",
      disabledReason: isPairInSync(pair.video, pair.audio) ? undefined : "Move into Sync first",
      run: () => onLinkEdit({ kind: "merge", ...pair }),
    });
  }
  if (linked && onDeleteElementOnly) {
    items.push({
      label: "Delete this clip only",
      shortcut: keyHint("deleteLinked"),
      destructive: true,
      run: () => onDeleteElementOnly(element),
    });
  }
  return items;
}

export function ClipMenuLinkItems({
  part,
  element,
  onClose,
}: {
  part: "link" | "delete";
  element: TimelineElement;
  onClose: () => void;
}) {
  const { onLinkEdit, onDeleteElementOnly } = useTimelineEditContextOptional();
  const elements = usePlayerStore((s) => s.elements);
  const selectedKeys = usePlayerStore((s) => s.selectedElementIds);
  const items = resolveLinkMenuItems({
    element,
    elements,
    selectedKeys,
    onLinkEdit,
    onDeleteElementOnly,
  }).filter((item) => (item.destructive === true) === (part === "delete"));
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabledReason !== undefined}
          title={item.disabledReason}
          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left outline-hidden ${
            item.disabledReason !== undefined
              ? "text-neutral-600 cursor-not-allowed"
              : `cursor-pointer hover:bg-neutral-800 focus-visible:bg-neutral-800 ${item.destructive ? "text-red-400" : "text-neutral-300"}`
          }`}
          onClick={() => {
            item.run();
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && (
            <span className="text-neutral-500 text-[10px] ml-3">{item.shortcut}</span>
          )}
        </button>
      ))}
    </>
  );
}
