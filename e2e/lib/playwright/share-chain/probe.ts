import { chromium, type Page, type Request, type Response, type BrowserContext, type Browser } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureHttpRequest, captureHttpResponse } from './http-evidence.js';

export type Verdict = 'PASS' | 'FAIL' | 'UNKNOWN';
type Check = { name: string; verdict: Verdict; evidence: unknown };
type Step = { step: number; title: string; verdict: Verdict; checks: Check[]; inputs: unknown; outputs: unknown };
type Json = Record<string, unknown>;
type Seen = Awaited<ReturnType<typeof captureHttpResponse>>;
export interface ProbeOptions {
  /** Expected real published URL, not an alternative source for any downstream step. */
  url: string;
  /** Existing, dedicated, isolated-namespace Owner browser. Never the default browser. */
  cdp: string;
  /** Independently supplied deployment Web origin; never inferred from url. */
  webOrigin: string;
  outputDir: string;
  /** libpq service using an authorized read-only account. No credentials in argv/logs. */
  pgService?: string;
  timeoutMs?: number;
  /** Human performs genuine UI actions/SSO; this is not a source of verdicts or IDs. */
  checkpoint(instruction: string): Promise<void>;
}
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const sql = (value: string) => "'" + value.replace(/'/g, "''") + "'";
function safe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /password|token|cookie|authorization|secret|email|displayName|authorKey|appUserId/i.test(key) ? '<REDACTED>' : safe(item)]));
  return value;
}
class Missing extends Error {}
function requireFact<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Missing(message);
  return value;
}

/** Live, operator-assisted observation. No fixtures, routing mocks, API writes,
 * localStorage seeding, clock manipulation, synthetic message injection, or source imports.
 * Calling this function is a real run; preparation/typechecking must never call it.
 */
export async function runShareChainProbe(options: ProbeOptions): Promise<Step[]> {
  const expected = new URL(options.url);
  const expectedParts = /^\/artifact\/([^/]+)\/([^/]+)$/.exec(expected.pathname);
  if (!expectedParts || expected.username || expected.password || expected.search || expected.hash) throw new Error('Expected a clean real /artifact/{projectId}/{slug} URL');
  const expectedProject = decodeURIComponent(expectedParts[1]!);
  const origin = new URL(options.webOrigin).origin;
  const timeout = options.timeoutMs ?? 45_000;
  const steps: Step[] = ['Publish/copy', 'Anonymous open', 'Invalid link', 'Login/comment', 'Owner receives', 'Update', 'Backfill']
    .map((title, index) => ({ step: index + 1, title, verdict: 'UNKNOWN', checks: [], inputs: null, outputs: null }));
  await mkdir(dirname(options.outputDir), { recursive: true, mode: 0o700 });
  // Refuse to overwrite evidence from an earlier run.
  await mkdir(options.outputDir, { mode: 0o700 });
  const save = async (name: string, value: unknown) => writeFile(join(options.outputDir, name), JSON.stringify(safe(value), null, 2), { mode: 0o600 });
  const persist = () => save('report.json', { executedAt: new Date().toISOString(), steps, ci: 'UNKNOWN', deployment: 'UNKNOWN', production: 'UNKNOWN' });
  const seen: Seen[] = [];
  const requests: ReturnType<typeof captureHttpRequest>[] = [];
  const pending = new Set<Promise<void>>();
  const listeners: Array<() => void> = [];
  const contexts: BrowserContext[] = [];
  const observe = (page: Page, label: string) => {
    const requestListener = (request: Request) => requests.push(captureHttpRequest(request, label));
    const listener = (response: Response) => {
      // Begin the body read in the response callback, not after later navigation.
      const task = captureHttpResponse(response, label).then(record => { seen.push(record); });
      pending.add(task); void task.finally(() => pending.delete(task));
    };
    page.on('request', requestListener);
    page.on('response', listener);
    listeners.push(() => { page.off('request', requestListener); page.off('response', listener); });
  };
  const settle = () => Promise.all([...pending]);
  let current = 0;
  const check = (name: string, verdict: Verdict, evidence: unknown) => steps[current]!.checks.push({ name, verdict, evidence });
  const assert = (name: string, pass: boolean, evidence: unknown) => {
    check(name, pass ? 'PASS' : 'FAIL', evidence);
    if (!pass) throw new Error(name);
  };
  const finish = async (outputs: unknown) => {
    const step = steps[current]!;
    step.outputs = outputs;
    step.verdict = step.checks.some(check => check.verdict === 'FAIL') ? 'FAIL'
      : step.checks.some(check => check.verdict === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';
    await persist();
  };
  const begin = (number: number, inputs: unknown) => { current = number - 1; steps[current]!.inputs = inputs; };
  const shot = (page: Page, name: string) => page.screenshot({ path: join(options.outputDir, `${name}.png`), fullPage: true });
  const content = async (page: Page) => normalize(await page.frameLocator('iframe:visible').first().locator('body').innerText({ timeout }));
  const copyFromUi = async (page: Page) => {
    // This selector is the actual Owner ShareTab copy button; no API/DOM-URL fallback.
    await page.locator('.chrome-publish-plain .chrome-publish-actions button').first().click({ timeout });
    return (await page.evaluate(() => navigator.clipboard.readText())).trim();
  };
  const latestPublish = (since: number, project: string) => requireFact(seen.filter(item => item.page === 'owner' && item.at >= since
    && item.method === 'POST' && new URL(item.url).pathname.startsWith(`/api/projects/${encodeURIComponent(project)}/files/`)
    && new URL(item.url).pathname.endsWith('/publish-public')).at(-1), 'No real Owner publish response observed');
  const commentFromPost = (since: number, page: string, pathname: string) => {
    const response = requireFact(seen.filter(item => item.page === page && item.at >= since && item.method === 'POST'
      && new URL(item.url).pathname === pathname).at(-1), 'No matching real comment POST observed');
    assert('comment HTTP accepted', response.status >= 200 && response.status < 300, response);
    const comment = object(object(response.body).comment);
    if (!text(comment.id) || !text(comment.note)) throw new Missing('Accepted response lacks comment.id/note; do not invent them');
    return comment;
  };
  let browser: Browser | undefined;
  await persist();
  try {
    browser = await chromium.connectOverCDP(options.cdp);
    await save('lifecycle.json', { mode: 'attach-only', runtimeStarted: false, browserConnected: true });
    begin(1, { expectedUrl: expected.href });
    const candidates = browser.contexts().flatMap(context => context.pages()).filter(page => {
      try { return new URL(page.url()).pathname.startsWith(`/projects/${encodeURIComponent(expectedProject)}/`); } catch { return false; }
    });
    if (candidates.length !== 1) throw new Missing(`Need exactly one already-open Owner file page; found ${candidates.length}. Never construct an Owner route.`);
    const owner = candidates[0]!;
    observe(owner, 'owner');
    await owner.context().grantPermissions(['clipboard-read'], { origin: new URL(owner.url()).origin });
    const publishStart = Date.now();
    await options.checkpoint('OWNER: publish this file through the real UI. Leave ShareTab open. Continue after completion; the probe itself will click Copy Link and read the clipboard.');
    await settle();
    const published = latestPublish(publishStart, expectedProject);
    assert('publish HTTP accepted', published.status >= 200 && published.status < 300, published);
    const copied = await copyFromUi(owner);
    const link = new URL(copied);
    const match = /^\/artifact\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(link.pathname);
    assert('copied Web URL has UUIDv4 stable alias', !!match && !link.search && !link.hash && !link.username && !link.password, { copied });
    assert('independently configured Web origin', link.origin === origin, { observed: link.origin, expected: origin });
    assert('given URL equals actual UI copy', copied === expected.href, { copied, expected: expected.href });
    const project = decodeURIComponent(match![1]!);
    const slug = match![2]!;
    const ownerBefore = await content(owner);
    await shot(owner, '01-owner-copy');
    await finish({ copied, project, slug, publication: published.body, ownerContent: ownerBefore });

    begin(2, { fromStep: 1, copied });
    const visitorContext = await browser.newContext(); contexts.push(visitorContext);
    assert('fresh context has no cookies', (await visitorContext.cookies()).length === 0, 'new context; no Owner storageState imported');
    const visitor = await visitorContext.newPage(); observe(visitor, 'visitor');
    const opened = await visitor.goto(copied, { waitUntil: 'domcontentloaded', timeout });
    assert('viewer navigation accepted', !!opened && opened.ok(), { status: opened?.status() });
    const visitorBefore = await content(visitor);
    assert('rendered work matches Owner actual output', !!ownerBefore && visitorBefore === ownerBefore, { owner: ownerBefore, visitor: visitorBefore });
    check('anonymous allowed visibility', 'UNKNOWN', 'Task does not enumerate allowed/forbidden anonymous content; screenshot retained, not inferred from iframe success');
    await shot(visitor, '02-anonymous');
    await finish({ copied, visitorContent: visitorBefore });

    begin(3, { fromStep: 2, copied });
    const invalid = new URL(copied); invalid.pathname = invalid.pathname.slice(0, -8);
    const bad = await visitorContext.newPage(); observe(bad, 'invalid');
    const badResponse = await bad.goto(invalid.href, { waitUntil: 'domcontentloaded', timeout });
    await bad.locator('main[data-share-state]').waitFor({ state: 'visible', timeout });
    const state = await bad.locator('main[data-share-state]').getAttribute('data-share-state');
    assert('invalid link is E3, never E2', state === 'E3', { state, navigationStatus: badResponse?.status(), invalid: invalid.href });
    await shot(bad, '03-invalid'); await settle();
    await finish({ invalid: invalid.href, navigationStatus: badResponse?.status(), responses: seen.filter(item => item.page === 'invalid') });
    await bad.close();

    begin(4, { fromStep: 2, copied, invalidBranchFromStep3: invalid.href });
    const commentStart = Date.now();
    await visitor.bringToFront();
    await options.checkpoint('VISITOR: use the real share-page login entry and real SSO. Select an actual element and submit one distinctive comment. Do not navigate to a constructed link. Continue once your own list shows it.');
    await settle();
    const guestComment = commentFromPost(commentStart, 'visitor', `/api/v1/collab/share/${slug}/comments`);
    assert('authenticated external user author', object(guestComment.author).kind === 'user' && guestComment.isMine === true, guestComment);
    assert('guest own visible comment list', await visitor.locator('article').filter({ hasText: text(guestComment.note) }).count() > 0, { id: guestComment.id });
    if (options.pgService) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(options.pgService)) throw new Error('Invalid libpq service name');
      const query = `BEGIN READ ONLY; SELECT json_build_object('rows',count(*),'authorUser',bool_and(author_kind='user'),'bodyMatches',bool_and(payload->>'note'=${sql(text(guestComment.note))}),'selectorMatches',bool_and(payload->>'selector'=${sql(text(guestComment.selector))})) FROM collab.comment_events WHERE project_id=${sql(project)} AND comment_id=${sql(text(guestComment.id))} AND payload->>'publicationSlug'=${sql(slug)}; COMMIT;`;
      const result = await promisify(execFile)('psql', ['-X', '--no-password', '--dbname', `service=${options.pgService}`, '--set', 'ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', query], { timeout, maxBuffer: 1024 * 1024 });
      await writeFile(join(options.outputDir, '04-pg.txt'), result.stdout, { mode: 0o600 });
      const row = object(JSON.parse(requireFact(result.stdout.split('\n').find(line => line.trim().startsWith('{')), 'PG returned no JSON row')));
      assert('real PG row matches exact accepted comment', row.rows === 1 && row.authorUser === true && row.bodyMatches === true && row.selectorMatches === true, row);
    } else check('real PG persistence', 'UNKNOWN', 'No authorized read-only libpq service supplied; POST/list is not PG proof');
    await shot(visitor, '04-visitor-comment');
    await finish({ guestComment });

    begin(5, { fromStep: 4, guestCommentId: guestComment.id });
    await owner.bringToFront();
    await options.checkpoint('OWNER: open the real comment panel and wait for that external comment. Do not recreate or import it. Continue once visible.');
    await settle();
    const ownerRow = owner.locator('[data-testid="comment-side-item"]').filter({ hasText: text(guestComment.note) });
    assert('same external comment ID visible on Owner', await ownerRow.getAttribute('data-comment-id', { timeout }) === guestComment.id, { id: guestComment.id });
    const inbound = seen.filter(item => item.page === 'owner' && item.method === 'GET')
      .flatMap(item => Array.isArray(object(item.body).comments) ? object(item.body).comments as unknown[] : []).map(object)
      .find(comment => comment.id === guestComment.id);
    if (inbound) assert('Owner API preserves external authorKind', inbound.authorKind === 'user', inbound);
    else check('Owner API authorKind', 'UNKNOWN', 'No matching natural Owner read response captured; do not substitute public payload');
    check('no team directory exposure', 'UNKNOWN', 'Task has no observable directory/response allowlist; a screenshot cannot prove absence of all leaks');
    await shot(owner, '05-owner-receives'); await finish({ guestCommentId: guestComment.id, inbound });

    // Step7 creation deliberately occurs BEFORE step6 publication; its actual POST ID is the only later input.
    begin(6, { fromStep: 5, copied, guestCommentId: guestComment.id });
    const localStart = Date.now();
    await options.checkpoint('OWNER: BEFORE the next publication, create one local comment on this same file through the UI. Also edit the actual work so its visible text changes. Do NOT publish yet. Continue after both are saved.');
    await settle();
    const localResponse = requireFact(seen.filter(item => item.page === 'owner' && item.at >= localStart && item.method === 'POST'
      && new URL(item.url).pathname.startsWith(`/api/projects/${encodeURIComponent(project)}/conversations/`)
      && new URL(item.url).pathname.endsWith('/comments')).at(-1), 'No actual local comment POST before republish');
    const localComment = commentFromPost(localStart, 'owner', new URL(localResponse.url).pathname);
    const ownerAfter = await content(owner);
    assert('Owner edited real content before publication', !!ownerAfter && ownerAfter !== ownerBefore, { before: ownerBefore, after: ownerAfter });
    await visitor.bringToFront();
    await options.checkpoint('VISITOR: select an element and type a nonempty unsent draft. Leave it unsent and leave this original page open. Continue.');
    const draft = await visitor.locator('textarea').inputValue({ timeout });
    assert('real unsent draft exists', draft.length > 0, { length: draft.length });
    const documentTime = await visitor.evaluate(() => performance.timeOrigin);
    const frameSrc = await visitor.locator('iframe:visible').first().getAttribute('src');
    await owner.bringToFront(); const updateStart = Date.now();
    await options.checkpoint('OWNER: now publish the edited file in the real UI. Leave ShareTab open; the probe will copy its link again. Continue after completion.');
    await settle(); const updated = latestPublish(updateStart, project);
    assert('republish HTTP accepted', updated.status >= 200 && updated.status < 300, updated);
    assert('stable copied alias unchanged', await copyFromUi(owner) === copied, { original: copied });
    const fresh = await visitorContext.newPage(); observe(fresh, 'fresh');
    await fresh.goto(copied, { waitUntil: 'domcontentloaded', timeout });
    assert('old copied URL renders newly published actual content', await content(fresh) === ownerAfter, { originalUrl: copied, expectedText: ownerAfter });
    await visitor.bringToFront();
    await options.checkpoint('VISITOR: observe the ORIGINAL page. Do not reload yet. Continue when the real new-version notice appears, or when the allotted observation window has elapsed. Do not inject a version event.');
    assert('original page not automatically reloaded', await visitor.evaluate(() => performance.timeOrigin) === documentTime
      && await visitor.locator('iframe:visible').first().getAttribute('src') === frameSrc && await content(visitor) === visitorBefore, { documentTime, frameSrc });
    assert('unsent draft preserved', await visitor.locator('textarea').inputValue({ timeout }) === draft, { length: draft.length });
    const notice = visitor.getByTestId('toast-item').filter({ hasText: /new version|有新版本/i });
    check('new-version notice observed', await notice.isVisible() ? 'PASS' : 'UNKNOWN', 'Trigger is unspecified and no-polling instruction conflicts with deployed polling implementation; absence cannot identify a deadline');
    await shot(visitor, '06-update-before-refresh');
    if (await notice.isVisible()) {
      // Listen before clicking the real product refresh action. Never replace window.confirm.
      const action = notice.getByRole('button', { name: /^(刷新查看|Refresh to view)$/ });
      const [cancelType] = await Promise.all([
        visitor.waitForEvent('dialog', { timeout }).then(async dialog => {
          const type = dialog.type(); await dialog.dismiss(); return type;
        }),
        action.click({ timeout }),
      ]);
      assert('refresh asks confirmation before discarding', cancelType === 'confirm', { type: cancelType });
      assert('cancelling preserves document and draft', await visitor.evaluate(() => performance.timeOrigin) === documentTime
        && await visitor.locator('textarea').inputValue({ timeout }) === draft, { draftLength: draft.length });
      const reloaded = visitor.waitForEvent('domcontentloaded', { timeout });
      const [acceptType] = await Promise.all([
        visitor.waitForEvent('dialog', { timeout }).then(async dialog => {
          const type = dialog.type(); await dialog.accept(); return type;
        }),
        action.click({ timeout }),
        reloaded,
      ]);
      assert('confirmed refresh loads new content at same URL', acceptType === 'confirm' && visitor.url() === copied
        && await content(visitor) === ownerAfter && await visitor.evaluate(() => performance.timeOrigin) !== documentTime, { url: visitor.url() });
      assert('confirmed refresh discards the draft', await visitor.locator('textarea').count() === 0
        || await visitor.locator('textarea').inputValue({ timeout }) === '', { previousLength: draft.length });
      await shot(visitor, '06-confirmed-refresh');
    } else check('refresh confirms before discarding draft', 'UNKNOWN', 'No actual update notice/action; no substitute browser.reload() used');
    await finish({ copied, localComment, update: updated.body, newContent: ownerAfter, originalDraftLength: draft.length });

    begin(7, { fromStep: 6, localCommentId: localComment.id, copied, publication: updated.body });
    await fresh.bringToFront();
    await options.checkpoint('VISITOR: on the fresh page opened from the ORIGINAL copied URL, open comments and wait for the Owner local comment created before republish. Do not post a substitute. Continue.');
    await settle();
    const backfilled = seen.filter(item => ['fresh', 'visitor'].includes(item.page) && item.at >= updateStart && item.method === 'GET')
      .flatMap(item => Array.isArray(object(item.body).comments) ? object(item.body).comments as unknown[] : []).map(object)
      .find(comment => comment.id === localComment.id);
    const failure = seen.filter(item => item.page === 'owner' && item.at > updated.at && item.method === 'GET')
      .map(item => object(object(item.body).backfill))
      .find(backfill => backfill.state === 'failed' && backfill.filePath === object(localComment.target).filePath);
    if (failure) {
      assert('real backfill failure does not revoke copied link', await copyFromUi(owner) === copied, failure);
      assert('published UI remains visible despite backfill failure', await owner.locator('.chrome-publish-plain').isVisible(), failure);
      check('only backfill warning is shown', 'UNKNOWN', 'Need explicit warning/error selectors to distinguish backfill hint from a global sharing error');
      await shot(owner, '07-backfill-failure');
    } else if (backfilled) {
      assert('same local ID/body in public read', backfilled.note === localComment.note, backfilled);
      assert('backfilled comment visible on visitor page', await fresh.locator('article').filter({ hasText: text(localComment.note) }).count() > 0, { id: localComment.id });
      check('backfill causal attribution', 'UNKNOWN', 'A previously shared file can relay this comment before republish. Need a real pending/generation witness; visibility alone is insufficient.');
      check('backfill-failure isolation branch', 'UNKNOWN', 'No real backfill failure observed; not fault-injected and not inferred from success');
    } else check('backfill delivery/failure classification', 'UNKNOWN', 'Same ID not observed; collect real status before distinguishing latency, failure, or missing integration');
    await shot(fresh, '07-backfill'); await finish({ backfilled, failure });
  } catch (error) {
    check('execution stopped', steps[current]!.checks.some(check => check.verdict === 'FAIL') ? 'FAIL' : 'UNKNOWN', { reason: error instanceof Error ? error.message : String(error) });
    await finish(null);
    for (const step of steps.slice(current + 1)) step.inputs = { blockedByStep: current + 1, reason: 'No substituted upstream outputs' };
  } finally {
    listeners.forEach(remove => remove()); await settle();
    await save('http-evidence.json', seen);
    await save('http-requests.json', requests);
    for (const context of contexts.reverse()) await context.close().catch(() => {});
    // Connected browser belongs to the operator; close disconnects this CDP client, not the browser server.
    await browser?.close();
    await save('lifecycle-final.json', { runtimeStarted: false, visitorContextsClosed: contexts.length, cdpDisconnected: true, ownerRuntime: 'operator-owned; not stopped by this attachment probe' });
    await persist();
  }
  return steps;
}
