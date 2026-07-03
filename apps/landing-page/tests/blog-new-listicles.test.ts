import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function read(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

function frontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'expected frontmatter block');
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].replace(/^"|"$/g, '')]),
  );
}

test('blog index registers the new AI design and prototyping listicles', () => {
  const index = read('app/pages/blog/index.astro');
  const expected = [
    {
      id: 'ai-design-agents',
      file: 'app/content/blog/ai-design-agents.md',
      cover: 'public/blog/ai-design-agents-cover.webp',
      title: 'Best AI Design Agents in 2026: An Honest, Tested Guide',
      summaryNeedle: 'AI design agent',
    },
    {
      id: 'ai-prototyping-tools',
      file: 'app/content/blog/ai-prototyping-tools.md',
      cover: 'public/blog/ai-prototyping-tools-cover.webp',
      title: 'Best AI Prototyping Tools in 2026: An Honest, Tested Guide',
      summaryNeedle: 'AI prototyping',
    },
  ];

  for (const post of expected) {
    const markdown = read(post.file);
    const meta = frontmatter(markdown);
    assert.equal(meta.title, post.title);
    assert.equal(meta.category, 'Guides');
    assert.match(meta.summary, new RegExp(post.summaryNeedle, 'i'));

    assert.match(index, new RegExp(`['"]${post.id}['"]`));
    assert.match(index, new RegExp(`/blog/${post.id}-cover\\.webp`));
    assert.ok(statSync(resolve(root, post.cover)).size > 10_000, `${post.cover} should be a real cover asset`);
  }
});
