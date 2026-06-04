'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isTextNode,
  $isLineBreakNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_TAB_COMMAND,
  KEY_ESCAPE_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  PASTE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type TextNode,
} from 'lexical';
import { MentionNode, $createMentionNode, $isMentionNode } from './MentionNode';
import { serializeComposer } from './serialize';
import { setComposerFromText } from './deserialize';
import {
  buildInlineMentionParts,
  type InlineMentionEntity,
} from '../../utils/inlineMentions';

// A serializable caret box the host portal positions against. Sampled from the
// live DOM selection at trigger-detection time (same tick as detection) so it
// never lags editor state. All coordinates are viewport-space
// (getBoundingClientRect), matching the position:fixed portal's space.
export interface CaretRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Real caret = zero width, non-zero height. Reject the all-zero rect browsers
// return when there is "no geometry yet" (line start, right after inserting an
// atomic MentionNode, empty line).
function isUsableRect(r: DOMRect): boolean {
  return r.height > 0 && (r.top !== 0 || r.left !== 0 || r.bottom !== 0);
}

function toCaretRect(r: DOMRect): CaretRect {
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

// Read the caret's viewport rect via the native selection, with four ordered
// fallbacks for the collapsed-caret 0×0 case: (1) range bounding rect,
// (2) range client-rects list, (3) a zero-width probe range cloned at the
// anchor text offset, (4) the anchor element box, then the editor root.
function readCaretRect(rootEl: HTMLElement | null): CaretRect | null {
  if (typeof window === 'undefined') return null;
  const winSel = window.getSelection();
  if (winSel && winSel.rangeCount > 0) {
    const range = winSel.getRangeAt(0);

    // jsdom does not implement Range geometry — guard every native call so a
    // missing method falls through to the element/root box instead of throwing.
    if (typeof range.getBoundingClientRect === 'function') {
      const r = range.getBoundingClientRect();
      if (isUsableRect(r)) return toCaretRect(r);
    }
    if (typeof range.getClientRects === 'function') {
      const rects = range.getClientRects();
      if (rects.length > 0 && isUsableRect(rects[0]!)) return toCaretRect(rects[0]!);
    }

    const anchorNode = range.startContainer;
    if (anchorNode.nodeType === Node.TEXT_NODE) {
      try {
        const probe = document.createRange();
        const len = (anchorNode as Text).length;
        const off = Math.min(range.startOffset, len);
        probe.setStart(anchorNode, off);
        probe.setEnd(anchorNode, off);
        if (typeof probe.getBoundingClientRect === 'function') {
          const pr = probe.getBoundingClientRect();
          if (isUsableRect(pr)) return toCaretRect(pr);
        }
        if (typeof probe.getClientRects === 'function') {
          const prList = probe.getClientRects();
          if (prList.length > 0 && isUsableRect(prList[0]!)) return toCaretRect(prList[0]!);
        }
      } catch {
        /* fall through */
      }
    }
    const el =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : anchorNode.parentElement;
    if (el) {
      const er = el.getBoundingClientRect();
      if (isUsableRect(er)) {
        return { top: er.top, bottom: er.bottom, left: er.left, right: er.left };
      }
    }
  }
  if (rootEl) {
    const rr = rootEl.getBoundingClientRect();
    return { top: rr.top, bottom: rr.bottom, left: rr.left, right: rr.left };
  }
  return null;
}

// One @mention to insert into the editor. `token` is the literal "@…" text
// (already produced by `inlineMentionToken(label)`); `entity` carries the
// id/kind/label/title used to drive the pill styling + staged sync.
export interface MentionInsert {
  token: string;
  entity: InlineMentionEntity;
}

export interface LexicalComposerInputProps {
  placeholder: string;
  // = composerMentionEntities; used both to render existing @tokens as pills
  // (via setText/seed) and to fold plain-text @tokens into the present list.
  knownEntities: InlineMentionEntity[];
  // Fires on every editor change with the serialized plain text + the entities
  // currently referenced by the text (MentionNodes + plain @tokens matched
  // against knownEntities).
  onChange(plainText: string, present: InlineMentionEntity[]): void;
  // Mention / slash trigger state derived from the caret position. Either side
  // is null when no trigger is active.
  onTrigger(state: {
    mention: { q: string } | null;
    slash: { q: string } | null;
    anchorRect: CaretRect | null;
  }): void;
  // Plain Enter (no popover, no IME) — host submits the turn.
  onEnterSend(): void;
  // Pasted files/images — host uploads them (mirrors the old textarea paste).
  onPasteFiles?: (files: File[]) => void;
  // Whether a popover is open; gates the arrow/tab/enter/escape routing.
  popoverOpen: boolean;
  // Routes a popover key to the host; returns true when the host consumed it.
  onPopoverKey(
    key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape',
  ): boolean;
  // Optional combobox a11y. When set, the ContentEditable announces the active
  // mention row (id lives in the portaled listbox) without moving DOM focus.
  comboboxAria?: { activeId: string | null; expanded: boolean };
  title?: string;
  // Test hook for the contenteditable host. Defaults to the project
  // composer's id; HomeHero overrides it so its own tests/selectors keep
  // resolving the editor element after the textarea→Lexical migration.
  testId?: string;
}

// Imperative surface the host drives. Mirrors the old textareaRef operations
// but expressed in Lexical terms.
export interface LexicalComposerInputHandle {
  getText(): string;
  setText(text: string): void;
  clear(): void;
  focus(): void;
  insertMention(insert: MentionInsert): void;
  replaceActiveTrigger(text: string): void;
}

const EDITOR_THEME = {
  paragraph: 'composer-editor-paragraph',
};

// Walk back from the caret across the current line (stopping at the previous
// LineBreakNode) to reconstruct the text the trigger regexes need. Mentions
// are token nodes, so their text is included verbatim, which keeps the
// trailing-space "already inserted" suppression working.
function textBeforeCaretOnLine(node: TextNode, offset: number): string {
  let acc = node.getTextContent().slice(0, offset);
  let prev: LexicalNode | null = node.getPreviousSibling();
  while (prev && !$isLineBreakNode(prev)) {
    acc = prev.getTextContent() + acc;
    prev = prev.getPreviousSibling();
  }
  return acc;
}

// Drop the in-flight trigger token (the "@query" / "/query" run at the caret)
// from the anchor text node. The trigger always lives in plain text because
// mentions are token nodes you can't type into.
function deleteActiveTrigger(sel: RangeSelection, re: RegExp): void {
  const node = sel.anchor.getNode();
  if (!$isTextNode(node) || $isMentionNode(node)) return;
  const offset = sel.anchor.offset;
  const head = node.getTextContent().slice(0, offset);
  const match = re.exec(head);
  if (!match) return;
  // Strip a leading whitespace capture (the `(^|\s)` group of the @-rule) so
  // we only remove the literal token, not the space before it.
  const tok = match[0].replace(/^\s+/, '');
  const start = offset - tok.length;
  if (start < 0) return;
  node.spliceText(start, tok.length, '', true);
}

function hasPlainNavigationIntent(event: KeyboardEvent): boolean {
  return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function mentionBeforeCaret(selection: RangeSelection): MentionNode | null {
  const point = selection.anchor;
  const node = point.getNode();
  if ($isMentionNode(node)) {
    return point.offset > 0 ? node : null;
  }
  if ($isTextNode(node)) {
    if (point.offset !== 0) return null;
    const previous = node.getPreviousSibling();
    return $isMentionNode(previous) ? previous : null;
  }
  if ($isElementNode(node)) {
    if (point.offset <= 0) return null;
    const previous = node.getChildAtIndex(point.offset - 1);
    return $isMentionNode(previous) ? previous : null;
  }
  return null;
}

function mentionAfterCaret(selection: RangeSelection): MentionNode | null {
  const point = selection.anchor;
  const node = point.getNode();
  if ($isMentionNode(node)) {
    return point.offset < node.getTextContentSize() ? node : null;
  }
  if ($isTextNode(node)) {
    if (point.offset !== node.getTextContentSize()) return null;
    const next = node.getNextSibling();
    return $isMentionNode(next) ? next : null;
  }
  if ($isElementNode(node)) {
    const next = node.getChildAtIndex(point.offset);
    return $isMentionNode(next) ? next : null;
  }
  return null;
}

function selectBeforeMention(node: MentionNode): void {
  const parent = node.getParent();
  if (parent) {
    const index = node.getIndexWithinParent();
    parent.select(index, index);
  }
}

function selectAfterMention(node: MentionNode): void {
  const parent = node.getParent();
  if (parent) {
    const index = node.getIndexWithinParent() + 1;
    parent.select(index, index);
  }
}

function removeMentionAtCaret(selection: RangeSelection, isBackward: boolean): boolean {
  const mention = isBackward
    ? mentionBeforeCaret(selection)
    : mentionAfterCaret(selection);
  if (!mention) return false;
  const parent = mention.getParent();
  const index = mention.getIndexWithinParent();
  mention.remove();
  if (parent?.isAttached()) {
    const offset = Math.min(index, parent.getChildrenSize());
    parent.select(offset, offset);
  }
  return true;
}

function EditorRefPlugin({
  editorRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor, editorRef]);
  return null;
}

function TriggerPlugin({
  onTrigger,
}: {
  onTrigger: LexicalComposerInputProps['onTrigger'];
}) {
  const [editor] = useLexicalComposerContext();
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) {
          onTriggerRef.current({ mention: null, slash: null, anchorRect: null });
          return;
        }
        const node = sel.anchor.getNode();
        if (!$isTextNode(node) || $isMentionNode(node)) {
          onTriggerRef.current({ mention: null, slash: null, anchorRect: null });
          return;
        }
        const before = textBeforeCaretOnLine(node, sel.anchor.offset);
        const m = /(^|\s)@([^\s@]*)$/.exec(before);
        const s = /^\/([^\s/]*)$/.exec(before);
        const active = Boolean(m) || Boolean(s);
        // Only pay for the DOM read when a trigger is live; otherwise the rect
        // is unused. Viewport coords (position:fixed portal) — no scroll add.
        const anchorRect = active ? readCaretRect(editor.getRootElement()) : null;
        onTriggerRef.current({
          mention: m ? { q: m[2] ?? '' } : null,
          slash: s ? { q: s[1] ?? '' } : null,
          anchorRect,
        });
      });
    });
  }, [editor]);
  return null;
}

function KeyboardPlugin({
  popoverOpen,
  onEnterSend,
  onPopoverKey,
}: {
  popoverOpen: boolean;
  onEnterSend: () => void;
  onPopoverKey: LexicalComposerInputProps['onPopoverKey'];
}) {
  const [editor] = useLexicalComposerContext();
  // Keep the latest callbacks/flag in refs so the command registrations are
  // stable (registered once) yet always see fresh values.
  const popoverOpenRef = useRef(popoverOpen);
  popoverOpenRef.current = popoverOpen;
  const onEnterSendRef = useRef(onEnterSend);
  onEnterSendRef.current = onEnterSend;
  const onPopoverKeyRef = useRef(onPopoverKey);
  onPopoverKeyRef.current = onPopoverKey;
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (e: KeyboardEvent | null) => {
          // IME confirm Enter — let Lexical commit the composition.
          if (editor.isComposing()) return false;
          if (e?.shiftKey) {
            editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
            e.preventDefault();
            return true;
          }
          // Cmd/Ctrl+Enter force-sends even with a popover open.
          if (e?.metaKey || e?.ctrlKey) {
            e.preventDefault();
            onEnterSendRef.current();
            return true;
          }
          if (popoverOpenRef.current) {
            e?.preventDefault();
            return onPopoverKeyRef.current('Enter');
          }
          e?.preventDefault();
          onEnterSendRef.current();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (e) => {
          if (!popoverOpenRef.current || editor.isComposing()) return false;
          e?.preventDefault();
          return onPopoverKeyRef.current('ArrowDown');
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (e) => {
          if (!popoverOpenRef.current || editor.isComposing()) return false;
          e?.preventDefault();
          return onPopoverKeyRef.current('ArrowUp');
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (e) => {
          if (!popoverOpenRef.current || editor.isComposing()) return false;
          e?.preventDefault();
          return onPopoverKeyRef.current('Tab');
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!popoverOpenRef.current) return false;
          return onPopoverKeyRef.current('Escape');
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // Forbid a second paragraph — the composer is a single-paragraph model,
      // so a hard Enter that survived above becomes a line break.
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);
  return null;
}

function MentionAtomicNavigationPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event) => {
          if (editor.isComposing() || !hasPlainNavigationIntent(event)) {
            return false;
          }
          const selection = $getSelection();
          if (
            !$isRangeSelection(selection) ||
            !selection.isCollapsed()
          ) {
            return false;
          }
          const mention = mentionBeforeCaret(selection);
          if (!mention) return false;
          event.preventDefault();
          selectBeforeMention(mention);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => {
          if (editor.isComposing() || !hasPlainNavigationIntent(event)) {
            return false;
          }
          const selection = $getSelection();
          if (
            !$isRangeSelection(selection) ||
            !selection.isCollapsed()
          ) {
            return false;
          }
          const mention = mentionAfterCaret(selection);
          if (!mention) return false;
          event.preventDefault();
          selectAfterMention(mention);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (editor.isComposing() || !hasPlainNavigationIntent(event)) {
            return false;
          }
          const selection = $getSelection();
          if (
            !$isRangeSelection(selection) ||
            !selection.isCollapsed()
          ) {
            return false;
          }
          if (!removeMentionAtCaret(selection, true)) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event) => {
          if (editor.isComposing() || !hasPlainNavigationIntent(event)) {
            return false;
          }
          const selection = $getSelection();
          if (
            !$isRangeSelection(selection) ||
            !selection.isCollapsed()
          ) {
            return false;
          }
          if (!removeMentionAtCaret(selection, false)) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);
  return null;
}

function PastePlugin({
  onPasteFiles,
}: {
  onPasteFiles?: (files: File[]) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const onPasteFilesRef = useRef(onPasteFiles);
  onPasteFilesRef.current = onPasteFiles;
  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length > 0) {
          event.preventDefault();
          onPasteFilesRef.current?.(files);
          return true;
        }
        // Otherwise fall through so PlainTextPlugin pastes as plain text.
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);
  return null;
}

function OnChangePlugin({
  onChange,
  knownEntities,
}: {
  onChange: LexicalComposerInputProps['onChange'];
  knownEntities: InlineMentionEntity[];
}) {
  const [editor] = useLexicalComposerContext();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const entitiesRef = useRef(knownEntities);
  entitiesRef.current = knownEntities;
  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        // Skip selection-only updates (arrow keys, clicks, focus/blur,
        // programmatic select): they don't change the serialized text, so
        // re-serializing + re-folding the entity list on every caret move is
        // wasted work. The controlled-value loop is broken by SeedingPlugin's
        // `draft === current` guard, NOT by this callback, so skipping here is
        // safe. (Only OnChangePlugin is guarded this way — TriggerPlugin MUST
        // still run on selection-only updates to drive the @/slash popover.)
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        const { text, present } = serializeComposer(editorState);
        const folded = foldPresentEntities(text, present, entitiesRef.current);
        onChangeRef.current(text, folded);
      },
    );
  }, [editor]);
  return null;
}

// Plugin/skill/mcp/connector mentions are inserted as plain `@token` text
// (matching the old `replaceMentionWithText` byte-for-byte), so they aren't
// MentionNodes in the tree. To prune their staged chips on delete, fold the
// plain @tokens that still match a known entity into the present list.
function foldPresentEntities(
  text: string,
  present: InlineMentionEntity[],
  known: InlineMentionEntity[],
): InlineMentionEntity[] {
  const result: InlineMentionEntity[] = [...present];
  const seen = new Set(present.map((e) => `${e.kind}:${e.id}`));
  const parts = buildInlineMentionParts(text, known, { highlightUnknown: false });
  if (parts) {
    for (const part of parts) {
      if (part.kind === 'mention' && part.entity.kind !== 'unknown') {
        const key = `${part.entity.kind}:${part.entity.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(part.entity);
        }
      }
    }
  }
  return result;
}

// Seeds the editor from the host `draft` string only on genuine external
// changes (initialDraft, plugin brief, template, tools-menu insert, annotation
// append, reset()→''). When `draft` already equals the live serialized text,
// the change came from the user typing — bail so the caret is preserved.
function SeedingPlugin({
  draft,
  entities,
}: {
  draft: string;
  entities: InlineMentionEntity[];
}) {
  const [editor] = useLexicalComposerContext();
  const lastSeeded = useRef<string | null>(null);
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  useEffect(() => {
    const current = serializeComposer(editor.getEditorState()).text;
    if (draft === current) return; // user-typed → no reseed → caret preserved
    if (draft === lastSeeded.current) return; // StrictMode double-invoke guard
    lastSeeded.current = draft;
    setComposerFromText(editor, draft, entitiesRef.current);
  }, [draft, editor]);
  return null;
}

export const LexicalComposerInput = forwardRef<
  LexicalComposerInputHandle,
  LexicalComposerInputProps & { draft: string }
>(function LexicalComposerInput(props, ref) {
  const {
    placeholder,
    knownEntities,
    onChange,
    onTrigger,
    onEnterSend,
    onPasteFiles,
    popoverOpen,
    onPopoverKey,
    comboboxAria,
    draft,
    title,
    testId = 'chat-composer-input',
  } = props;
  const editorRef = useRef<LexicalEditor | null>(null);
  // knownEntities can change asynchronously (file/plugin lists). Keep a ref so
  // the imperative handle's setText/insert paths always use the latest set
  // without re-creating the handle.
  const knownEntitiesRef = useRef(knownEntities);
  knownEntitiesRef.current = knownEntities;

  const initialConfig: InitialConfigType = {
    namespace: 'chat-composer',
    editable: true,
    nodes: [MentionNode],
    theme: EDITOR_THEME,
    onError(err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[composer-lexical]', err);
      }
    },
    // editorState intentionally omitted → empty on first paint (SSR-safe).
  };

  useImperativeHandle(
    ref,
    (): LexicalComposerInputHandle => ({
      getText() {
        const editor = editorRef.current;
        if (!editor) return '';
        // Belt-and-suspenders: collapse any stray \n\n the single-paragraph
        // model should never produce, so the wire format stays byte-stable.
        return serializeComposer(editor.getEditorState()).text.replace(
          /\n{2,}/g,
          '\n',
        );
      },
      setText(text: string) {
        const editor = editorRef.current;
        if (!editor) return;
        setComposerFromText(editor, text, knownEntitiesRef.current);
      },
      clear() {
        const editor = editorRef.current;
        if (!editor) return;
        setComposerFromText(editor, '', knownEntitiesRef.current);
      },
      focus() {
        editorRef.current?.focus();
      },
      insertMention(insert: MentionInsert) {
        const editor = editorRef.current;
        if (!editor) return;
        editor.update(() => {
          let sel = $getSelection();
          if (!$isRangeSelection(sel)) {
            $getRoot().selectEnd();
            sel = $getSelection();
          }
          if (!$isRangeSelection(sel)) return;
          deleteActiveTrigger(sel, /(^|\s)@[^\s@]*$/);
          const node = $createMentionNode({
            mentionId: insert.entity.id,
            mentionKind:
              insert.entity.kind === 'unknown' ? 'file' : insert.entity.kind,
            token: insert.token,
            label: insert.entity.label,
            title: insert.entity.title,
          });
          const active = $getSelection();
          if ($isRangeSelection(active)) {
            active.insertNodes([node]);
            const after = $getSelection();
            if ($isRangeSelection(after)) after.insertText(' ');
          }
        }, { discrete: true });
      },
      replaceActiveTrigger(text: string) {
        const editor = editorRef.current;
        if (!editor) return;
        editor.update(() => {
          let sel = $getSelection();
          if (!$isRangeSelection(sel)) {
            $getRoot().selectEnd();
            sel = $getSelection();
          }
          if (!$isRangeSelection(sel)) return;
          // Drop the active /query or @query, then insert the plain text.
          deleteActiveTrigger(sel, /(^|\s)[@/][^\s@]*$/);
          const active = $getSelection();
          if ($isRangeSelection(active)) active.insertText(text);
        }, { discrete: true });
      },
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="composer-input-editor">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              data-testid={testId}
              className="ph-no-capture composer-editable"
              aria-placeholder={placeholder}
              title={title ?? placeholder}
              role="combobox"
              aria-expanded={comboboxAria?.expanded ? 'true' : 'false'}
              aria-controls="mention-listbox"
              {...(comboboxAria?.activeId
                ? { 'aria-activedescendant': comboboxAria.activeId }
                : {})}
              placeholder={
                <div className="composer-input-placeholder">{placeholder}</div>
              }
            />
          }
          placeholder={
            <div className="composer-input-placeholder">{placeholder}</div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <EditorRefPlugin editorRef={editorRef} />
      <OnChangePlugin onChange={onChange} knownEntities={knownEntities} />
      <TriggerPlugin onTrigger={onTrigger} />
      <MentionAtomicNavigationPlugin />
      <KeyboardPlugin
        popoverOpen={popoverOpen}
        onEnterSend={onEnterSend}
        onPopoverKey={onPopoverKey}
      />
      <PastePlugin onPasteFiles={onPasteFiles} />
      <SeedingPlugin draft={draft} entities={knownEntities} />
    </LexicalComposer>
  );
});
