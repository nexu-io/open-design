import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRenderedPatches } from '../scripts/apply-missing-fallback-translations';

test('patches rendered text and metadata by DOM path', () => {
  const html = '<html><head><title>English title for page</title><meta name="description" content="English description for page"></head><body><header>Shared navigation stays</header><main><h1>English page heading here</h1></main></body></html>';
  const result = applyRenderedPatches(html, [
    { domPath: '/html[1]/head[1]/title[1]/text()[1]', kind: 'title', translation: 'Título de la página' },
    { domPath: '/html[1]/head[1]/meta[1]@content', kind: 'meta_description', translation: 'Descripción de la página' },
    { domPath: '/html[1]/body[1]/main[1]/h1[1]/text()[1]', kind: 'text', translation: 'Encabezado de la página' },
  ]);
  assert.equal(result.applied, 3);
  assert.match(result.html, /Título de la página/);
  assert.match(result.html, /Descripción de la página/);
  assert.match(result.html, /Shared navigation stays/);
});
