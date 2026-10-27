import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/api/chat';
import {
  matchPersistedArtifactFile,
  parseArtifactAttrs,
  persistedArtifactFilesOf,
  summarizeArtifactsForTranscript,
} from '../src/artifacts/artifact-transcript';

type ProducedFile = NonNullable<ChatMessage['producedFiles']>[number];

function savedFile(name: string, identifier?: string): ProducedFile {
  return {
    name, path: name, size: 100, mtime: 1, kind: 'html', mime: 'text/html',
    artifactManifest: {
      version: 1, kind: 'html', title: 'Saved page', entry: name,
      renderer: 'html', exports: [],
      ...(identifier ? { metadata: { identifier } } : {}),
    },
  };
}

const PAGE = '<artifact identifier="page" type="text/html" title="Page"><html>only surviving body</html></artifact>';
const SAVED_PAGE = [{ name: 'page.html', identifier: 'page' }];

describe('artifact transcript summaries', () => {
  it('replaces a confirmed large artifact with its file reference and keeps surrounding prose', () => {
    const input = `Before.\n<artifact identifier="page" type="text/html" title="Page">${'<div>page body</div>'.repeat(2000)}</artifact>\nAfter.`;
    const result = summarizeArtifactsForTranscript(input, SAVED_PAGE);
    expect(result).toContain('Before.');
    expect(result).toContain('After.');
    expect(result).toContain('identifier="page"');
    expect(result).toContain('title="Page"');
    expect(result).toContain('type="text/html"');
    expect(result).toContain('project file "page.html"');
    expect(result).not.toContain('page body');
    expect(result).not.toContain('</artifact>');
  });

  it('keeps the only surviving body when saving failed or no matching file exists', () => {
    expect(summarizeArtifactsForTranscript(PAGE, [])).toBe(PAGE);
    expect(summarizeArtifactsForTranscript(PAGE, [{ name: 'other.html', identifier: 'other' }])).toBe(PAGE);
  });

  it('does not truncate an unconfirmed large artifact or its trailing constraints', () => {
    const input = `<artifact identifier="page" type="text/html">${'x'.repeat(20_000)}</artifact>\nKeep the page blue.`;
    expect(summarizeArtifactsForTranscript(input, [{ name: 'other.html', identifier: 'other' }])).toBe(input);
  });

  it('summarizes only the confirmed block when another save failed', () => {
    const unsaved = '<artifact identifier="draft" type="text/html">unfinished draft</artifact>';
    const result = summarizeArtifactsForTranscript(`${PAGE}\n${unsaved}`, SAVED_PAGE);
    expect(result).not.toContain('only surviving body');
    expect(result).toContain(unsaved);
  });

  it.each([
    `Example: \`${PAGE}\``,
    `Example: \`\`${PAGE}\`\``,
    `Example:\n\n\`\`\`html\n${PAGE}\n\`\`\`\nEnd.`,
    `Example:\n\n\`\`\`html\n${PAGE}`,
    `Example:\n\n\`\`\`html\n${PAGE}\n\`\`\``,
  ])('preserves Markdown artifact examples: %s', input => {
    expect(summarizeArtifactsForTranscript(input, SAVED_PAGE)).toBe(input);
  });

  it('keeps an unclosed artifact and its trailing text even with save evidence', () => {
    const input = '<artifact identifier="page" type="text/html"><html>partial body';
    expect(summarizeArtifactsForTranscript(input, SAVED_PAGE)).toBe(input);
  });

  it('ignores prefix-shared artifact-looking words', () => {
    const input = 'Before <artifactual identifier="page">literal</artifact> after.';
    expect(summarizeArtifactsForTranscript(input, SAVED_PAGE)).toBe(input);
  });

  it('keeps inline-code ownership across horizontal-rule-shaped paragraph lines', () => {
    const input = `intro \`\n---\n${PAGE}\n---\nclosing \``;
    expect(summarizeArtifactsForTranscript(input, SAVED_PAGE)).toBe(input);
  });

  it('does not pair stray backticks across a blank-line paragraph boundary', () => {
    const input = `intro \`\n\n${PAGE}\n\nclosing \``;
    const result = summarizeArtifactsForTranscript(input, SAVED_PAGE);
    expect(result).toContain('intro `');
    expect(result).toContain('closing `');
    expect(result).toContain('project file "page.html"');
    expect(result).not.toContain('only surviving body');
  });

  it.each([
    ['text/css', 'theme', 'theme.css'],
    ['image/svg+xml', 'logo', 'logo.svg'],
    ['text/markdown', 'brief', 'brief.md'],
    ['text/tsx', 'component', 'component.tsx'],
    ['text/react', 'react-view', 'react-view.jsx'],
  ])('matches saved %s artifacts by their established file name', (type, identifier, name) => {
    const input = `<artifact identifier="${identifier}" type="${type}">saved content</artifact>`;
    const result = summarizeArtifactsForTranscript(input, [{ name }]);
    expect(result).toContain(`project file "${name}"`);
    expect(result).not.toContain('saved content');
  });
});

describe('artifact save evidence', () => {
  it('accepts explicit artifact manifests, including legacy manifests without identifier', () => {
    expect(persistedArtifactFilesOf({ producedFiles: [savedFile('page-3.html', 'page'), savedFile('legacy.html')] }))
      .toEqual([{ name: 'page-3.html', identifier: 'page' }, { name: 'legacy.html', identifier: undefined }]);
    expect(persistedArtifactFilesOf({})).toEqual([]);
  });

  it.each(['no manifest', 'inferred manifest'] as const)('keeps a failed artifact save despite a same-named tool file with %s', variant => {
    const file = savedFile('page.html', 'page');
    if (variant === 'no manifest') delete file.artifactManifest;
    else file.artifactManifest!.metadata = { inferred: true, identifier: 'page' };
    const refs = persistedArtifactFilesOf({ producedFiles: [file] });
    expect(refs).toEqual([]);
    expect(summarizeArtifactsForTranscript(PAGE, refs)).toBe(PAGE);
  });

  it('matches a manifest identifier after collision suffix renames', () => {
    expect(matchPersistedArtifactFile({ identifier: 'page', type: 'text/html' }, [{ name: 'page-3.html', identifier: 'page' }]))
      .toEqual({ name: 'page-3.html', identifier: 'page' });
  });

  it('retains legacy matching by the derived suffixed filename', () => {
    expect(matchPersistedArtifactFile({ identifier: 'Page view', type: 'text/html' }, [{ name: 'page-view-2.html' }]))
      .toEqual({ name: 'page-view-2.html' });
  });

  it('parses the existing single- and double-quoted metadata shapes', () => {
    expect(parseArtifactAttrs('<artifact identifier="page" type=\'text/html\' title="Page">'))
      .toEqual({ identifier: 'page', type: 'text/html', title: 'Page' });
  });
});
