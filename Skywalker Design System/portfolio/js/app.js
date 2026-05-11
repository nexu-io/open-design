/* ============================================================
   Skywalker Portfolio — App Router & Shell
   Hash-based SPA: #/ #/dashboard #/collection #/detail/:id
   ============================================================ */

const APP_EL = document.getElementById('app');
let currentRoute = { screen: 'landing', param: null };
window._filter = 'all';

/* ---- Sidebar HTML ---- */
function renderSidebar(active) {
  const groups = DATA.nav.groups.map(g => {
    const items = g.items.map(it => {
      const isActive = active === it.key;
      const dot = isActive ? '<span class="sw-active-dot"></span>' : '';
      return `<button class="sw-sidebar-item${isActive ? ' active' : ''}" onclick="navigate('${it.key}')">${icon(it.icon)}<span>${it.label}</span>${dot}</button>`;
    }).join('');
    return `<nav class="sw-sidebar-group"><div class="sw-sidebar-group-label">${g.label}</div>${items}</nav>`;
  }).join('');

  return `
    <aside class="sw-sidebar">
      <div class="sw-sidebar-header">
        ${cwMark(26)}
        <div>
          <div class="sw-name">Christian Wu</div>
          <div class="sw-version">skywalker · v0.42</div>
        </div>
      </div>
      ${groups}
      <div class="sw-sidebar-status">
        <div class="sw-sidebar-status-header">
          <span class="sw-live-dot"></span>
          <span>system online</span>
        </div>
        <div class="sw-sidebar-status-body">last deploy 12m<br>arbitrum-mainnet<br>3 mcp tools live</div>
      </div>
    </aside>`;
}

/* ---- TopBar HTML ---- */
function renderTopBar(crumbs) {
  const bc = crumbs.map((c, i) => {
    const cls = i === crumbs.length - 1 ? 'sw-crumb-active' : '';
    const sep = i < crumbs.length - 1 ? '<span class="sw-crumb-sep">/</span>' : '';
    return `<span class="${cls}">${c}</span>${sep}`;
  }).join('');

  return `
    <header class="sw-topbar">
      <div class="sw-breadcrumb">${bc}</div>
      <div class="sw-topbar-spacer"></div>
      <button class="sw-search-trigger">
        ${icon('search', 14)}
        <span>Search projects, tools, addresses…</span>
        <span style="margin-left:auto">${renderKbd('⌘K')}</span>
      </button>
      ${renderButton('0xa3f9…b21c', { variant: 'secondary', size: 'sm', iconLeft: 'wallet' })}
      <div class="sw-topbar-avatar"></div>
    </header>`;
}

/* ---- Screen dispatch ---- */
function renderScreen(screen, param) {
  currentRoute = { screen, param };
  const isLanding = screen === 'landing';

  if (isLanding) {
    APP_EL.innerHTML = renderLanding();
    return;
  }

  const crumbMap = {
    dashboard:  ['skywalker', 'dashboard'],
    collection: ['skywalker', 'collection'],
    detail:     ['skywalker', 'collection', param || 'item'],
    assistant:  ['skywalker', 'assistant'],
    mcp:        ['skywalker', 'mcp'],
    wallet:     ['skywalker', 'wallet'],
    casestudy:  ['skywalker', 'case-study', param || '023'],
    prototype:  ['skywalker', 'prototype'],
  };

  const screenRenderers = {
    dashboard:  () => renderDashboard(),
    collection: () => renderCollection(),
    detail:     () => renderDetail(param),
    assistant:  () => renderAssistant(),
    mcp:        () => renderMcp(),
    wallet:     () => renderWallet(),
    casestudy:  () => renderCaseStudy(param),
    prototype:  () => renderPrototype(),
  };

  const content = (screenRenderers[screen] || screenRenderers.dashboard)();

  APP_EL.innerHTML = `
    <div class="sw-shell" data-theme="dark">
      ${renderSidebar(screen)}
      <div class="sw-main">
        ${renderTopBar(crumbMap[screen] || ['skywalker'])}
        <div class="sw-content">${content}</div>
      </div>
    </div>`;
}

/* ---- Hash router ---- */
function navigate(screen, param) {
  const hash = param ? `#/${screen}/${param}` : `#/${screen === 'landing' ? '' : screen}`;
  window.location.hash = hash;
}

function handleRoute() {
  const hash = window.location.hash.replace('#/', '') || '';
  const parts = hash.split('/');
  const screen = parts[0] || 'landing';
  const param = parts[1] || null;
  renderScreen(screen, param);

  if (screen === 'prototype') {
    setTimeout(initCanvasPan, 50);
  }
}

function initCanvasPan() {
  const canvas = document.getElementById('sw-canvas');
  if (!canvas) return;
  
  let isDown = false;
  let startX, startY, scrollLeft, scrollTop;

  canvas.addEventListener('mousedown', (e) => {
    isDown = true;
    canvas.style.cursor = 'grabbing';
    startX = e.pageX - canvas.offsetLeft;
    startY = e.pageY - canvas.offsetTop;
    scrollLeft = canvas.scrollLeft;
    scrollTop = canvas.scrollTop;
  });
  window.addEventListener('mouseup', () => { isDown = false; if(canvas) canvas.style.cursor = 'grab'; });
  canvas.addEventListener('mouseleave', () => { isDown = false; canvas.style.cursor = 'grab'; });
  window.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - canvas.offsetLeft;
    const y = e.pageY - canvas.offsetTop;
    canvas.scrollLeft = scrollLeft - (x - startX) * 2;
    canvas.scrollTop = scrollTop - (y - startY) * 2;
  });
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  handleRoute();
});
