import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatCss = readFileSync(new URL('../../src/styles/chat.css', import.meta.url), 'utf8');
const edgeCss = readFileSync(
  new URL('../../src/components/chat/ChatScrollEdge.module.css', import.meta.url),
  'utf8',
);

/** The `.chat-project-header { … }` block, without any descendant or pseudo rules. */
function headerBlock(): string {
  const match = chatCss.match(/\.chat-project-header\s*\{([\s\S]*?)\}/);
  if (!match) throw new Error('.chat-project-header rule missing from chat.css');
  return match[1]!;
}

describe('chat project header over the transcript', () => {
  it('is transparent and paints no glass cap of its own', () => {
    const block = headerBlock();
    expect(block).toMatch(/background:\s*transparent;/);
    expect(block).not.toMatch(/backdrop-filter/);
    expect(block).not.toMatch(/--glass-regular/);
    expect(chatCss).not.toMatch(/\.chat-project-header::after/);
  });
});

describe('ChatScrollEdge progressive blur', () => {
  it('is a 40px pointer-transparent overlay above the transcript', () => {
    const block = edgeCss.match(/\.edge\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(block).toMatch(/position:\s*absolute;/);
    expect(block).toMatch(/inset:\s*0 0 auto;/);
    expect(block).toMatch(/height:\s*40px;/);
    expect(block).toMatch(/z-index:\s*7;/);
    expect(block).toMatch(/pointer-events:\s*none;/);
    expect(block).toMatch(/opacity:\s*0;/);
    expect(block).toMatch(/transition:\s*opacity 140ms cubic-bezier\(0\.23, 1, 0\.32, 1\);/);
    expect(edgeCss).toMatch(/\.edge\[data-active='true'\]\s*\{\s*opacity:\s*1;\s*\}/);
  });

  it('stacks four masked layers whose blur doubles as their height shrinks', () => {
    const span = edgeCss.match(/\.edge > span\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(span).toMatch(/-webkit-mask-image:\s*linear-gradient\(to bottom, #000 20%, transparent\);/);
    expect(span).toMatch(/mask-image:\s*linear-gradient\(to bottom, #000 20%, transparent\);/);
    const layers: Array<[number, string, string]> = [
      [1, '100%', '1px'],
      [2, '75%', '2px'],
      [3, '50%', '4px'],
      [4, '25%', '8px'],
    ];
    for (const [index, height, blur] of layers) {
      const block = edgeCss.match(new RegExp(`\\.edge > span:nth-child\\(${index}\\)\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? '';
      expect(block, `layer ${index}`).toMatch(new RegExp(`height:\\s*${height};`));
      expect(block, `layer ${index}`).toMatch(new RegExp(`-webkit-backdrop-filter:\\s*blur\\(${blur}\\);`));
      expect(block, `layer ${index}`).toMatch(new RegExp(`backdrop-filter:\\s*blur\\(${blur}\\);`));
    }
  });

  it('fades the transcript viewport under the active edge so the real surface shows through', () => {
    expect(edgeCss).toMatch(
      /:global\(\.chat-log-viewport\):has\(> \.edge\[data-active='true'\]\)\s*\{[\s\S]*?mask-image:\s*linear-gradient\(to bottom, transparent, #000 40px\);/,
    );
  });

  it('respects reduced motion and reduced transparency', () => {
    expect(edgeCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.edge\s*\{\s*transition:\s*none;\s*\}/);
    expect(edgeCss).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{[\s\S]*?\.edge\s*\{\s*display:\s*none;\s*\}/);
    expect(edgeCss).toMatch(
      /@media \(prefers-reduced-transparency: reduce\)\s*\{[\s\S]*?:global\(\.chat-log-viewport\):has\(> \.edge\[data-active='true'\]\)\s*\{[\s\S]*?mask-image:\s*none;/,
    );
  });
});
