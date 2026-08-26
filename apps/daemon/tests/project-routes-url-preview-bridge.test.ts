/**
 * Regression test for the URL-load preview bridge injection point
 * ("UX aChiral Carbon" visualization bug report).
 *
 * The daemon's /api/projects/:id/raw/:file handler injects a scroll/
 * selection/snapshot bridge <script> into HTML previews requested with
 * ?odPreviewBridge=... via applyUrlPreviewBridgesToHtml -> injectUrlPreviewBridge
 * -> injectBeforeBodyClose (routes/project/index.ts).
 *
 * Bug: injectBeforeBodyClose used html.search(/<\/body\s*>/i), the FIRST
 * literal "</body>" anywhere in the document. Artifacts commonly build nested
 * HTML pages from an inline <script> using code like
 * `html.replace('</body>', ...)`, which puts a literal "</body>" string deep
 * inside the artifact's own <script> tag, long before the document's real
 * closing tag. The first-match version spliced the bridge <script>...</script>
 * into the middle of the artifact's script; the bridge's own </script> then
 * closed the artifact's <script> tag early, and everything after that point
 * fell out of script-parsing mode and rendered as literal visible page text
 * instead of executing as JavaScript.
 *
 * Fix mirrors injectBeforeBodyEnd in apps/web/src/runtime/srcdoc.ts: find the
 * LAST "</body>" before the real "</html>", not the first occurrence anywhere.
 */
import { describe, expect, it } from 'vitest';
import { applyUrlPreviewBridgesToHtml } from '../src/routes/project/index.js';

/** An artifact whose own inline script builds a nested page via a literal
 * `</body>` string — the exact pattern that broke on the naive first-match
 * search. */
function artifactWithScriptedBodyLiteral(): string {
  return `<!doctype html>
<html>
<head><title>Artifact</title></head>
<body>
  <script>
    function buildNestedPage(html){
      // This literal '</body>' inside a JS string is what the naive
      // first-match search used to find instead of the real closing tag.
      return html.replace('</body>', '<div class="injected"></div></body>');
    }
    function afterTheTrap(){
      return 'this statement must still be inside the artifact script';
    }
  </script>
</body>
</html>`;
}

describe('applyUrlPreviewBridgesToHtml – bridge injection point', () => {
  it('does not splice the bridge into a literal "</body>" inside the artifact\'s own <script>', () => {
    const html = artifactWithScriptedBodyLiteral();
    const result = applyUrlPreviewBridgesToHtml(html, 'text/html', 'snapshot') as string;

    // The artifact's own script must remain a single, intact, correctly
    // closed element — the bridge must not have landed inside it.
    const scriptOpens = (result.match(/<script\b/gi) || []).length;
    const scriptCloses = (result.match(/<\/script\s*>/gi) || []).length;
    expect(scriptOpens).toBe(scriptCloses);

    // The statement that follows the trap inside the artifact's script must
    // still be present as executable script source, not as page text cut
    // loose by a premature </script>.
    expect(result).toContain("function afterTheTrap(){");
    expect(result).toContain("return 'this statement must still be inside the artifact script';");

    // The bridge must be injected right before the document's real closing
    // </body>, i.e. after the artifact's own script has fully closed.
    const bridgeMarkerIndex = result.indexOf('data-od-url-snapshot-bridge');
    const realBodyCloseIndex = result.lastIndexOf('</body>');
    expect(bridgeMarkerIndex).toBeGreaterThan(-1);
    expect(bridgeMarkerIndex).toBeLessThan(realBodyCloseIndex);
    // And the bridge must come after the artifact's own script content, not
    // spliced inside it.
    const afterTheTrapIndex = result.indexOf('afterTheTrap');
    expect(bridgeMarkerIndex).toBeGreaterThan(afterTheTrapIndex);
  });

  it('injects at the real </body> for a normal document with no scripted "</body>" literal', () => {
    const html = `<!doctype html>
<html>
<head><title>Simple</title></head>
<body>
  <p>Hello</p>
</body>
</html>`;

    const result = applyUrlPreviewBridgesToHtml(html, 'text/html', 'scroll') as string;
    expect(result).toContain('data-od-url-scroll-bridge');
    expect(result.indexOf('data-od-url-scroll-bridge')).toBeLessThan(result.lastIndexOf('</body>'));
    expect(result).toContain('<p>Hello</p>');
  });

  it('leaves non-HTML responses untouched', () => {
    const json = '{"a":1}';
    const result = applyUrlPreviewBridgesToHtml(json, 'application/json', 'snapshot');
    expect(result).toBe(json);
  });

  it('leaves HTML untouched when no bridge is requested', () => {
    const html = artifactWithScriptedBodyLiteral();
    const result = applyUrlPreviewBridgesToHtml(html, 'text/html', undefined);
    expect(result).toBe(html);
  });
});
