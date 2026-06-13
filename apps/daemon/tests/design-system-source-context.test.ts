import { describe, expect, it } from 'vitest';

import {
  collectDesignSystemSourceContext,
  mergeSourceContextIntoInput,
  type FetchLike,
} from '../src/design-system-source-context.js';

describe('design system source context', () => {
  it('reads GitHub metadata, README, and package context', async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url === 'https://api.github.com/repos/acme/product') {
        return jsonResponse({
          description: 'Acme product UI repository.',
          homepage: 'https://acme.example',
          default_branch: 'trunk',
          language: 'TypeScript',
          stargazers_count: 42,
          topics: ['design-system', 'dashboard'],
        });
      }
      if (url === 'https://raw.githubusercontent.com/acme/product/trunk/README.md') {
        return textResponse('# Acme Product\n\nDesign tokens and dense workflow components for Acme.');
      }
      if (url === 'https://raw.githubusercontent.com/acme/product/trunk/package.json') {
        return textResponse(JSON.stringify({
          name: '@acme/product',
          description: 'Workspace UI package.',
        }));
      }
      return textResponse('not found', 404);
    };

    const context = await collectDesignSystemSourceContext({
      provenance: {
        githubUrls: ['https://github.com/acme/product/tree/trunk'],
      },
    }, {
      fetch: fetchFn,
      maxReadmeChars: 160,
    });

    expect(context.github[0]).toMatchObject({
      owner: 'acme',
      repo: 'product',
      description: 'Acme product UI repository.',
      defaultBranch: 'trunk',
      language: 'TypeScript',
      stars: 42,
      packageName: '@acme/product',
    });
    expect(context.notes).toContain('Fetched GitHub context');
    expect(context.notes).toContain('Design tokens and dense workflow components');

    const merged = mergeSourceContextIntoInput({
      sourceNotes: 'GitHub/code: https://github.com/acme/product',
      provenance: {
        githubUrls: ['https://github.com/acme/product'],
        sourceNotes: 'GitHub/code: https://github.com/acme/product',
      },
    }, context);

    expect(merged.sourceNotes).toContain('GitHub/code: https://github.com/acme/product');
    expect(merged.sourceNotes).toContain('Fetched GitHub context');
    expect(merged.provenance?.sourceNotes).toContain('README excerpt');
    expect(merged.provenance?.sourceNotes).not.toContain('GitHub/code:');
  });

  it('keeps generation usable when GitHub metadata is unavailable', async () => {
    const context = await collectDesignSystemSourceContext({
      provenance: {
        githubUrls: ['git@github.com:acme/missing.git'],
      },
    }, {
      fetch: async () => textResponse('not found', 404),
    });

    expect(context.github[0]).toMatchObject({
      owner: 'acme',
      repo: 'missing',
      error: 'GitHub repository metadata unavailable (HTTP 404)',
    });
    expect(context.notes).toContain('GitHub repository metadata unavailable');
  });
});

function jsonResponse(value: unknown, status = 200): ReturnType<FetchLike> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value),
  });
}

function textResponse(value: string, status = 200): ReturnType<FetchLike> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(value),
    text: async () => value,
  });
}
