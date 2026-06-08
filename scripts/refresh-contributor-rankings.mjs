#!/usr/bin/env node
// Regenerate two static JS blocks in the public contributors page from live
// GitHub data, replacing the previously hand-edited snapshots:
//
//   1. RANKING_SNAPSHOT      — All-time + This Week leaderboards
//   2. CURATED_FIRST_ISSUES  — six newest open `good first issue` ∩ `help wanted`
//
// The page (apps/landing-page/public/community/contributors/index.html) reads
// both arrays at load time. Leaderboards are pre-baked rather than fetched
// client-side because /search/issues is heavily rate-limited for
// unauthenticated viewers (60 req/h per IP). The curated picks are pre-baked
// for the same reason and so the page degrades gracefully when GitHub is down.
//
// Inputs (env):
//   GITHUB_TOKEN          required — used for API calls + maintainers team
//   REPO                  default 'nexu-io/open-design'
//   GITHUB_RUN_STARTED_AT optional ISO-8601 — used as generatedAt; falls back
//                         to current time so the script also runs locally
//
// Output: apps/landing-page/public/community/contributors/index.html is rewritten
// in place. If nothing changed, the file is left untouched and the script exits
// 0 with a "no diff" log line — the GitHub Action's create-pull-request step
// will then skip PR creation automatically.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = path.join(
  ROOT,
  'apps/landing-page/public/community/contributors/index.html'
);
const EXCLUSIONS_PATH = path.join(ROOT, 'data/contributor-exclusions.json');

const REPO = process.env.REPO || 'nexu-io/open-design';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN is required.');
  process.exit(1);
}

const TEAM_ORG = 'nexu-io';
const TEAM_SLUG = 'core-maintainers';
const WEEKLY_TOP = 10;
const ALLTIME_TOP = 10;
const CURATED_TOP = 6;
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'open-design-refresh-contributor-rankings',
};

async function gh(pathSuffix, init = {}) {
  const url = pathSuffix.startsWith('http')
    ? pathSuffix
    : `https://api.github.com${pathSuffix}`;
  const res = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status} ${url}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

const TOKEN_BLOCKLIST = new Set(['bot', 'cursor', 'agent']);
// Known undelimited bot-account names (no separator → whole-token match misses
// them). Add new ones here as they appear; alphabetised.
const NAME_BLOCKLIST = new Set(['cursoragent']);

function isBotLike(login, type) {
  if (type === 'Bot') return true;
  const lower = login.toLowerCase();
  if (lower.endsWith('[bot]')) return true;
  if (NAME_BLOCKLIST.has(lower)) return true;
  for (const seg of lower.split(/[-_]/)) {
    if (TOKEN_BLOCKLIST.has(seg)) return true;
  }
  return false;
}

async function loadExclusions() {
  const data = JSON.parse(await readFile(EXCLUSIONS_PATH, 'utf8'));
  const set = new Set();
  for (const login of [...(data.internalStaff || []), ...(data.trustIssue || [])]) {
    set.add(login.toLowerCase());
  }
  // EXTRA_EXCLUDE: comma-separated logins, useful for local preview when the
  // maintainers team API isn't reachable (the workflow's bot has org:read; a
  // dev's PAT typically doesn't). Production runs leave this empty.
  if (process.env.EXTRA_EXCLUDE) {
    for (const s of process.env.EXTRA_EXCLUDE.split(',')) {
      const v = s.trim().toLowerCase();
      if (v) set.add(v);
    }
  }
  return set;
}

async function loadMaintainers() {
  // Returns lowercased logins of nexu-io/core-maintainers team members.
  // Requires the App token's installation to have org:read (Members: Read)
  // permission. If the call 403s, fail loud — silently skipping the maintainer
  // filter would let maintainers appear on the public leaderboard.
  const out = new Set();
  let pageUrl = `/orgs/${TEAM_ORG}/teams/${TEAM_SLUG}/members?per_page=100`;
  while (pageUrl) {
    const res = await fetch(`https://api.github.com${pageUrl}`, { headers: HEADERS });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Failed to load /${TEAM_ORG}/${TEAM_SLUG} members (${res.status}). ` +
          `Ensure the bot App installation has "Members: Read" org permission.\n${body.slice(0, 500)}`
      );
    }
    const items = await res.json();
    for (const u of items) out.add(u.login.toLowerCase());
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((s) => s.includes('rel="next"'));
    pageUrl = next ? next.match(/<([^>]+)>/)[1].replace('https://api.github.com', '') : null;
  }
  return out;
}

function isExcluded(user, excluded) {
  if (!user || !user.login) return true;
  if (isBotLike(user.login, user.type)) return true;
  return excluded.has(user.login.toLowerCase());
}

function isoDate(s) {
  return s ? s.slice(0, 10) : '';
}

async function fetchWeekly(excluded) {
  // Search for merged PRs in the last 7 days. The /search/issues endpoint caps
  // at 1000 results; for a 7-day window of one repo this is plenty of headroom.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`repo:${REPO} is:pr is:merged merged:>=${since}`);
  const grouped = new Map(); // login -> { user, prs: [{number,title,merged_at}] }
  let page = 1;
  for (;;) {
    const url = `/search/issues?q=${q}&sort=updated&order=desc&per_page=100&page=${page}`;
    const data = await gh(url);
    for (const it of data.items || []) {
      const u = it.user;
      if (isExcluded(u, excluded)) continue;
      const key = u.login;
      let entry = grouped.get(key);
      if (!entry) {
        entry = { user: u, prs: [] };
        grouped.set(key, entry);
      }
      entry.prs.push({
        number: it.number,
        title: it.title,
        merged_at: it.pull_request?.merged_at || it.closed_at || '',
      });
    }
    if (!data.items || data.items.length < 100) break;
    page += 1;
    if (page > 10) break; // 1000-result hard cap
  }
  const ranked = [...grouped.values()]
    .map((e) => {
      // Sort each user's PRs by merged date desc so examples are recent-first.
      e.prs.sort((a, b) => (b.merged_at || '').localeCompare(a.merged_at || ''));
      return {
        login: e.user.login,
        avatar: e.user.avatar_url,
        prs: e.prs.length,
        lastMerged: isoDate(e.prs[0]?.merged_at),
        examples: e.prs.slice(0, 2).map((p) => ({ number: p.number, title: p.title })),
      };
    })
    .sort((a, b) => b.prs - a.prs || a.login.localeCompare(b.login))
    .slice(0, WEEKLY_TOP);
  console.log(
    `[weekly] ${grouped.size} eligible authors after exclusion → top ${ranked.length}`
  );
  for (const r of ranked) console.log(`  ${r.login}\t${r.prs} PRs`);
  return ranked;
}

// Pick a short "skill" badge for the right-hand `.lang` column. Specific
// labels and title hints win over the generic `bug` label, otherwise every
// issue ends up tagged "Bug fix" and the badges look identical.
function inferSkill(labels, title) {
  const names = (labels || []).map((l) => (l.name || '').toLowerCase());
  const t = (title || '').toLowerCase();

  if (names.includes('docs') || names.includes('documentation') || t.includes('localiz') || t.includes('translat')) {
    return 'Docs';
  }
  if (names.some((n) => n.includes('a11y') || n.includes('accessibility'))) return 'A11y';
  if (names.some((n) => n.includes('test') || n.includes('e2e'))) return 'Tests';
  if (names.some((n) => n.includes('perf'))) return 'Perf';
  if (names.some((n) => n.includes('plugin'))) return 'Plugins';
  if (names.some((n) => n.includes('skill'))) return 'Skills';
  if (names.some((n) => n.includes('cli'))) return 'CLI';
  if (names.some((n) => n.includes('design system')) || t.includes('design system')) return 'Design system';
  if (names.some((n) => n.includes('ux'))) return 'UX';
  // Fallback: derive from title keywords so 6 picks don't all read "Bug fix".
  if (/(tooltip|hover|popover|menu|picker|dropdown|@\s*mention)/i.test(t)) return 'Popover';
  if (/(layout|spacing|clip|crop|wrap|overflow|align|padding|margin)/i.test(t)) return 'CSS/UI';
  if (/(focus|keyboard|escape|enter\b|tab\b)/i.test(t)) return 'A11y';
  if (/(animation|transition|motion)/i.test(t)) return 'Motion';
  if (/(preview|thumbnail|render|paint|frame)/i.test(t)) return 'Render';
  if (/(form|input|field|button|toggle)/i.test(t)) return 'Form';
  if (/(undo|redo|delete|confirm|destructive)/i.test(t)) return 'UX safety';
  if (names.some((n) => n.includes('bug'))) return 'Bug fix';
  return 'Polish';
}

async function fetchCuratedIssues() {
  // good first issue ∩ help wanted, open, unassigned, sorted by recently
  // created. The intersection is the same heuristic the previous human-curated
  // batch in PR #3883 used: "good first issue" alone is too noisy; combining
  // with "help wanted" produces issues maintainers have explicitly invited
  // outside contribution on.
  const q = encodeURIComponent(
    `repo:${REPO} is:issue is:open no:assignee label:"good first issue" label:"help wanted"`
  );
  const data = await gh(
    `/search/issues?q=${q}&sort=created&order=desc&per_page=${CURATED_TOP * 2}`
  );
  const items = (data.items || []).slice(0, CURATED_TOP).map((it) => ({
    number: it.number,
    title: it.title,
    html_url: it.html_url,
    labels: (it.labels || []).map((l) => ({ name: l.name })),
    skill: inferSkill(it.labels, it.title),
  }));
  console.log(`[curated] ${items.length} good-first-issue + help-wanted picks`);
  for (const r of items) console.log(`  #${r.number}\t${r.skill}\t${r.title.slice(0, 80)}`);
  return items;
}

async function fetchAllTime(excluded) {
  // /repos/.../contributors returns 100 contributors per page sorted by
  // contribution count desc. We need only enough to fill the top after
  // exclusion — pull two pages to be safe.
  const out = [];
  for (const page of [1, 2]) {
    const data = await gh(
      `/repos/${REPO}/contributors?per_page=100&anon=false&page=${page}`
    );
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  // The /contributors endpoint omits user.type. Probe per candidate via /users/{login}
  // only when we'd otherwise include them, to keep the request count bounded.
  const ranked = [];
  let totalSeen = 0;
  for (const c of out) {
    if (!c.login) continue;
    totalSeen += 1;
    if (excluded.has(c.login.toLowerCase())) continue;
    if (isBotLike(c.login, c.type)) continue;
    ranked.push({
      login: c.login,
      avatar: c.avatar_url,
      commits: c.contributions,
      lastMerged: 'long-running contributor',
    });
    if (ranked.length >= ALLTIME_TOP) break;
  }
  console.log(
    `[allTime] ${totalSeen} candidates seen → top ${ranked.length} after exclusion`
  );
  for (const r of ranked) console.log(`  ${r.login}\t${r.commits} commits`);
  return ranked;
}

// JS-string literal escaper for values that go inside single quotes.
function jsStr(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function renderCurated(items) {
  if (items.length === 0) return 'const CURATED_FIRST_ISSUES = [];';
  const blocks = items.map((it) => {
    const labels = it.labels
      .map((l) => `{ name: '${jsStr(l.name)}' }`)
      .join(', ');
    return [
      '  {',
      `    number: ${it.number},`,
      `    title: '${jsStr(it.title)}',`,
      `    html_url: '${jsStr(it.html_url)}',`,
      `    labels: [${labels}],`,
      `    skill: '${jsStr(it.skill)}'`,
      '  }',
    ].join('\n');
  });
  return ['const CURATED_FIRST_ISSUES = [', blocks.join(',\n'), '];'].join('\n');
}

function renderSnapshot({ generatedAt, weekly, allTime }) {
  const filters = [
    'core maintainers',
    'known internal staff',
    'type:Bot',
    '[bot] suffix',
    'whole-token match: bot / cursor / agent',
  ];
  const weeklyLines = weekly.map((c) => {
    const examples = c.examples
      .map((e) => `{number:${e.number},title:'${jsStr(e.title)}'}`)
      .join(',');
    return `    { login:'${jsStr(c.login)}', avatar:'${jsStr(c.avatar)}', prs:${c.prs}, lastMerged:'${jsStr(c.lastMerged)}', examples:[${examples}] }`;
  });
  const allTimeLines = allTime.map(
    (c) =>
      `    { login:'${jsStr(c.login)}', avatar:'${jsStr(c.avatar)}', commits:${c.commits}, lastMerged:'${jsStr(c.lastMerged)}' }`
  );
  const filterLines = filters.map((f) => `'${jsStr(f)}'`).join(', ');

  return [
    'const RANKING_SNAPSHOT = {',
    `  generatedAt: '${jsStr(generatedAt)}',`,
    `  source: 'Curated contributor records for the Open Design community page.',`,
    `  filters: [${filterLines}],`,
    '  weekly: [',
    weeklyLines.join(',\n'),
    '  ],',
    '  allTime: [',
    allTimeLines.join(',\n'),
    '  ]',
    '};',
  ].join('\n');
}

async function main() {
  const generatedAt =
    process.env.GITHUB_RUN_STARTED_AT || new Date().toISOString();
  console.log(`Refreshing contributor rankings @ ${generatedAt} for ${REPO}`);

  const fileExclusions = await loadExclusions();
  const maintainers = process.env.SKIP_MAINTAINERS === '1'
    ? new Set()
    : await loadMaintainers();
  console.log(
    `Exclusions: ${fileExclusions.size} from JSON + ${maintainers.size} maintainers + bot-like rules`
  );
  const excluded = new Set([...fileExclusions, ...maintainers]);

  const [weekly, allTime, curated] = await Promise.all([
    fetchWeekly(excluded),
    fetchAllTime(excluded),
    fetchCuratedIssues(),
  ]);

  const snapshotBlock = renderSnapshot({ generatedAt, weekly, allTime });
  const curatedBlock = renderCurated(curated);

  const html = await readFile(HTML_PATH, 'utf8');
  const next = replaceBlock(
    replaceBlock(html, /const RANKING_SNAPSHOT = \{[\s\S]*?\n\};/, snapshotBlock, 'RANKING_SNAPSHOT'),
    /const CURATED_FIRST_ISSUES = \[[\s\S]*?\n\];/,
    curatedBlock,
    'CURATED_FIRST_ISSUES'
  );
  if (next === html) {
    console.log('No change — leaderboard and curated issues already up to date.');
    return;
  }
  await writeFile(HTML_PATH, next);
  console.log(`Wrote refreshed snapshot to ${HTML_PATH}`);
}

function replaceBlock(source, re, replacement, label) {
  const all = source.match(new RegExp(re.source, 'g'));
  if (!all) {
    throw new Error(
      `Could not find ${label} block in HTML. The page layout may have changed; update this script.`
    );
  }
  if (all.length !== 1) {
    throw new Error(
      `Found ${all.length} ${label} blocks in HTML; refusing to rewrite.`
    );
  }
  return source.replace(re, replacement);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
