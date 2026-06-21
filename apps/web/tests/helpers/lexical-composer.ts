import { act } from 'react';
import { screen } from '@testing-library/react';

// Let the composer's mount-time effects (lazy fetches for plugins/skills/MCP,
// the Lexical editor attaching to the DOM) settle before driving input. A
// macrotask flush inside act() drains the pending promises + state updates so
// the editor is live and `getComposerEditor()` finds `__lexicalEditor`.
export async function flushMounts(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from 'lexical';

// jsdom cannot drive Lexical's `beforeinput`/DOM-mutation pipeline (it has no
// real editing engine), so synthetic fireEvent.change/input on the
// contenteditable is a no-op. Instead we reach the live editor instance that
// Lexical attaches to the contenteditable root element via `__lexicalEditor`
// and run a real `editor.update()`. This exercises the genuine
// trigger-detection + serialize path (the same update listeners a real
// keypress would fire), keeping these tests meaningful rather than mocking the
// popover open.

interface LexicalHost extends HTMLElement {
  __lexicalEditor?: LexicalEditor;
}

export function getComposerEditor(): LexicalEditor {
  const input = screen.getByTestId('chat-composer-input') as LexicalHost;
  const editor = input.__lexicalEditor;
  if (!editor) {
    throw new Error('chat-composer-input is not a mounted Lexical editor');
  }
  return editor;
}

// Replace the whole editor contents with `value` and place a collapsed caret
// `caret` chars in (defaults to end). Multi-line `value` is split into a single
// paragraph with LineBreakNodes so the editor matches the single-paragraph wire
// model. Plain text only — atomic mention nodes are produced by the picker
// click path (or by the host's setText round-trip through known entities), not
// by typing here.
export function typeInComposer(value: string, caret?: number): void {
  const editor = getComposerEditor();
  const lines = value.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  act(() => {
    // `discrete: true` commits the update synchronously so the TriggerPlugin /
    // OnChangePlugin update listeners (which call setMention / setDraft) fire
    // inside this `act` scope — otherwise the React state updates land outside
    // act and the popover never opens before the assertion runs.
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const p = $createParagraphNode();
        root.append(p);
        if (value.length === 0) {
          p.select();
          return;
        }
        // Single paragraph + LineBreakNode per newline — matches the composer's
        // wire model so serialization round-trips to single `\n`s.
        let lastText: ReturnType<typeof $createTextNode> | null = null;
        lines.forEach((line, i) => {
          if (i > 0) p.append($createLineBreakNode());
          if (!line) return;
          const tn = $createTextNode(line);
          p.append(tn);
          lastText = tn;
        });
        if (lastText) {
          // `caret` is an offset into the LAST line's text node. The default
          // (end of input) and any explicit value are clamped to that node's
          // length: a whole-`value` offset on a multi-line draft would overflow
          // the node, and Lexical stores it unclamped — corrupting the
          // selection the picker's deleteActiveTrigger reads back.
          const tn: ReturnType<typeof $createTextNode> = lastText;
          const pos = Math.min(caret ?? lastLine.length, lastLine.length);
          tn.select(pos, pos);
        } else {
          p.selectEnd();
        }
      },
      { discrete: true },
    );
  });
}

// Read the editor's serialized plain text. Walks paragraph children turning
// `<br>` into `\n` (jsdom's `.textContent` silently drops `<br>`), so newline
// assertions match the composer's wire format.
export function composerText(): string {
  const input = screen.getByTestId('chat-composer-input');
  const paragraphs = input.querySelectorAll('p');
  if (paragraphs.length === 0) return input.textContent ?? '';
  const lines: string[] = [];
  paragraphs.forEach((p) => {
    let line = '';
    p.childNodes.forEach((node) => {
      if (node.nodeName === 'BR') line += '\n';
      else line += node.textContent ?? '';
    });
    lines.push(line);
  });
  return lines.join('\n');
}

// Type `value` and wait for the editor's OnChange update listener to flush its
// onChange → setDraft into React state (the host's `draft` is what submit()
// reads). Lexical fires the listener synchronously under `discrete: true`, but
// the React state update may still be pending a microtask; awaiting one tick
// inside act settles it. Use this in flows that submit right after typing.
export async function typeAndSettle(value: string, caret = value.length): Promise<void> {
  typeInComposer(value, caret);
  await act(async () => {
    await Promise.resolve();
  });
}

// jsdom does not route a synthetic `fireEvent.keyDown` through Lexical's root
// keydown → command pipeline, so we dispatch KEY_ENTER_COMMAND directly with a
// synthetic KeyboardEvent. This still exercises the real KeyboardPlugin handler
// (its isComposing / shiftKey / metaKey / popoverOpen / onEnterSend branch
// logic) — only the DOM-event-to-command hop is replaced.
export function pressEnter(
  opts: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {},
): void {
  const editor = getComposerEditor();
  const event = {
    key: 'Enter',
    shiftKey: Boolean(opts.shift),
    metaKey: Boolean(opts.meta),
    ctrlKey: Boolean(opts.ctrl),
    altKey: false,
    preventDefault() {},
  } as unknown as KeyboardEvent;
  act(() => {
    editor.dispatchCommand(KEY_ENTER_COMMAND, event);
  });
}
