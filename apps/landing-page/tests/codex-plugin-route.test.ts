import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  AGENT_INSTALL_GUIDE_URL,
  handleCodexPluginRequest,
  shouldServeLandingHtml,
} from '../functions/codex-plugin';

const PAGE = new URL('../app/pages/codex-plugin/index.astro', import.meta.url);
const LOCALIZED_PAGE = new URL(
  '../app/pages/[locale]/codex-plugin/index.astro',
  import.meta.url,
);
const OLD_PAGE = new URL('../app/pages/open-design-pugin/index.astro', import.meta.url);
const REDIRECTS = new URL('../public/_redirects', import.meta.url);
const HEADER = new URL('../app/_components/header.tsx', import.meta.url);
const FOOTER = new URL('../app/_components/site-footer.astro', import.meta.url);
const COPY = new URL('../app/open-design-plugin-i18n.ts', import.meta.url);
const LOCALE_DIR = new URL('../app/open-design-plugin-locales/', import.meta.url);
const ACTIVE_LOCALES = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh'];

describe('Codex plugin landing route', () => {
  it('publishes the canonical route and all localized variants', async () => {
    await Promise.all([access(PAGE), access(LOCALIZED_PAGE)]);
    await assert.rejects(access(OLD_PAGE));
  });

  it('removes the misspelled legacy route and updates site navigation', async () => {
    const [redirects, header, footer] = await Promise.all([
      readFile(REDIRECTS, 'utf8'),
      readFile(HEADER, 'utf8'),
      readFile(FOOTER, 'utf8'),
    ]);

    assert.doesNotMatch(redirects, /open-design-pugin/);
    assert.match(header, /href\('\/codex-plugin\/\'\)/);
    assert.match(footer, /href\('\/codex-plugin\/\'\)/);
  });

  it('sends agents to the canonical GitHub installation entrypoint', async () => {
    const page = await readFile(PAGE, 'utf8');

    assert.match(
      page,
      /const AGENT_INSTALL_GUIDE = `\$\{REPO\}\/blob\/main\/AGENTS\.md`/,
    );
    assert.match(
      page,
      /\/goal Read https:\/\/open-design\.ai\/codex-plugin\/ to install Open Design for Codex and set up a new task for me\./,
    );
    assert.match(page, /href=\{AGENT_INSTALL_GUIDE\}/);
  });

  it('serves the landing page to browser navigation and search crawlers', async () => {
    const browserRequest = new Request('https://open-design.ai/codex-plugin/', {
      headers: {
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const crawlerRequest = new Request('https://open-design.ai/codex-plugin/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });

    assert.equal(shouldServeLandingHtml(browserRequest), true);
    assert.equal(shouldServeLandingHtml(crawlerRequest), true);

    const response = await handleCodexPluginRequest({
      request: browserRequest,
      next: async () => new Response('<html>landing</html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8', Vary: 'Accept-Encoding' },
      }),
    });

    assert.equal(await response.text(), '<html>landing</html>');
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.match(response.headers.get('Vary') ?? '', /Accept-Encoding/);
    assert.match(response.headers.get('Vary') ?? '', /Sec-Fetch-Mode/);
  });

  it('serves the complete canonical install guide as plain text to agents', async () => {
    const request = new Request('https://open-design.ai/codex-plugin/', {
      headers: { 'User-Agent': 'ChatGPT-User/1.0' },
    });
    let nextCalled = false;
    let fetchedUrl = '';
    const response = await handleCodexPluginRequest(
      {
        request,
        next: async () => {
          nextCalled = true;
          return new Response('<html>landing</html>');
        },
      },
      async (input) => {
        fetchedUrl = String(input);
        return new Response('# Distribution guide\n\n## Install into Codex\nDo the install.');
      },
    );

    assert.equal(nextCalled, false);
    assert.equal(fetchedUrl, AGENT_INSTALL_GUIDE_URL);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.match(response.headers.get('Vary') ?? '', /User-Agent/);
    assert.match(await response.text(), /## Install into Codex/);
  });

  it('returns actionable plain-text guidance when the upstream fetch rejects', async () => {
    const request = new Request('https://open-design.ai/codex-plugin/', {
      headers: { 'User-Agent': 'ChatGPT-User/1.0' },
    });
    const response = await handleCodexPluginRequest(
      {
        request,
        next: async () => new Response('<html>landing</html>'),
      },
      async () => {
        throw new Error('simulated network failure');
      },
    );

    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(await response.text(), new RegExp(AGENT_INSTALL_GUIDE_URL));
  });

  it('does not duplicate the agent protocol in page content or structured data', async () => {
    const [page, copy] = await Promise.all([
      readFile(PAGE, 'utf8'),
      readFile(COPY, 'utf8'),
    ]);

    assert.doesNotMatch(page, /data-agent-install-protocol/);
    assert.doesNotMatch(page, /PREFLIGHT_COMMANDS|SAFE_MCP_INSPECTION_FUNCTION/);
    assert.doesNotMatch(page, /agentInstallSteps|copy\.agentInstall/);
    assert.doesNotMatch(page, /'@type': 'HowTo'/);
    assert.doesNotMatch(copy, /agentInstall:/);
  });

  it('localizes the GitHub installation-guide action', async () => {
    const [english, ...translations] = await Promise.all([
      readFile(COPY, 'utf8'),
      ...ACTIVE_LOCALES.map((locale) =>
        readFile(new URL(`${locale}.ts`, LOCALE_DIR), 'utf8'),
      ),
    ]);

    assert.match(english, /github: 'View installation guide on GitHub ↗'/);
    for (const translation of translations) {
      assert.match(translation, /github: '.*GitHub.*↗'/);
      assert.doesNotMatch(translation, /agentInstall:/);
    }
  });
});
