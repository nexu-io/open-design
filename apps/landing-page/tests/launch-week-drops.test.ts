import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { onRequest } from '../functions/launch-week/drops.ts';

const KEY = 'test-preview-key';

const call = async (url: string, now?: number, env: { LAUNCH_WEEK_PREVIEW_KEY?: string } = { LAUNCH_WEEK_PREVIEW_KEY: KEY }) => {
  const realNow = Date.now;
  if (now !== undefined) Date.now = () => now;
  try {
    const response = await onRequest({ request: new Request(url), env });
    return { response, body: (await response.json()) as { drops: { day: number; html: string }[]; preview: string | null } };
  } finally {
    Date.now = realNow;
  }
};

const at = (iso: string) => Date.parse(iso);
const ENDPOINT = 'https://open-design.ai/launch-week/drops';

test('an unopened day is never served', async () => {
  const { body } = await call(ENDPOINT, at('2026-08-10T03:59:00Z'));
  assert.deepEqual(body.drops, [], 'nothing is public before the week opens');

  const midweek = await call(ENDPOINT, at('2026-08-12T09:00:00Z'));
  assert.deepEqual(
    midweek.body.drops.map((d) => d.day),
    [1, 2, 3],
    'day 3 is open, days 4 and 5 are still secret',
  );

  const after = await call(ENDPOINT, at('2026-09-01T00:00:00Z'));
  assert.equal(after.body.drops.length, 5, 'the whole week stays up once it has run');
});

test('a day opens at 12:00 UTC+8 exactly', async () => {
  const before = await call(ENDPOINT, at('2026-08-10T04:00:00Z') - 1);
  assert.equal(before.body.drops.length, 0);

  const on = await call(ENDPOINT, at('2026-08-10T04:00:00Z'));
  assert.equal(on.body.drops.length, 1);
});

test('preview needs the key, and is never cached', async () => {
  const guessed = await call(`${ENDPOINT}?preview=all`, at('2026-08-09T00:00:00Z'));
  assert.deepEqual(guessed.body.drops, [], 'a bare ?preview= is ignored');
  assert.match(guessed.response.headers.get('Cache-Control') ?? '', /^public/);

  const keyed = await call(`${ENDPOINT}?preview=4&key=${KEY}`, at('2026-08-09T00:00:00Z'));
  assert.deepEqual(
    keyed.body.drops.map((d) => d.day),
    [1, 2, 3, 4],
    'the team can rehearse a day before it opens',
  );
  assert.equal(keyed.response.headers.get('Cache-Control'), 'no-store');
});

test('the edge stops caching a day at its boundary', async () => {
  const { response } = await call(ENDPOINT, at('2026-08-11T03:00:00Z'));
  const maxAge = Number(/s-maxage=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1]);
  assert.ok(maxAge <= 3600, 'day 2 cannot be held back by a stale day-1 response');
});

test('every locale serves its own drops, and an unknown one falls back', async () => {
  const zh = await call(`${ENDPOINT}?locale=zh`, at('2026-08-14T04:00:00Z'));
  const en = await call(`${ENDPOINT}?locale=en`, at('2026-08-14T04:00:00Z'));
  const bogus = await call(`${ENDPOINT}?locale=xx`, at('2026-08-14T04:00:00Z'));

  assert.equal(zh.body.drops.length, 5);
  assert.notDeepEqual(zh.body.drops, en.body.drops, 'zh is translated, not the English copy');
  assert.deepEqual(bogus.body.drops, en.body.drops, 'an unknown locale still renders');
});

test('the page itself ships no revealed drop', () => {
  const dir = new URL('../app/_partials/', import.meta.url);
  const partials = readdirSync(dir).filter((f) => f.startsWith('launch-week-main'));

  assert.ok(partials.length >= 11, 'every locale is covered');
  for (const file of partials) {
    const html = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(html, /data-secret/, `${file} would leak the running order in view-source`);
    assert.equal(
      html.match(/class="drop is-classified/g)?.length,
      5,
      `${file} needs a sealed card for all five days`,
    );
  }
});

test('a day with no post link ships no Watch button, not a dead one', async () => {
  const { body } = await call(`${ENDPOINT}?preview=all&key=${KEY}`, at('2026-08-09T00:00:00Z'));
  const html = body.drops.map((d) => d.html).join('');

  assert.doesNotMatch(html, /href="#"/, 'no button may point at nothing');
  assert.doesNotMatch(html, /class="watch"/, 'with DROP_LINKS empty, no day has a button yet');
});

test('the key is never in anything we serve to a visitor', () => {
  const dir = new URL('../app/', import.meta.url);
  const page = readFileSync(new URL('pages/community/events/launch-week/index.astro', dir), 'utf8');

  assert.doesNotMatch(page, /PREVIEW_KEY|dry-run/, 'the page must not carry the key it is protected by');
  assert.doesNotMatch(
    readFileSync(new URL('../functions/launch-week/drops.ts', import.meta.url), 'utf8'),
    /const .*KEY.*=\s*['"`][^'"`]+['"`]/,
    'the key belongs in the Pages secret, not in a public repository',
  );
});

test('no secret configured means no preview, not an open week', async () => {
  const { body } = await call(`${ENDPOINT}?preview=all&key=${KEY}`, at('2026-08-09T00:00:00Z'), {});
  assert.deepEqual(body.drops, [], 'a missing secret fails closed');
  assert.equal(body.preview, null);
});

test('the response reports which preview it honoured', async () => {
  const honoured = await call(`${ENDPOINT}?preview=3&key=${KEY}`, at('2026-08-09T00:00:00Z'));
  assert.equal(honoured.body.preview, '3', 'the page has no key, so it needs telling');

  const rejected = await call(`${ENDPOINT}?preview=3&key=wrong`, at('2026-08-09T00:00:00Z'));
  assert.equal(rejected.body.preview, null);
  assert.deepEqual(rejected.body.drops, []);
});
