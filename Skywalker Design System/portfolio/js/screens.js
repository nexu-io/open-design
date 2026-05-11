/* ============================================================
   Skywalker Portfolio — Screen Renderers
   ============================================================ */

function renderLanding() {
  const projects3 = DATA.projects.slice(0, 3).map(p =>
    renderProjectCard(p, { onclick: `navigate('detail','${p.id}')` })
  ).join('');

  return `
  <div class="sw-landing" data-theme="dark">
    <div class="sw-grid-bg" aria-hidden="true"></div>
    <div style="position:absolute;left:50%;top:20%;transform:translateX(-50%)"><div class="sw-hero-glow"></div></div>

    <header class="sw-landing-nav">
      ${logoLockup(20)}
      <nav class="sw-landing-nav-links">
        <a class="active" href="#/">work</a>
        <a href="#/collection">writing</a>
        <a href="#/mcp">open source</a>
        <a href="#/wallet">about</a>
      </nav>
      <div class="sw-landing-nav-cta">
        ${renderButton('github', { variant: 'ghost', size: 'sm', iconLeft: 'github' })}
        ${renderButton('enter portfolio', { variant: 'primary', size: 'sm', glow: true, iconRight: 'arrow', onclick: "navigate('dashboard')" })}
      </div>
    </header>

    <section class="sw-hero">
      <div class="sw-hero-badge">${renderTag(`${icon('dot')}v0.42 — now with on-chain case studies`, { tone: 'accent' })}</div>
      <h1 class="sw-hero-title">AI-native interfaces<br><span class="sw-cyan">shipped on-chain.</span></h1>
      <p class="sw-hero-sub">I'm Christian Wu — designer–engineer building Web3 product surfaces, MCP tooling and AI assistant systems. Twelve case studies, three production tools, ledgered work.</p>
      <div class="sw-hero-cta">
        ${renderButton('browse selected work', { variant: 'primary', size: 'lg', glow: true, iconRight: 'arrow', onclick: "navigate('collection')" })}
        ${renderButton('ask the assistant', { variant: 'glass', size: 'lg', iconLeft: 'sparkle', onclick: "navigate('assistant')" })}
      </div>
      <div class="sw-hero-stats">
        ${DATA.heroStats.map(s => `<div class="sw-hero-stat"><span class="sw-hero-stat-num">${s.num}</span><span class="sw-hero-stat-label">${s.label}</span></div>`).join('')}
      </div>
    </section>

    <section class="sw-featured-shelf">
      <div class="sw-section-header">
        <div>${renderEyebrow('// featured')}<h2 class="sw-section-title" style="font-size:var(--t-h4)">Selected Work</h2></div>
        ${renderButton('view all 12', { variant: 'ghost', size: 'sm', iconRight: 'arrow', onclick: "navigate('collection')" })}
      </div>
      <div class="sw-grid-3">${projects3}</div>
    </section>
  </div>`;
}

function renderDashboard() {
  const stats = DATA.dashStats.map(s => renderCard(`<div class="sw-metric">${renderMetric(s.label, s.value, s.sub, { color: s.color })}</div>`, { style: 'padding:0' })).join('');
  const projects3 = DATA.projects.slice(0, 3).map(p => renderProjectCard(p, { onclick: `navigate('detail','${p.id}')` })).join('');
  const activityRows = DATA.activity.map(renderActivityRow).join('');
  const chartPeriods = ['7d','30d','90d','all'].map((p, i) =>
    `<button class="sw-chart-period${i === 1 ? ' active' : ''}">${p}</button>`
  ).join('');

  return `
  <div class="sw-content-inner">
    <div class="sw-section-header">
      <div>
        ${renderEyebrow('// dashboard')}
        <h1 class="sw-section-title">Welcome back, Christian.</h1>
        <p class="sw-section-subtitle">Last deployment 12 minutes ago to <span style="font-family:var(--font-mono)">arbitrum-mainnet</span> via Skywalker CLI.</p>
      </div>
      <div style="display:flex;gap:8px">
        ${renderButton('open cli', { variant: 'secondary', size: 'sm', iconLeft: 'term' })}
        ${renderButton('new deployment', { variant: 'primary', size: 'sm', glow: true, iconLeft: 'zap' })}
      </div>
    </div>
    <div class="sw-grid-4" style="margin-top:26px">${stats}</div>
    <div class="sw-dash-2col">
      ${renderCard(`<div class="sw-card__body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>${renderEyebrow('// volume · 30d')}<div style="font-family:var(--font-mono);font-size:24px;font-weight:500;margin-top:6px">0.84 <span style="color:var(--fg-muted)">Ξ</span></div></div>
          <div class="sw-chart-controls">${chartPeriods}</div>
        </div>
        ${renderSparkChart()}
      </div>`, { style: 'padding:0' })}
      ${renderCard(`<div class="sw-card__body">
        ${renderEyebrow('// activity')}
        <div style="margin-top:14px">${activityRows}</div>
      </div>`, { style: 'padding:0' })}
    </div>
    <div style="margin-top:28px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        ${renderEyebrow('// recent work')}
        ${renderButton('open collection', { variant: 'ghost', size: 'sm', iconRight: 'arrow', onclick: "navigate('collection')" })}
      </div>
      <div class="sw-grid-3">${projects3}</div>
    </div>
  </div>`;
}

function renderCollection() {
  const currentFilter = window._filter || 'all';
  const items = currentFilter === 'all' ? DATA.projects : DATA.projects.filter(p => p.tags.includes(currentFilter));
  const pills = DATA.filters.map(f =>
    `<button class="sw-filter-pill${f === currentFilter ? ' active' : ''}" onclick="window._filter='${f}';renderScreen('collection')">${f}</button>`
  ).join('');
  const cards = items.map(p => renderProjectCard(p, { onclick: `navigate('detail','${p.id}')` })).join('');

  return `
  <div class="sw-content-inner">
    ${renderEyebrow('// /collection')}
    <h1 class="sw-section-title">Selected Work</h1>
    <p class="sw-section-subtitle" style="max-width:560px">Twelve case studies, ledgered on-chain. Each one links to a deployable artifact, a write-up and the source repo.</p>
    <div class="sw-filter-row" style="margin-top:26px">
      <div class="sw-filter-pills">${pills}</div>
      <div class="sw-filter-meta">
        <span class="sw-filter-count">${items.length} items</span>
        ${renderButton('grid', { variant: 'secondary', size: 'sm', iconLeft: 'grid' })}
        ${renderButton('sort: recent', { variant: 'secondary', size: 'sm', iconRight: 'chevD' })}
      </div>
    </div>
    <div class="sw-grid-3" style="margin-top:22px">${cards}</div>
  </div>`;
}

function renderDetail(id) {
  const p = DATA.projects.find(x => x.id === id) || DATA.projects[0];
  const thumbs = [1,2,3,4].map(i => `<div class="sw-detail-thumb${i===1?' active':''}" style="background:${DATA.coverGradients['gradient-'+i]}"></div>`).join('');
  const props = [['role','design + eng'],['stack','ts · react · viem'],['surface','mcp + cli'],['team','solo'],['duration','6 weeks'],['license','MIT']];
  const propsHtml = props.map(([k,v]) => `<div class="sw-detail-prop"><div class="sw-stat-label">${k}</div><div style="font-family:var(--font-mono);font-size:12px;margin-top:2px">${v}</div></div>`).join('');

  return `
  <div class="sw-content-inner">
    <div class="sw-detail-layout">
      <div>
        <div class="sw-detail-cover" style="background:${DATA.coverGradients[p.cover]}">
          <div class="sw-project-cover-shine"></div>
          <div style="position:absolute;left:18px;top:16px;font-family:var(--font-mono);font-size:12px;color:rgba(255,255,255,0.85);letter-spacing:0.1em">// ${p.id} · ${p.year}</div>
          <div style="position:absolute;right:18px;bottom:16px">${logoLockup(20)}</div>
        </div>
        <div class="sw-detail-thumbs">${thumbs}</div>
      </div>
      <div>
        ${renderTag(p.status, { tone: 'success', dot: true })}
        <h1 style="font-size:var(--t-h2);font-weight:600;margin:14px 0 6px">${p.title}</h1>
        <div style="font-family:var(--font-mono);font-size:13px;color:var(--fg-muted)">case-study/${p.id} · ledgered on ${p.chain}</div>
        <div class="sw-detail-pricing">
          <div class="sw-detail-pricing-grid">
            <div>${renderEyebrow('price')}<div style="font-family:var(--font-mono);font-size:32px;font-weight:500;margin-top:4px">${p.price} Ξ</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)">≈ $1,284 USD</div></div>
            <div>${renderEyebrow('edition')}<div style="font-family:var(--font-mono);font-size:32px;font-weight:500;margin-top:4px">1 / 1</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)">unique edition</div></div>
          </div>
          <div class="sw-detail-pricing-actions">
            ${renderButton(`collect on ${p.chain}`, { variant: 'primary', glow: true, iconLeft: 'eth' })}
            ${renderButton('read case study', { variant: 'secondary', iconLeft: 'doc', onclick: `navigate('casestudy','${p.id}')` })}
          </div>
        </div>
        <div style="margin-top:24px">${renderEyebrow('// abstract')}<p style="margin-top:8px;color:var(--fg-secondary);line-height:1.6">A unified MCP server exposing my design and engineering toolchain as callable tools. Includes Figma export, Claude composer, on-chain ledger and Skywalker CLI bindings. Shipped to arbitrum mainnet.</p></div>
        <div style="margin-top:22px">${renderEyebrow('// properties')}<div class="sw-detail-properties">${propsHtml}</div></div>
        <div class="sw-detail-owner">
          ${cwMark(32)}
          <div style="flex:1"><div style="font-weight:600;font-size:13px">Christian Wu</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)">0xa3f9…b21c · creator + owner</div></div>
          ${renderButton('view on chain', { variant: 'ghost', size: 'sm', iconRight: 'external' })}
        </div>
      </div>
    </div>
  </div>`;
}

function renderAssistant() {
  const toolRows = DATA.assistantTools.map(t => `
    <div class="sw-assistant-tool-row">
      <span style="color:var(--fg-muted)">${icon(t.icon, 14)}</span>
      <span style="font-family:var(--font-mono);font-size:12px">${t.name}</span>
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:10px;color:${t.status==='streaming'?'#56D6FF':'var(--fg-muted)'}">${t.status}</span>
    </div>`).join('');
  const suggestions = DATA.assistantSuggestions.map(s => `<button class="sw-assistant-suggestion">${s}</button>`).join('');
  const arbProjects = DATA.projects.filter(p => p.chain === 'arbitrum' && p.status !== 'archived').slice(0,3);
  const miniCovers = arbProjects.map(p => `<div style="aspect-ratio:1/1;border-radius:10px;background:${DATA.coverGradients[p.cover]};position:relative;border:1px solid var(--border-default)"><div style="position:absolute;left:8px;bottom:6px;font-family:var(--font-mono);font-size:10px;color:#fff">// ${p.id}</div></div>`).join('');

  return `
  <div class="sw-content-inner" style="height:100%">
    <div class="sw-assistant-layout">
      <div class="sw-assistant-main">
        <div>${renderEyebrow('// assistant')}<h1 class="sw-section-title">Ask Skywalker</h1><p style="color:var(--fg-muted);margin:0">Explore my work, code samples and skills. Backed by Claude sonnet-4.5 + 7 MCP tools.</p></div>
        ${renderCard(`<div class="sw-card__body" style="display:flex;flex-direction:column;gap:18px;flex:1;overflow:hidden">
          ${renderBubble('user', 'you', 'Show me Skywalker case studies that ship to Arbitrum.')}
          ${renderBubble('ai', 'skywalker', `Found 3 projects matching <code style="font-family:var(--font-mono);color:#56D6FF">chain:arbitrum</code> + <code style="font-family:var(--font-mono);color:#56D6FF">status:live</code>. Loading covers.
            ${renderToolCall('search.projects', 'chain:arbitrum status:live', '0.4s')}
            <div class="sw-grid-3" style="margin-top:14px;gap:10px">${miniCovers}</div>`)}
          ${renderBubble('user', 'you', 'Open the MCP suite case study.')}
          ${renderBubble('ai', 'skywalker', `Opening <code style="font-family:var(--font-mono);color:#56D6FF">case-study/023</code> — Skywalker MCP Suite. Shipped 12m ago on arbitrum-mainnet
            ${renderToolCall('ledger.read', 'case-study/023', '0.2s')}
            ${renderToolCall('figma.export', 'frame:hero@2x', '1.2s', true)}`, { streaming: true })}
          <div style="margin-top:auto">${renderComposer()}</div>
        </div>`, { style: 'padding:0;flex:1;display:flex;flex-direction:column' })}
      </div>
      <div class="sw-assistant-sidebar">
        ${renderCard(`<div class="sw-card__body--tight">${renderEyebrow('// active model')}<div class="sw-assistant-model"><div class="sw-assistant-model-avatar">SK</div><div><div style="font-weight:600;font-size:13px">claude-sonnet-4.5</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)">200k ctx · 814 / 8k tok</div></div>${renderButton('swap', { variant: 'ghost', size: 'sm', iconRight: 'chevD' })}</div></div>`, { style: 'padding:0' })}
        ${renderCard(`<div class="sw-card__body--tight"><div style="display:flex;align-items:center;justify-content:space-between">${renderEyebrow('// available tools')}${renderTag('7 / 12', { tone: 'accent' })}</div><div class="sw-assistant-tools-list">${toolRows}</div></div>`, { style: 'padding:0' })}
        ${renderCard(`<div class="sw-card__body--tight">${renderEyebrow('// suggestions')}<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${suggestions}</div></div>`, { style: 'padding:0' })}
      </div>
    </div>
  </div>`;
}

function renderMcp() {
  const stats = DATA.mcpStats.map(s => renderCard(`<div class="sw-card__body--compact">${renderMetric(s.label, s.value, null, { sizeClass: 'sw-stat-value--sm' })}</div>`, { style: 'padding:0' })).join('');
  const cards = DATA.mcpApps.map(renderMcpCard).join('');
  return `
  <div class="sw-content-inner">
    ${renderEyebrow('// /mcp')}
    <h1 class="sw-section-title">MCP Integrations</h1>
    <p class="sw-section-subtitle" style="max-width:560px;margin-bottom:24px">Tools the Skywalker assistant can call. Each MCP server exposes a set of typed actions over a shared protocol — toggle them on or off, no redeploy.</p>
    <div class="sw-grid-4">${stats}</div>
    <div style="margin-top:28px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        ${renderEyebrow('// servers')}<div style="flex:1"></div>
        ${renderButton('filter', { variant: 'secondary', size: 'sm', iconLeft: 'search' })}
        ${renderButton('add server', { variant: 'primary', size: 'sm', glow: true, iconLeft: 'plug' })}
      </div>
      <div class="sw-grid-2">${cards}</div>
    </div>
    <div style="margin-top:28px">${renderConsole()}</div>
  </div>`;
}

function renderWallet() {
  const tokens = DATA.walletTokens.map(t => `
    <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-subtle);gap:10px">
      <div style="width:28px;height:28px;border-radius:999px;background:linear-gradient(135deg,#0500FF,#56D6FF)"></div>
      <div><div style="font-family:var(--font-mono);font-size:13px;font-weight:600">${t.symbol}</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)">${t.chain}</div></div>
      <div style="margin-left:auto;text-align:right"><div style="font-family:var(--font-mono);font-size:13px">${t.balance}</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)">${t.usd}</div></div>
    </div>`).join('');
  const settings = DATA.walletSettings.map(s => `
    <div class="sw-settings-row">
      <div style="flex:1"><div class="sw-settings-label">${s.key}</div><div class="sw-settings-value">${s.value}</div></div>
      ${renderButton(s.action, { variant: 'ghost', size: 'sm', iconRight: 'chevR' })}
    </div>`).join('');

  return `
  <div class="sw-content-inner">
    ${renderEyebrow('// /wallet')}<h1 class="sw-section-title">Wallet & Profile</h1>
    <div class="sw-grid-2" style="margin-top:26px">
      ${renderCard(`<div class="sw-wallet-banner"><div class="sw-wallet-banner-shine"></div><div style="position:absolute;right:14px;top:14px;font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,0.85);letter-spacing:0.1em">// identity-card 0xa3f9</div></div>
        <div class="sw-wallet-body">
          <div class="sw-wallet-avatar">${cwMark(42)}</div>
          <div><div style="font-weight:600;font-size:18px">Christian Wu</div>
            <div class="sw-wallet-address"><span style="width:6px;height:6px;border-radius:999px;background:#1fa463;box-shadow:0 0 8px #1fa463"></span>0xa3f9…b21c <button style="background:transparent;border:0;color:var(--fg-muted);cursor:pointer">${icon('copy')}</button></div>
          </div>
          <p style="color:var(--fg-secondary);font-size:13px;line-height:1.55">Designer–engineer building AI-native interfaces and on-chain product surfaces. Based in Taipei. Previously Anthropic, Figma, &c.</p>
          <div style="display:flex;gap:8px">${renderTag('arbitrum')}${renderTag('base')}${renderTag('ethereum')}</div>
        </div>`, { style: 'padding:0;overflow:hidden' })}
      <div style="display:flex;flex-direction:column;gap:14px">
        ${renderCard(`<div class="sw-card__body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>${renderEyebrow('total balance')}<div class="sw-stat-value sw-stat-value--lg" style="margin-top:8px">0.42 <span style="color:var(--fg-muted)">Ξ</span></div><div style="font-family:var(--font-mono);font-size:12px;color:var(--fg-muted);margin-top:2px">≈ $1,284.92 USD</div></div>
            <div style="display:flex;gap:8px">${renderButton('send', { variant: 'primary', size: 'sm', glow: true, iconLeft: 'arrow' })}${renderButton('receive', { variant: 'secondary', size: 'sm', iconLeft: 'arrow' })}</div>
          </div>
          <div style="margin-top:22px">${tokens}</div>
        </div>`, { style: 'padding:0' })}
      </div>
    </div>
    <div style="margin-top:28px">${renderEyebrow('// preferences')}${renderCard(settings, { style: 'margin-top:12px;padding:0;overflow:hidden' })}</div>
  </div>`;
}

function renderCaseStudy(id) {
  const p = DATA.projects.find(x => x.id === id) || DATA.projects[0];
  const meta = [['role','design + eng'],['team','solo'],['duration','6 weeks'],['shipped',`${p.year}-Q4`],['chain',p.chain]];
  const metaHtml = meta.map(([k,v]) => `<div><div class="sw-stat-label">${k}</div><div style="font-family:var(--font-mono);font-size:14px;margin-top:6px">${v}</div></div>`).join('');
  const sections = DATA.caseStudySections.map(s => `
    <section class="sw-casestudy-section">
      <div class="sw-casestudy-section-eyebrow">// ${s.eyebrow}</div>
      <h2 class="sw-casestudy-section-title">${s.title}</h2>
      <p>${s.body}</p>
    </section>`).join('');
  const metrics = DATA.caseStudyMetrics.map(m => renderCard(`<div class="sw-card__body"><div style="font-family:var(--font-mono);font-size:36px;font-weight:500;color:#56D6FF;letter-spacing:-0.02em">${m.value}</div><div class="sw-stat-label" style="margin-top:6px">${m.label}</div></div>`, { style: 'padding:0' })).join('');

  return `
  <div class="sw-content-inner">
    <div class="sw-casestudy">
      ${renderEyebrow(`// case-study/${p.id}`)}
      <h1 style="font-size:var(--t-h2);font-weight:600;margin:12px 0 16px;max-width:720px">${p.title}</h1>
      <p style="font-size:18px;line-height:1.55;color:var(--fg-secondary);max-width:720px">Designed and shipped a unified MCP server that makes my entire toolchain — Figma, Claude, on-chain ledger, Skywalker CLI — callable as typed actions from any agent surface.</p>
      <div class="sw-casestudy-meta">${metaHtml}</div>
      <div class="sw-casestudy-hero" style="background:${DATA.coverGradients[p.cover]}">
        <div class="sw-project-cover-shine"></div>
        <div style="position:absolute;left:24px;bottom:22px;display:flex;flex-direction:column;gap:10px">${renderTag(`case-study/${p.id}`, { tone: 'primary' })}${logoLockup(26)}</div>
      </div>
      ${sections}
      <div style="margin-top:22px">${renderCodeBlock()}</div>
      <div class="sw-grid-3" style="margin-top:18px">${metrics}</div>
      <div class="sw-casestudy-footer">
        ${cwMark(42)}
        <div style="flex:1"><div style="font-weight:600;font-size:15px">Want to ship something like this?</div><div style="color:var(--fg-muted);font-size:13px;margin-top:4px">Contracting Q1 2026 onward · arbitrum-friendly · MCP / AI surfaces.</div></div>
        ${renderButton('view repo', { variant: 'secondary', size: 'sm', iconLeft: 'github' })}
        ${renderButton('get in touch', { variant: 'primary', size: 'sm', glow: true, iconRight: 'arrow' })}
      </div>
    </div>
  </div>`;
}

/**
 * Prototype / Presentation Screen (Figma Canvas view)
 */
function renderPrototype() {
  const workflow = DATA.workflows && DATA.workflows[0];
  if (!workflow) return '<div class="sw-content-section"><h2>No workflows found</h2></div>';
  
  const framesHtml = workflow.frames.map((frame, index) => {
    return renderFigmaFrame(frame.title, frame.node, frame.content, index);
  }).join('');

  return `
    <div class="sw-prototype-canvas" id="sw-canvas">
      <div class="sw-prototype-toolbar">
        <h2>${workflow.title}</h2>
        <p>${workflow.description}</p>
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          ${renderButton('Interactive Presentation Mode', { variant: 'ghost', size: 'sm', iconLeft: 'link' })}
        </div>
      </div>
      <div class="sw-prototype-inner">
        ${framesHtml}
      </div>
    </div>
  `;
}
