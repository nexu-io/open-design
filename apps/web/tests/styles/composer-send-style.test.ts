import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatComposer = readFileSync(
  new URL('../../src/components/ChatComposer.tsx', import.meta.url),
  'utf8',
);
const routinesCss = readFileSync(
  new URL('../../src/styles/viewer/routines.css', import.meta.url),
  'utf8',
);

describe('project composer send button', () => {
  it('shares the Home composer color tokens without the legacy video fill', () => {
    expect(chatComposer).not.toContain('className="composer-send__video"');
    expect(routinesCss).toContain('--composer-send-bg: var(--accent);');
    expect(routinesCss).toContain('--composer-send-fg: var(--brand);');
    expect(routinesCss).toContain('background: var(--composer-send-bg);');
    expect(routinesCss).toContain('color: var(--composer-send-fg);');
    expect(routinesCss).toContain('.app .composer-send:not(.stop)');
    expect(routinesCss).toContain('.chat-composer-fixed-layer .composer-send:not(.stop)');
    expect(routinesCss).not.toContain('.composer-send__video');
  });

  it('matches the Home composer disabled palette', () => {
    expect(routinesCss).toMatch(
      /\.app \.composer-send:disabled,[\s\S]*?background:\s*var\(--bg-muted\);[\s\S]*?color:\s*var\(--text-muted\);/,
    );
  });
});
