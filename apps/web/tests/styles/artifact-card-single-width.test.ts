import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const toolsCss = readFileSync(new URL('../../src/styles/viewer/tools.css', import.meta.url), 'utf8');
const chatRootCss = readFileSync(
  new URL('../../src/components/chat/ChatRoot.module.css', import.meta.url),
  'utf8',
);

describe('single artifact card width', () => {
  it('fills the available transcript width up to the shared 406px cap', () => {
    const singleRule = toolsCss.match(
      /\.artifact-cards:has\(> \.artifact-card:only-child\)\s*\{([^}]*)\}/,
    )?.[1];

    expect(singleRule).toBeTruthy();
    expect(singleRule).toMatch(/width:\s*100%;/);
    expect(singleRule).toMatch(/max-width:\s*var\(--chat-artifact-single-max-width\);/);
    expect(singleRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(chatRootCss.match(/--chat-artifact-single-max-width:\s*406px;/g)).toHaveLength(2);
  });

  it('keeps the two-column layout for multiple artifacts', () => {
    const cardsRule = toolsCss.match(/\.artifact-cards\s*\{([^}]*)\}/)?.[1];
    expect(cardsRule).toMatch(/grid-template-columns:\s*repeat\(2,\s*1fr\);/);
  });
});
