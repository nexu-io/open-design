import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../src/runtimes/html-escaping.js';

describe('HTML escaping', () => {
  it('escapes markup delimiters and quotes in one stable contract', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'unsafe'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;unsafe&#39;',
    );
  });

  it('normalizes nullish values without leaking implementation text', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});
