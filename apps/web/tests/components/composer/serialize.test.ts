import { describe, expect, it } from 'vitest';
import { createEditor, $getRoot } from 'lexical';

import { MentionNode } from '../../../src/components/composer/MentionNode';
import { serializeComposer } from '../../../src/components/composer/serialize';
import { setComposerFromText } from '../../../src/components/composer/deserialize';
import type { InlineMentionEntity } from '../../../src/utils/inlineMentions';

// Headless Lexical editor — no DOM required. `createEditor` runs purely in
// memory, so these specs stay in the default `node` test environment.
function makeEditor() {
  return createEditor({
    namespace: 'serialize-test',
    nodes: [MentionNode],
    onError(err) {
      throw err;
    },
  });
}

const FILE_ENTITY: InlineMentionEntity = {
  id: 'designs/landing.html',
  kind: 'file',
  label: 'designs/landing.html',
  token: '@designs/landing.html',
  title: 'File: designs/landing.html',
};

const MCP_ENTITY: InlineMentionEntity = {
  id: 'slack',
  kind: 'mcp',
  label: 'Slack MCP',
  token: '@Slack MCP',
  title: 'MCP: Slack MCP',
};

const SKILL_ENTITY: InlineMentionEntity = {
  id: 'deck-builder',
  kind: 'skill',
  label: 'Deck Builder',
  token: '@Deck Builder',
};

describe('serializeComposer / setComposerFromText round-trip', () => {
  it('keeps a plain prompt with no mentions byte-identical', () => {
    const editor = makeEditor();
    setComposerFromText(editor, 'hello world', []);
    const result = serializeComposer(editor.getEditorState());
    expect(result.text).toBe('hello world');
    expect(result.present).toHaveLength(0);
  });

  it('round-trips a known file mention as a single @token plus trailing text', () => {
    const editor = makeEditor();
    const text = 'Use @designs/landing.html now';
    setComposerFromText(editor, text, [FILE_ENTITY]);
    const result = serializeComposer(editor.getEditorState());
    expect(result.text).toBe(text);
    expect(result.present).toHaveLength(1);
    expect(result.present[0]?.id).toBe('designs/landing.html');
    expect(result.present[0]?.kind).toBe('file');
  });

  it('preserves a Shift+Enter newline as a single \\n (no \\n\\n gap)', () => {
    const editor = makeEditor();
    // The exact shape a Shift+Enter produces: one LineBreakNode inside the
    // single paragraph. It must serialize back to a single `\n`.
    const text = '@designs/landing.html hi\nworld';
    setComposerFromText(editor, text, [FILE_ENTITY]);
    expect(serializeComposer(editor.getEditorState()).text).toBe(text);
  });

  it('preserves multi-newline spacing around a mention (no \\n collapse)', () => {
    const editor = makeEditor();
    const text = 'Plan:\n\n@designs/landing.html \n\nKeep spacing';
    setComposerFromText(editor, text, [FILE_ENTITY]);
    expect(serializeComposer(editor.getEditorState()).text).toBe(text);
  });

  it('emits the MCP token text verbatim including the space inside the label', () => {
    const editor = makeEditor();
    setComposerFromText(editor, '@Slack MCP ', [MCP_ENTITY]);
    const result = serializeComposer(editor.getEditorState());
    expect(result.text).toBe('@Slack MCP ');
    expect(result.present[0]?.id).toBe('slack');
    expect(result.present[0]?.kind).toBe('mcp');
  });

  it('round-trips a skill mention carrying its real id', () => {
    const editor = makeEditor();
    setComposerFromText(editor, 'Plan with @Deck Builder please', [SKILL_ENTITY]);
    const result = serializeComposer(editor.getEditorState());
    expect(result.text).toBe('Plan with @Deck Builder please');
    expect(result.present).toHaveLength(1);
    expect(result.present[0]?.id).toBe('deck-builder');
    expect(result.present[0]?.kind).toBe('skill');
  });

  it('keeps unknown @tokens as plain text (not a MentionNode)', () => {
    const editor = makeEditor();
    setComposerFromText(editor, 'hi @nobody there', [FILE_ENTITY]);
    const result = serializeComposer(editor.getEditorState());
    expect(result.text).toBe('hi @nobody there');
    expect(result.present).toHaveLength(0);
  });

  it('builds a single root paragraph (no \\n\\n block join)', () => {
    const editor = makeEditor();
    setComposerFromText(editor, 'line one\nline two', []);
    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1);
    });
    expect(serializeComposer(editor.getEditorState()).text).toBe('line one\nline two');
  });
});

describe('MentionNode atomic behaviour', () => {
  it('reports token text as its node text content and stays token mode', () => {
    const editor = makeEditor();
    setComposerFromText(editor, '@designs/landing.html', [FILE_ENTITY]);
    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      const mention =
        para && 'getFirstChild' in para
          ? (para as unknown as { getFirstChild: () => unknown }).getFirstChild()
          : null;
      expect(mention).toBeInstanceOf(MentionNode);
      expect((mention as MentionNode).getTextContent()).toBe('@designs/landing.html');
      expect((mention as MentionNode).getToken()).toBe('@designs/landing.html');
      expect((mention as MentionNode).getMode()).toBe('token');
    });
  });
});
