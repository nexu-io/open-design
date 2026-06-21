import { act } from 'react';
import { screen } from '@testing-library/react';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
} from 'lexical';

// HomeHero now embeds the same Lexical editor as the project composer, so its
// `home-hero-input` test hook is a contenteditable, not a <textarea>. These
// helpers mirror tests/helpers/lexical-composer.ts: they reach the live
// editor Lexical attaches to the root element (`__lexicalEditor`) and run a
// real `editor.update()` so the genuine OnChange/Trigger listeners fire,
// rather than a no-op synthetic `fireEvent.change` on a contenteditable.

interface LexicalHost extends HTMLElement {
  __lexicalEditor?: LexicalEditor;
}

export function getHomeHeroEditor(): LexicalEditor {
  const input = screen.getByTestId('home-hero-input') as LexicalHost;
  const editor = input.__lexicalEditor;
  if (!editor) {
    throw new Error('home-hero-input is not a mounted Lexical editor');
  }
  return editor;
}

// Replace the editor contents with `value`, caret at end. Multi-line input is
// modeled as a single paragraph with LineBreakNodes (the composer wire model).
export function setHomeHeroPrompt(value: string): void {
  const editor = getHomeHeroEditor();
  const lines = value.split('\n');
  act(() => {
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
        let lastText: ReturnType<typeof $createTextNode> | null = null;
        lines.forEach((line, i) => {
          if (i > 0) p.append($createLineBreakNode());
          if (!line) return;
          const tn = $createTextNode(line);
          p.append(tn);
          lastText = tn;
        });
        if (lastText) {
          const tn: ReturnType<typeof $createTextNode> = lastText;
          const len = (lines[lines.length - 1] ?? '').length;
          tn.select(len, len);
        } else {
          p.selectEnd();
        }
      },
      { discrete: true },
    );
  });
}

// Read the editor's serialized plain text. Walks paragraph children turning
// `<br>` into `\n` so newline assertions match the wire format (jsdom's
// `.textContent` silently drops `<br>`).
export function homeHeroPromptText(): string {
  const input = screen.getByTestId('home-hero-input');
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
