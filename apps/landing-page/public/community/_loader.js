/**
 * Open Design — Contributors page
 * Open Design — Contributors page
 * Leaderboards render from curated project records. GitHub calls hydrate
 * good-first issues and maintainer profile details only.
 */

const REPO = 'nexu-io/open-design';
const API = (window.OPEN_DESIGN_API || 'https://api.github.com');
const HEADERS = (() => {
  const h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (window.GITHUB_TOKEN) h['Authorization'] = 'Bearer ' + window.GITHUB_TOKEN;
  return h;
})();

/* Open Design core team and internal accounts. Lowercased GitHub logins. */
const CORE_TEAM = new Set([
  'pftom','mrcfps','sophia','ashleyashli','qiongyu1999','zoeforfun',
  'perishcode','nettee','anthhub','siri-ray','lefarcen',
  'alchemistklk','shangxinyu1','joeylee12629-star','tuola-waj',
  'leilei926524-tech','nagendhra-web','sid-qin','chaoxiaoche'
].map(s => s.toLowerCase()));
function isCore(login){ return login && CORE_TEAM.has(String(login).toLowerCase()); }
const BOT_LOGINS = new Set(['open-design-bot','opendesign-bot','nexu-bot','open-design-bot[bot]']);
/* Whole-token match on bot/cursor/agent so real logins like
   'agentina', 'cursorsmith', 'robothai' are not silently dropped.
   Token boundaries are start, end, '-', or '_'. */
const BOT_TOKEN_RE = /(?:^|[-_])(?:bot|cursor|agent)(?:$|[-_])/;
function isBot(c){
  if (!c) return false;
  if (c.type === 'Bot') return true;
  const login = String(c.login || '').toLowerCase();
  if (!login) return false;
  if (login.endsWith('[bot]')) return true;
  if (BOT_TOKEN_RE.test(login)) return true;
  return BOT_LOGINS.has(login);
}
function isExcluded(c){
  const login = c && c.login;
  return !login || isCore(login) || isBot(c);
}

const RANKING_SNAPSHOT = {
  generatedAt: '2026-05-26T12:25:59Z',
  source: 'Curated contributor records for the Open Design community page.',
  filters: ['core maintainers', 'known internal staff', 'type:Bot', '[bot] suffix', 'whole-token match: bot / cursor / agent'],
  weekly: [
    { login:'bulai0408', avatar:'https://avatars.githubusercontent.com/u/31983330?v=4', prs:19, lastMerged:'2026-05-26', examples:[{number:2006,title:'fix(daemon): fail disallowed connector tool selections'},{number:2331,title:'fix(web): align HomeHero prompt overlay metrics'}] },
    { login:'522700967-wq', avatar:'https://avatars.githubusercontent.com/u/270050048?v=4', prs:14, lastMerged:'2026-05-26', examples:[{number:2958,title:'feat(landing-page): plugin detail page interactive preview + share dialog'},{number:2880,title:'fix(landing-page): copy example.html sibling assets in post-build'}] },
    { login:'YUHAO-corn', avatar:'https://avatars.githubusercontent.com/u/201702441?v=4', prs:10, lastMerged:'2026-05-26', examples:[{number:2971,title:'fix(web): align draw note enter action'},{number:2036,title:'fix(plugins): reject symlinked plugin assets'}] },
    { login:'xxiaoxiong', avatar:'https://avatars.githubusercontent.com/u/27723864?v=4', prs:10, lastMerged:'2026-05-26', examples:[{number:2932,title:'fix: synchronously update URL when creating new conversation to prevent route-sync conflict'},{number:2931,title:'fix: re-activate srcDoc transport when exiting Edit mode to prevent blank preview'}] },
    { login:'YOMXXX', avatar:'https://avatars.githubusercontent.com/u/18409951?v=4', prs:10, lastMerged:'2026-05-26', examples:[{number:2419,title:'feat(daemon): structured diagnostics for agent connection test results'},{number:2576,title:'fix(web): route chat file links to workspace preview instead of new window'}] },
    { login:'portseif', avatar:'https://avatars.githubusercontent.com/u/13489304?v=4', prs:9, lastMerged:'2026-05-25', examples:[{number:2847,title:'Capture native Swift source in the GitHub design import'},{number:2848,title:'Polish the design system review panel'}] },
    { login:'leessju', avatar:'https://avatars.githubusercontent.com/u/40141791?v=4', prs:7, lastMerged:'2026-05-26', examples:[{number:2844,title:'fix(web): live-update preview during Comment mode'},{number:2839,title:'fix(web): preserve chat composer drafts across refreshes'}] },
    { login:'GHX5T-SOL', avatar:'https://avatars.githubusercontent.com/u/200635707?v=4', prs:7, lastMerged:'2026-05-23', examples:[{number:2483,title:'Create design-system conversations from New action'},{number:2491,title:'fix(web): retry failed chat runs without duplicating user message'}] },
    { login:'neogenix', avatar:'https://avatars.githubusercontent.com/u/141967?v=4', prs:6, lastMerged:'2026-05-26', examples:[{number:2311,title:'chore(deps): upgrade express 4 -> 5 in daemon'},{number:2305,title:'chore(e2e): improve test framework quality'}] },
    { login:'prantikmedhi', avatar:'https://avatars.githubusercontent.com/u/140103052?v=4', prs:5, lastMerged:'2026-05-26', examples:[{number:2940,title:'fix: keep raw HTML source out of artifact chat prose'},{number:1556,title:'fix: hide preview chrome in source view'}] }
  ],
  allTime: [
    { login:'bulai0408', avatar:'https://avatars.githubusercontent.com/u/31983330?v=4', commits:37, lastMerged:'long-running contributor' },
    { login:'Nicholas-Xiong', avatar:'https://github.com/Nicholas-Xiong.png', commits:35, lastMerged:'long-running contributor' },
    { login:'YUHAO-corn', avatar:'https://avatars.githubusercontent.com/u/201702441?v=4', commits:34, lastMerged:'long-running contributor' },
    { login:'leessju', avatar:'https://avatars.githubusercontent.com/u/40141791?v=4', commits:16, lastMerged:'long-running contributor' },
    { login:'prantikmedhi', avatar:'https://avatars.githubusercontent.com/u/140103052?v=4', commits:15, lastMerged:'long-running contributor' },
    { login:'522700967-wq', avatar:'https://avatars.githubusercontent.com/u/270050048?v=4', commits:14, lastMerged:'long-running contributor' },
    { login:'mturac', avatar:'https://avatars.githubusercontent.com/u/345446?v=4', commits:13, lastMerged:'long-running contributor' },
    { login:'Mason', avatar:'https://github.com/Mason.png', commits:12, lastMerged:'long-running contributor' },
    { login:'portseif', avatar:'https://avatars.githubusercontent.com/u/13489304?v=4', commits:10, lastMerged:'long-running contributor' },
    { login:'GHX5T-SOL', avatar:'https://avatars.githubusercontent.com/u/200635707?v=4', commits:8, lastMerged:'long-running contributor' }
  ]
};

async function gh(path) {
  const res = await fetch(`${API}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`);
  return res.json();
}

function fmt(n){ return n == null ? '—' : (n >= 10000 ? (n/1000).toFixed(1)+'k' : n.toLocaleString()) }
function pad2(n){ return (n<10?'0':'')+n }

function leaderboardRows(list, metricKey, metricLabel){
  return list.slice(1).map((c,i) => `
    <a class="row" href="https://github.com/${c.login}" target="_blank" rel="noopener" title="${escapeHtml(metricLabel)} · rank ${pad2(i+2)}">
      <span class="rk">${pad2(i+2)}</span>
      <span class="who">
        <img src="${c.avatar}" alt="${c.login}" loading="lazy" onerror="this.style.visibility='hidden'"/>
        <span><span class="n">${c.login}</span><span class="h">@${c.login}</span></span>
      </span>
      <span class="v">${fmt(c[metricKey])}</span>
      <span class="v coral">#${pad2(i+2)}</span>
      <span class="arr">→</span>
    </a>`).join('');
}

function exampleCopy(c){
  return (c.examples || []).slice(0,2).map(pr => `#${pr.number} ${pr.title}`).join(' · ');
}

/* --------- weekly top 10 --------- */
async function loadWeeklyTop(){
  const ranked = RANKING_SNAPSHOT.weekly.filter(c => !isExcluded(c));
  const f = ranked[0];
  if (!f) return;
  document.getElementById('feat-avatar').src = f.avatar;
  document.getElementById('feat-avatar').alt = f.login;
  setText('feat-name', f.login);
  setText('feat-handle', '@' + f.login + ' · leading this week');
  setText('feat-blurb', `${f.login} is setting the pace this week with ${f.prs} merged PR${f.prs === 1 ? '' : 's'} and the kind of steady craft that keeps Open Design moving.`);
  setText('feat-prs-list', exampleCopy(f));
  setText('feat-rank', '#01');
  setText('feat-prs', f.prs);
  document.getElementById('leaderboard-rows').innerHTML = leaderboardRows(ranked, 'prs', 'Merged PRs');
}

/* --------- all-time top 10 --------- */
async function loadAllTimeTop(){
  const top = RANKING_SNAPSHOT.allTime.filter(c => !isExcluded(c));
  const f = top[0];
  if (!f) return;
  document.getElementById('feat-avatar-at').src = f.avatar;
  document.getElementById('feat-avatar-at').alt = f.login;
  setText('feat-name-at', f.login);
  setText('feat-handle-at', '@' + f.login + ' · deep contributor signal');
  setText('feat-commits-at', fmt(f.commits));
  document.getElementById('leaderboard-rows-at').innerHTML = leaderboardRows(top, 'commits', 'Commits');
}

/* --------- good first issues --------- */
async function loadGoodFirstIssues(){
  try {
    const r = await gh(`/search/issues?q=repo:${REPO}+is:issue+is:open+label:%22good+first+issue%22&sort=created&order=desc&per_page=8`);
    const items = r.items || [];
    setText('issue-count', items.length);
    if (!items.length){
      document.getElementById('issue-list').innerHTML = '<div class="issue" style="color:var(--ink-faint);padding:36px 0">No open good-first-issues right now. Check back tomorrow, or open one yourself ↗</div>';
      return;
    }
    const html = items.map((it,i) => {
      const lang = inferLang(it.title);
      return `
        <a class="issue" href="${it.html_url}" target="_blank" rel="noopener">
          <span class="num">${pad2(i+1)}</span>
          <div class="body">
            <div class="title">${escapeHtml(it.title)}</div>
            <div class="meta">
              <span class="label good">good first issue</span>
              ${(it.labels||[]).filter(l=>l.name!=='good first issue').slice(0,3).map(l=>`<span class="label ${inferLabelClass(l.name)}">${escapeHtml(l.name)}</span>`).join('')}
            </div>
          </div>
          <span class="lang">${lang}</span>
          <span class="arr">→</span>
        </a>`;
    }).join('');
    document.getElementById('issue-list').innerHTML = html;
  } catch(e){
    console.warn('issues failed', e);
    setText('issue-count', '—');
    const list = document.getElementById('issue-list');
    if (list) list.innerHTML = '<a class="issue" href="https://github.com/nexu-io/open-design/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22" target="_blank" rel="noopener"><span class="num">—</span><div class="body"><div class="title">GitHub rate limit reached in preview. Open the live good-first-issue search on GitHub.</div><div class="meta"><span class="label good">good first issue</span><span class="label docs">live GitHub search</span></div></div><span class="lang">WEB</span><span class="arr">→</span></a>';
  }
}

function inferLabelClass(name){
  const n = (name||'').toLowerCase();
  if (n.includes('docs')||n.includes('doc')) return 'docs';
  if (n.includes('bug')) return 'bug';
  if (n.includes('design')||n.includes('ui')) return 'design';
  return 'lang';
}
function inferLang(title){
  const t = (title||'').toLowerCase();
  if (t.includes('typescript')||t.includes('.ts')) return 'TS';
  if (t.includes('python')) return 'PY';
  if (t.includes('css')||t.includes('html')||t.includes('design')) return 'CSS';
  if (t.includes('docs')||t.includes('readme')) return 'MD';
  return 'JS/TS';
}

/* --------- maintainers (real GitHub profiles) --------- */
const MAINTAINERS = ['Nagendhra-web', 'Sid-Qin'];
async function loadMaintainers(){
  await Promise.all(MAINTAINERS.map(async (login, i) => {
    try {
      const u = await gh(`/users/${login}`);
      const idx = i + 1;
      if (u.name) setText(`m-${idx}-name`, u.name);
      // Keep the curated maintainer story visible; profile bios are too short for this page.
    } catch (e) { /* leave the static fallback */ }
  }));
}

/* --------- helpers --------- */
function setText(id, v){ const el = document.getElementById(id); if (el && v != null) el.textContent = v; }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* --------- copy-to-clipboard for the install command --------- */
function wireCopyButtons(){
  document.querySelectorAll('[data-install] [data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cmd = btn.parentElement.getAttribute('data-install') || '';
      try { await navigator.clipboard.writeText(cmd); }
      catch { /* very old browsers — let the user select the text manually */ return; }
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('is-copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('is-copied'); }, 1600);
    });
  });
}

/* --------- boot --------- */
(async function(){
  wireCopyButtons();
  await Promise.all([ loadWeeklyTop(), loadAllTimeTop(), loadGoodFirstIssues(), loadMaintainers() ]);
})();
