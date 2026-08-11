import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatCss = readFileSync(new URL('../../src/styles/chat.css', import.meta.url), 'utf8');

describe('chat project header glass edge', () => {
  it('extends the shared glass blur into the scrolling content with a fade', () => {
    expect(chatCss).toMatch(
      /\.chat-project-header::after\s*\{[\s\S]*?top:\s*100%;[\s\S]*?height:\s*var\(--spacing-18\);/,
    );
    expect(chatCss).toMatch(
      /\.chat-project-header::after\s*\{[\s\S]*?background:\s*linear-gradient\(to bottom, var\(--glass-regular\), transparent\);/,
    );
    expect(chatCss).toContain('-webkit-backdrop-filter: var(--glass-backdrop);');
    expect(chatCss).toContain('backdrop-filter: var(--glass-backdrop);');
    expect(chatCss).toContain('mask-image: linear-gradient(to bottom, currentColor, transparent);');
  });
});
