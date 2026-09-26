// The OAuth callback result page — the last thing a user sees before the
// settings surface catches up. Two things it has to get right:
//
//   (a) when the flow recorded where it was started from, the page offers a way
//       BACK there. The callback tab is regularly a `_blank` fallback the
//       browser will not let script close, so a "Close this tab" button is not
//       an affordance for it; the returnUrl branch used to render exactly the
//       same button as the branch without one, which made the option a no-op.
//   (b) the auto-close is scheduled only for a tab the app itself opened
//       (window.opener), which is the only case where close() is permitted.

import { describe, expect, it } from 'vitest';

import { renderOAuthResultPage } from '../src/http/oauth-result-page.js';

const APP_ORIGIN = 'http://127.0.0.1:7456';

describe('renderOAuthResultPage', () => {
  it('links back to the app when the flow recorded where it started', () => {
    const html = renderOAuthResultPage({
      ok: true,
      providerLabel: 'Cloudflare',
      returnUrl: APP_ORIGIN,
    });
    expect(html).toContain(`href="${APP_ORIGIN}"`);
    expect(html).toContain('Return to OpenDesign');
    // The option has to CHANGE the page: the two branches used to be the same
    // close button, so a caller that knew where to return to had no effect.
    expect(html).not.toContain('Close this tab');
  });

  it('offers the close button when there is nowhere to return to', () => {
    const html = renderOAuthResultPage({ ok: true, serverId: 'srv-1' });
    expect(html).toContain('Close this tab');
    expect(html).not.toContain('href="');
  });

  it('escapes the return URL into the attribute and refuses a scheme it did not expect', () => {
    const escaped = renderOAuthResultPage({
      ok: true,
      returnUrl: 'http://127.0.0.1:7456/?a=1&b="x"',
    });
    expect(escaped).toContain('href="http://127.0.0.1:7456/?a=1&amp;b=&quot;x&quot;"');

    // Not a way back: no value, a relative path, or a scheme this page never
    // renders. Each falls through to the close button rather than an href.
    for (const returnUrl of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/settings',
      'not a url',
      '',
    ]) {
      const html = renderOAuthResultPage({ ok: true, returnUrl });
      expect(html).not.toContain('href="');
      expect(html).not.toContain('javascript:');
      expect(html).toContain('Close this tab');
    }
  });

  it('schedules the auto-close only for a tab that was opened by the app', () => {
    const withReturn = renderOAuthResultPage({ ok: true, returnUrl: APP_ORIGIN });
    // Guarded by window.opener: a `_blank` fallback tab has no opener, and the
    // unguarded setTimeout scheduled a close that tab is not permitted to do.
    expect(withReturn).toContain('if (window.opener) { setTimeout(');

    for (const html of [
      renderOAuthResultPage({ ok: true, serverId: 'srv-1' }),
      renderOAuthResultPage({ ok: false, message: 'boom' }),
      renderOAuthResultPage({ ok: true, returnUrl: 'javascript:alert(1)' }),
    ]) {
      expect(html).not.toContain('setTimeout');
    }
  });

  it('keeps the failure page an escaped message with a way out', () => {
    const html = renderOAuthResultPage({ ok: false, message: '<script>nope</script>' });
    expect(html).toContain('&lt;script&gt;nope&lt;/script&gt;');
    expect(html).not.toContain('<script>nope</script>');
    expect(html).toContain('Close this tab');
    // The postMessage contract the app listens for is untouched either way.
    expect(html).toContain('mcp-oauth');
  });
});
