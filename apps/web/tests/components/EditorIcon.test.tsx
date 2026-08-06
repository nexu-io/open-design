import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EditorIcon } from '../../src/components/EditorIcon';

// `IMAGE_ICONS` is a string registry pointing at `public/editor-icons/<id>.png`,
// so an id added without its asset produces a broken <img> that nothing else in
// the suite would notice — the component renders happily, only the browser 404s.
// These cases pin the registry entry and the asset together.
describe('EditorIcon', () => {
  it('renders the Kiro tile as the bundled brand PNG, not the generic folder fallback', () => {
    const markup = renderToStaticMarkup(<EditorIcon editorId="kiro" size={24} />);

    expect(markup).toContain('src="/editor-icons/kiro.png"');
    expect(markup).toContain('class="editor-icon editor-icon-img"');
    // The Kiro mark is a color-baked tile (purple squircle, white face), so it
    // must NOT go through the currentColor mask path — that would flatten it to
    // a solid theme-colored square.
    expect(markup).not.toContain('editor-icon-mask');
  });

  it('ships the Kiro asset as a 128x128 PNG, matching the sibling editor icons', () => {
    const png = readFileSync(
      new URL('../../public/editor-icons/kiro.png', import.meta.url),
    );

    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
  });

  it('falls back to a neutral folder tile for editors without bundled artwork', () => {
    const markup = renderToStaticMarkup(<EditorIcon editorId="not-a-real-editor" size={24} />);

    expect(markup).not.toContain('editor-icon-img');
    expect(markup).toContain('class="editor-icon"');
  });
});
