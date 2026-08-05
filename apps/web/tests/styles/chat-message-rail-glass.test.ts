import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatCss = readFileSync(new URL('../../src/styles/chat.css', import.meta.url), 'utf8');

describe('chat message rail preview glass', () => {
  it('fades from an opaque readable surface into the shared glass material', () => {
    expect(chatCss).toMatch(
      /\.chat-message-rail__preview\s*\{[\s\S]*?background:\s*linear-gradient\(to right, var\(--bg-elevated\), var\(--glass-regular\)\);/,
    );
    expect(chatCss).toMatch(
      /\.chat-message-rail__preview\s*\{[\s\S]*?-webkit-backdrop-filter:\s*var\(--glass-backdrop\);[\s\S]*?backdrop-filter:\s*var\(--glass-backdrop\);/,
    );
  });
});
