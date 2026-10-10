import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatCss = readFileSync(new URL('../../src/styles/chat.css', import.meta.url), 'utf8');
const chatRootCss = readFileSync(
  new URL('../../src/components/chat/ChatRoot.module.css', import.meta.url),
  'utf8',
);

describe('chat message rail preview card', () => {
  it('right-aligns to the transcript and uses an opaque white surface', () => {
    const previewRule = chatCss.match(/\.chat-message-rail__preview\s*\{([^}]*)\}/)?.[1];
    expect(previewRule).toBeTruthy();
    expect(previewRule).toMatch(/right:\s*16px;/);
    expect(previewRule).toMatch(/background:\s*var\(--chat-floating-card-bg\);/);
    expect(previewRule).toMatch(/color:\s*var\(--chat-floating-card-text\);/);
    expect(previewRule).not.toMatch(/linear-gradient|backdrop-filter/);

    expect(chatRootCss.match(/--chat-floating-card-bg:\s*#fff;/g)).toHaveLength(2);
    expect(chatRootCss.match(/--chat-floating-card-text:\s*#202020;/g)).toHaveLength(2);
  });
});
