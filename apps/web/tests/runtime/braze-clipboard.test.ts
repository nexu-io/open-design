// Red spec for Braze IAM "소스 복사" detection.
// Braze Custom-HTML IAM is pasted as raw code into the Braze dashboard, so the
// button copies the literal source (plain text) — detection keys on `brazeBridge`,
// the only bridge object every Braze IAM uses (craft/braze-custom-html.md rule 1).

import { describe, it, expect } from 'vitest';
import { isBrazeIamHtml } from '../../src/runtime/braze-clipboard';

const BRAZE_SOURCE = `<div id="iam">...</div>
<script>
  window.brazeBridge = window.brazeBridge || {};
  brazeBridge.BridgeReady(function () {
    brazeBridge.logClick('0');
  });
</script>`;

describe('isBrazeIamHtml', () => {
  it('detects a Braze IAM via the brazeBridge marker', () => {
    expect(isBrazeIamHtml(BRAZE_SOURCE)).toBe(true);
  });

  it('rejects plain HTML', () => {
    expect(isBrazeIamHtml('<div>hello</div>')).toBe(false);
  });

  it('rejects a naver-blog post (no brazeBridge)', () => {
    expect(
      isBrazeIamHtml('<blockquote style="border-left:5px solid #000"><strong>제목</strong></blockquote>'),
    ).toBe(false);
  });

  it('rejects null / non-string', () => {
    expect(isBrazeIamHtml(null)).toBe(false);
    expect(isBrazeIamHtml(undefined)).toBe(false);
  });
});
