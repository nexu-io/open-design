// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
} from '../../../src/components/composer/LexicalComposerInput';
import { $isMentionNode } from '../../../src/components/composer/MentionNode';
import type { InlineMentionEntity } from '../../../src/utils/inlineMentions';

const KNOWN: InlineMentionEntity[] = [
  { id: 'deck-builder', kind: 'skill', label: 'Deck Builder', token: '@Deck Builder' },
  {
    id: 'designs/landing.html',
    kind: 'file',
    label: 'designs/landing.html',
    token: '@designs/landing.html',
  },
];

type Props = ComponentProps<typeof LexicalComposerInput>;

function setup(overrides: Partial<Props> = {}) {
  const onChange = vi.fn();
  const onTrigger = vi.fn();
  const onEnterSend = vi.fn();
  const onPopoverKey = vi.fn(() => false);
  const ref = { current: null as LexicalComposerInputHandle | null };
  const props: Props = {
    placeholder: 'Message',
    draft: '',
    knownEntities: KNOWN,
    onChange,
    onTrigger,
    onEnterSend,
    onPopoverKey,
    popoverOpen: false,
    ...overrides,
  };
  const utils = render(<LexicalComposerInput ref={ref} {...props} />);
  return { ref, onChange, onTrigger, onEnterSend, onPopoverKey, ...utils };
}

afterEach(() => {
  cleanup();
});

describe('LexicalComposerInput', () => {
  it('mounts the contenteditable with the expected testid', () => {
    const { getByTestId } = setup();
    const editable = getByTestId('chat-composer-input');
    expect(editable.getAttribute('contenteditable')).toBe('true');
    expect(editable.className).toContain('composer-editable');
    expect(editable.className).toContain('ph-no-capture');
  });

  it('seeds from the draft prop and renders known @tokens as atomic pills', async () => {
    const { getByTestId } = setup({ draft: 'Use @designs/landing.html now' });
    await waitFor(() => {
      const pill = getByTestId('chat-composer-input').querySelector(
        '.composer-inline-mention',
      );
      expect(pill?.textContent).toBe('@designs/landing.html');
      expect(pill?.className).toContain('composer-inline-mention--file');
    });
    // The serialized text round-trips byte-identically through getText().
    expect(getByTestId('chat-composer-input').textContent).toContain(
      '@designs/landing.html',
    );
  });

  it('exposes a getText() that round-trips the seeded draft', async () => {
    const { ref } = setup({ draft: 'hello @Deck Builder world' });
    await waitFor(() => expect(ref.current).not.toBeNull());
    expect(ref.current?.getText()).toBe('hello @Deck Builder world');
  });

  it('insertMention adds an atomic pill carrying the real id', async () => {
    const { ref, getByTestId } = setup();
    await waitFor(() => expect(ref.current).not.toBeNull());
    act(() => {
      ref.current?.insertMention({
        token: '@Deck Builder',
        entity: { id: 'deck-builder', kind: 'skill', label: 'Deck Builder' },
      });
    });
    await waitFor(() => {
      const pill = getByTestId('chat-composer-input').querySelector(
        '.composer-inline-mention--skill',
      );
      expect(pill?.textContent).toBe('@Deck Builder');
    });
    expect(ref.current?.getText()).toBe('@Deck Builder ');
  });

  it('clear() empties the editor', async () => {
    const { ref } = setup({ draft: 'something' });
    await waitFor(() => expect(ref.current?.getText()).toBe('something'));
    act(() => ref.current?.clear());
    await waitFor(() => expect(ref.current?.getText()).toBe(''));
  });

  // Reach the live editor instance Lexical attaches to the contenteditable
  // root, so the gesture below runs through the real React-mounted pipeline
  // (reconciler createDOM/updateDOM on the cloned node + the OnChange/Trigger
  // update listeners), not a bare createEditor() like the node-level unit test.
  function liveEditor(host: HTMLElement): LexicalEditor {
    const editor = (host as HTMLElement & { __lexicalEditor?: LexicalEditor })
      .__lexicalEditor;
    expect(editor).toBeTruthy();
    return editor!;
  }

  function findMention(para: LexicalNode | null) {
    return $isElementNode(para)
      ? (para.getChildren().find((c) => $isMentionNode(c)) ?? null)
      : null;
  }

  function keyEvent(key: string): KeyboardEvent {
    return {
      key,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
  }

  function selectionAnchor(editor: LexicalEditor): {
    text: string;
    offset: number;
  } {
    let snapshot = { text: '', offset: -1 };
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if (!$isRangeSelection(selection)) return;
      snapshot = {
        text: selection.anchor.getNode().getTextContent(),
        offset: selection.anchor.offset,
      };
    });
    return snapshot;
  }

  it('deleting a mention pill through the live editor does not stack-overflow (token-mode clone regression)', async () => {
    // The user-facing repro for the MentionNode constructor-recursion crash:
    // seed a pill, then Backspace over it. A backward delete-character on an
    // atomic token clones the EXISTING MentionNode via getWritable and
    // reconciles its removal — the exact path that used to recurse
    // setMode → getWritable → clone → constructor → setMode → "Maximum call
    // stack size exceeded". This drives it end-to-end through the mounted
    // editor, complementing MentionNode.test.ts's node-level getWritable guard.
    const { getByTestId, ref } = setup({ draft: 'Use @designs/landing.html now' });
    const host = getByTestId('chat-composer-input');
    await waitFor(() =>
      expect(host.querySelector('.composer-inline-mention')).not.toBeNull(),
    );
    const editor = liveEditor(host);

    expect(() => {
      act(() => {
        editor.update(
          () => {
            const mention = findMention($getRoot().getFirstChild());
            // Removing the atomic token is what Backspace ultimately performs
            // on it. `remove()` clones the EXISTING node via getWritable (the
            // recursion trigger) and reconciles the span removal — deterministic
            // in jsdom, unlike a DOM-selection-driven deleteCharacter.
            mention?.remove();
          },
          { discrete: true },
        );
      });
    }).not.toThrow();

    await waitFor(() =>
      expect(host.querySelector('.composer-inline-mention')).toBeNull(),
    );
    expect(ref.current?.getText()).not.toContain('@designs/landing.html');
  });

  it('moving the caret across a mention (selection-only) does not re-fire onChange or corrupt the text', async () => {
    // The "操作光标" worry: arrow-stepping a collapsed caret onto/across the
    // atomic pill is a selection-only update. OnChangePlugin is dirty-guarded
    // (empty dirtyElements + dirtyLeaves → bail), so it must NOT re-serialize,
    // re-fold the entity list, or reseed — the caret move stays free and the
    // serialized text is untouched. (TriggerPlugin still runs; it just reports
    // no @/slash trigger for a caret sitting on a MentionNode.)
    const { getByTestId, onChange, ref } = setup({
      draft: 'Use @designs/landing.html now',
    });
    const host = getByTestId('chat-composer-input');
    await waitFor(() =>
      expect(host.querySelector('.composer-inline-mention')).not.toBeNull(),
    );
    const editor = liveEditor(host);
    const callsAfterSeed = onChange.mock.calls.length;
    const before = ref.current?.getText();

    expect(() => {
      act(() => {
        editor.update(
          () => {
            const mention = findMention($getRoot().getFirstChild());
            // Collapsed caret at the pill's leading edge — what ArrowLeft onto
            // the token produces. No text mutation.
            if ($isTextNode(mention)) mention.select(0, 0);
          },
          { discrete: true },
        );
      });
    }).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });

    // No new onChange for a pure caret move, and the text round-trips unchanged.
    expect(onChange.mock.calls.length).toBe(callsAfterSeed);
    expect(ref.current?.getText()).toBe(before);
  });

  it('skips the whole mention pill with one left or right arrow step', async () => {
    const { getByTestId } = setup({
      draft: 'Use @designs/landing.html now',
    });
    const host = getByTestId('chat-composer-input');
    await waitFor(() =>
      expect(host.querySelector('.composer-inline-mention')).not.toBeNull(),
    );
    const editor = liveEditor(host);

    act(() => {
      editor.update(
        () => {
          const mention = findMention($getRoot().getFirstChild());
          if ($isTextNode(mention)) {
            const offset = mention.getTextContentSize();
            mention.select(offset, offset);
          }
        },
        { discrete: true },
      );
    });
    const left = keyEvent('ArrowLeft');
    act(() => {
      editor.dispatchCommand(KEY_ARROW_LEFT_COMMAND, left);
    });
    expect(left.preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(selectionAnchor(editor)).toEqual({ text: 'Use ', offset: 4 }),
    );

    const right = keyEvent('ArrowRight');
    act(() => {
      editor.dispatchCommand(KEY_ARROW_RIGHT_COMMAND, right);
    });
    expect(right.preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const afterChip = selectionAnchor(editor);
      expect(afterChip).toEqual({
        text: '@designs/landing.html',
        offset: '@designs/landing.html'.length,
      });
    });

    const leftAgain = keyEvent('ArrowLeft');
    act(() => {
      editor.dispatchCommand(KEY_ARROW_LEFT_COMMAND, leftAgain);
    });
    expect(leftAgain.preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(selectionAnchor(editor)).toEqual({ text: 'Use ', offset: 4 }),
    );
  });

  it('removes a whole mention pill with Backspace from the boundary after it', async () => {
    const { getByTestId, ref } = setup({
      draft: 'Use @designs/landing.html now',
    });
    const backspaceHost = getByTestId('chat-composer-input');
    await waitFor(() =>
      expect(backspaceHost.querySelector('.composer-inline-mention')).not.toBeNull(),
    );
    const backspaceEditor = liveEditor(backspaceHost);
    act(() => {
      backspaceEditor.update(
        () => {
          const mention = findMention($getRoot().getFirstChild());
          const next = mention?.getNextSibling();
          if ($isTextNode(next)) next.select(0, 0);
        },
        { discrete: true },
      );
    });
    const backspace = keyEvent('Backspace');
    act(() => {
      backspaceEditor.dispatchCommand(KEY_BACKSPACE_COMMAND, backspace);
    });
    expect(backspace.preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(backspaceHost.querySelector('.composer-inline-mention')).toBeNull(),
    );
    expect(ref.current?.getText()).not.toContain('@designs/landing.html');
  });

  it('removes a whole mention pill with Delete from the boundary before it', async () => {
    const { getByTestId, ref } = setup({
      draft: 'Use @designs/landing.html now',
    });
    const deleteHost = getByTestId('chat-composer-input');
    await waitFor(() =>
      expect(deleteHost.querySelector('.composer-inline-mention')).not.toBeNull(),
    );
    const deleteEditor = liveEditor(deleteHost);
    act(() => {
      deleteEditor.update(
        () => {
          const mention = findMention($getRoot().getFirstChild());
          const previous = mention?.getPreviousSibling();
          if ($isTextNode(previous)) {
            const offset = previous.getTextContentSize();
            previous.select(offset, offset);
          }
        },
        { discrete: true },
      );
    });
    const deleteEvent = keyEvent('Delete');
    act(() => {
      deleteEditor.dispatchCommand(KEY_DELETE_COMMAND, deleteEvent);
    });
    expect(deleteEvent.preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(deleteHost.querySelector('.composer-inline-mention')).toBeNull(),
    );
    expect(ref.current?.getText()).not.toContain('@designs/landing.html');
  });

  // TODO(lexical-jsdom): jsdom can't make `editor.isComposing()` return true.
  // Lexical flips its internal composition key only from the real browser
  // compositionstart → beforeinput → compositionend pipeline, which jsdom's
  // synthetic CompositionEvent / keyDown does not drive. The #2851 guard
  // itself (`if (editor.isComposing()) return false` at the top of every
  // KeyboardPlugin command) lives in source and must be confirmed against a
  // real IME (Chinese pinyin) via Playwright / human verification — see
  // blueprint risk R1. The plain-Enter test below covers the non-composing
  // branch of the same handler.
  it.skip('does NOT call onEnterSend when Enter fires during IME composition (#2851 guard)', () => {
    // Intentionally skipped — see TODO above.
  });

  it('calls onEnterSend on a plain Enter outside composition', async () => {
    const { onEnterSend, getByTestId } = setup({ draft: 'hi' });
    const editable = getByTestId('chat-composer-input') as HTMLElement & {
      __lexicalEditor?: import('lexical').LexicalEditor;
    };
    // jsdom does not route a synthetic keyDown through Lexical's root
    // keydown → command pipeline, so we dispatch KEY_ENTER_COMMAND directly.
    // This still exercises the real KeyboardPlugin handler (its isComposing /
    // shiftKey / metaKey / popoverOpen / onEnterSend branch logic) — only the
    // DOM-event-to-command hop is replaced.
    const editor = editable.__lexicalEditor;
    expect(editor).toBeTruthy();
    const enterEvent = {
      key: 'Enter',
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault() {},
    } as unknown as KeyboardEvent;
    act(() => {
      editor?.dispatchCommand(KEY_ENTER_COMMAND, enterEvent);
    });
    await waitFor(() => expect(onEnterSend).toHaveBeenCalledTimes(1));
  });
});
