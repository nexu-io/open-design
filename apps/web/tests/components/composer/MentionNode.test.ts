// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from 'lexical';

import {
  MentionNode,
  $createMentionNode,
  $isMentionNode,
} from '../../../src/components/composer/MentionNode';

function makeEditor(): LexicalEditor {
  return createEditor({
    namespace: 'mention-node-test',
    nodes: [MentionNode],
    onError: (e) => {
      throw e;
    },
  });
}

describe('MentionNode', () => {
  it('uses the @token as its text content so the wire format is free', () => {
    const editor = makeEditor();
    editor.update(
      () => {
        const node = $createMentionNode({
          mentionId: 'deck-builder',
          mentionKind: 'skill',
          token: '@Deck Builder',
          label: 'Deck Builder',
        });
        expect(node.getTextContent()).toBe('@Deck Builder');
        expect(node.getToken()).toBe('@Deck Builder');
        expect($isMentionNode(node)).toBe(true);
        expect(node.isToken()).toBe(true);
        expect(node.getMode()).toBe('token');
        expect(node.canInsertTextBefore()).toBe(true);
        expect(node.canInsertTextAfter()).toBe(true);
      },
      { discrete: true },
    );
  });

  it('exposes the backing entity (id/kind/label/title)', () => {
    const editor = makeEditor();
    editor.update(
      () => {
        const node = $createMentionNode({
          mentionId: 'slack',
          mentionKind: 'mcp',
          token: '@Slack MCP',
          label: 'Slack MCP',
          title: 'MCP: Slack MCP',
        });
        expect(node.getEntity()).toEqual({
          id: 'slack',
          kind: 'mcp',
          label: 'Slack MCP',
          token: '@Slack MCP',
          title: 'MCP: Slack MCP',
        });
      },
      { discrete: true },
    );
  });

  it('round-trips through export/import JSON', () => {
    const editor = makeEditor();
    editor.update(
      () => {
        const node = $createMentionNode({
          mentionId: 'designs/x.html',
          mentionKind: 'file',
          token: '@designs/x.html',
          label: 'designs/x.html',
        });
        const json = node.exportJSON();
        expect(json.type).toBe('composer-mention');
        expect(json.mentionId).toBe('designs/x.html');
        const clone = MentionNode.importJSON(json);
        expect(clone.getEntity()).toEqual(node.getEntity());
      },
      { discrete: true },
    );
  });

  it('survives cloning an existing node without recursing (token-mode regression)', () => {
    // Regression: the constructor used to call `this.setMode('token')`, which
    // recurses setMode → getWritable → clone() → new MentionNode → setMode …
    // whenever Lexical clones an EXISTING mention node. That happens on every
    // mention delete / range-select, so the editor crashed with a
    // "Maximum call stack size exceeded" RangeError. Token mode now lives in
    // $createMentionNode and clones inherit it via TextNode.afterCloneFrom.
    const editor = makeEditor();
    let key = '';
    editor.update(
      () => {
        const p = $createParagraphNode();
        const node = $createMentionNode({
          mentionId: 'p1',
          mentionKind: 'plugin',
          token: '@Deck',
          label: 'Deck',
        });
        p.append(node);
        $getRoot().clear();
        $getRoot().append(p);
        key = node.getKey();
      },
      { discrete: true },
    );

    // A second update that mutates the existing node forces Lexical to clone
    // it through getWritable — the exact path that used to stack-overflow.
    expect(() =>
      editor.update(
        () => {
          const node = $getNodeByKey(key);
          if ($isMentionNode(node)) node.getWritable();
        },
        { discrete: true },
      ),
    ).not.toThrow();

    editor.getEditorState().read(() => {
      const node = $getNodeByKey(key);
      expect($isMentionNode(node)).toBe(true);
      // Narrow via the type guard so `getMode` (a TextNode method) is in scope.
      expect($isMentionNode(node) ? node.getMode() : null).toBe('token');
    });
  });

  it('renders a kind-scoped pill span in the DOM when mounted in an editor', () => {
    // `createDOM` requires the reconciler's active-editor DOM context, so drive
    // it through a real mounted editor + root element rather than calling
    // createDOM() in isolation. The reconciler renders the MentionNode's span
    // with the kind class + data attributes.
    const root = document.createElement('div');
    document.body.appendChild(root);
    const editor = makeEditor();
    editor.setRootElement(root);
    editor.update(
      () => {
        const p = $createParagraphNode();
        p.append(
          $createMentionNode({
            mentionId: 'p1',
            mentionKind: 'plugin',
            token: '@Deck',
            label: 'Deck',
          }),
        );
        $getRoot().clear();
        $getRoot().append(p);
      },
      { discrete: true },
    );
    const pill = root.querySelector('.composer-inline-mention');
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain('composer-inline-mention--plugin');
    expect(pill?.getAttribute('data-mention-id')).toBe('p1');
    expect(pill?.getAttribute('data-mention-kind')).toBe('plugin');
    expect(pill?.getAttribute('contenteditable')).toBe('false');
    expect(pill?.textContent).toBe('@Deck');
    editor.setRootElement(null);
    root.remove();
  });

  it('re-stamps a mounted connector pill hue when the live theme flips', async () => {
    // Regression: applyBrandHue only ran from createDOM / node mutation, so a
    // connector pill inserted in light mode kept its near-black light hue after
    // a live theme switch — dark-on-dark, unreadable text in dark mode. The
    // theme observer must recompute --m-hue when <html data-theme> changes.
    const parseHex = (hex: string): { r: number; g: number; b: number } => {
      const int = parseInt(hex.replace('#', ''), 16);
      return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
    };
    const luminance = (hex: string): number => {
      const { r, g, b } = parseHex(hex);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };

    const prevTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'light');

    const root = document.createElement('div');
    document.body.appendChild(root);
    const editor = makeEditor();
    editor.setRootElement(root);
    editor.update(
      () => {
        const p = $createParagraphNode();
        p.append(
          $createMentionNode({
            // Notion's curated brand is near-black (#0B0B0B) in light mode.
            mentionId: 'notion',
            mentionKind: 'connector',
            token: '@Notion',
            label: 'Notion',
          }),
        );
        $getRoot().clear();
        $getRoot().append(p);
      },
      { discrete: true },
    );

    const pill = root.querySelector<HTMLElement>('.composer-inline-mention--connector');
    expect(pill).not.toBeNull();
    expect(pill?.getAttribute('data-mention-label')).toBe('Notion');
    const lightHue = pill!.style.getPropertyValue('--m-hue').trim();
    expect(lightHue).toMatch(/^#[0-9a-fA-F]{6}$/i);
    const lightLum = luminance(lightHue);

    // Flip to dark mode. jsdom delivers MutationObserver callbacks on a
    // microtask, so let the queue drain before reading the re-stamped hue.
    document.documentElement.setAttribute('data-theme', 'dark');
    await Promise.resolve();
    const darkHue = pill!.style.getPropertyValue('--m-hue').trim();
    expect(darkHue).toMatch(/^#[0-9a-fA-F]{6}$/i);
    expect(darkHue).not.toBe(lightHue);
    expect(luminance(darkHue)).toBeGreaterThan(lightLum);

    editor.setRootElement(null);
    root.remove();
    if (prevTheme === null) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', prevTheme);
  });
});
