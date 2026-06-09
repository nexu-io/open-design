import { describe, expect, it } from 'vitest';

import { recoverHtmlArtifactFromPrecedingDocument, recoverHtmlDocumentFromMarkdownFence, recoverStandaloneHtmlDocument } from '../../src/artifacts/recover';

const completeHtml = '<!doctype html><html><head><title>Demo</title></head><body><main><h1>Recovered artifact</h1></main></body></html>';

describe('recoverHtmlArtifactFromPrecedingDocument', () => {
  it('recovers a complete HTML document emitted immediately before a prose artifact tag', () => {
    const sourceText = [
      'Here is the prototype:',
      completeHtml,
      '<artifact identifier="clay-code-longform" type="text/html" title="Clay & Code">',
      '(The complete document above is the delivered artifact.)',
      '</artifact>',
    ].join('\n');

    expect(recoverHtmlArtifactFromPrecedingDocument({
      artifactHtml: '(The complete document above is the delivered artifact.)',
      identifier: 'clay-code-longform',
      sourceText,
    })).toBe(completeHtml);
  });

  it('does not recover when the artifact body is already valid HTML', () => {
    expect(recoverHtmlArtifactFromPrecedingDocument({
      artifactHtml: completeHtml,
      identifier: 'demo',
      sourceText: `${completeHtml}\n<artifact identifier="demo">ignored</artifact>`,
    })).toBeNull();
  });

  it('does not recover non-adjacent prior HTML', () => {
    expect(recoverHtmlArtifactFromPrecedingDocument({
      artifactHtml: 'summary only',
      identifier: 'demo',
      sourceText: `${completeHtml}\nThis is an explanation.\n<artifact identifier="demo">summary only</artifact>`,
    })).toBeNull();
  });

  it('recovers the immediately preceding html document instead of an earlier doctype document', () => {
    const oldHtml = '<!doctype html><html><head><title>Old</title></head><body><main><h1>Old document</h1></main></body></html>';
    const newHtml = '<html><head><title>New</title></head><body><main><h1>New document</h1></main></body></html>';
    const sourceText = `${oldHtml}\nExplanation between drafts.\n${newHtml}\n<artifact identifier="demo" type="text/html">summary only</artifact>`;

    expect(recoverHtmlArtifactFromPrecedingDocument({
      artifactHtml: 'summary only',
      identifier: 'demo',
      sourceText,
    })).toBe(newHtml);
  });

  it('ignores a stray doctype mention before the immediately preceding html document', () => {
    const html = '<html><head><title>Final</title></head><body><main><h1>Final document</h1></main></body></html>';
    const sourceText = `Mention <!doctype html> in prose.\n${html}\n<artifact identifier="demo" type="text/html">summary only</artifact>`;

    expect(recoverHtmlArtifactFromPrecedingDocument({
      artifactHtml: 'summary only',
      identifier: 'demo',
      sourceText,
    })).toBe(html);
  });
});

describe('recoverStandaloneHtmlDocument', () => {
  it('recovers a response that is itself a complete HTML document', () => {
    expect(recoverStandaloneHtmlDocument(`\n${completeHtml}\n`)).toBe(completeHtml);
  });

  it('does not recover HTML embedded in prose', () => {
    expect(recoverStandaloneHtmlDocument(`Here is the page:\n${completeHtml}`)).toBeNull();
  });

  it('does not recover a document followed by trailing prose', () => {
    expect(recoverStandaloneHtmlDocument(`${completeHtml}\nI also updated the layout.`)).toBeNull();
  });

  it('does not recover partial snippets', () => {
    expect(recoverStandaloneHtmlDocument('<main><h1>Snippet</h1></main>')).toBeNull();
  });

  it('does not recover document-shaped output missing a closing html tag', () => {
    expect(recoverStandaloneHtmlDocument('<!doctype html><html><body><main><h1>Missing close</h1></main></body>')).toBeNull();
  });
});

describe('recoverHtmlDocumentFromMarkdownFence', () => {
  it('recovers a single complete html fenced code block from prose', () => {
    expect(recoverHtmlDocumentFromMarkdownFence([
      '明白了，这是落地页原型。',
      '',
      '```html',
      completeHtml,
      '```',
    ].join('\n'))).toBe(completeHtml);
  });

  it('does not recover non-html fences or partial html snippets', () => {
    expect(recoverHtmlDocumentFromMarkdownFence(['```ts', completeHtml, '```'].join('\n'))).toBeNull();
    expect(recoverHtmlDocumentFromMarkdownFence('```html\n<main><h1>Snippet</h1></main>\n```')).toBeNull();
  });

  it('does not guess when multiple complete html fences are present', () => {
    expect(recoverHtmlDocumentFromMarkdownFence([
      '```html',
      completeHtml,
      '```',
      '```html',
      completeHtml.replace('Demo', 'Second'),
      '```',
    ].join('\n'))).toBeNull();
  });
});
