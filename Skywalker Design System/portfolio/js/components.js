/* ============================================================
   Skywalker Portfolio — Component Render Functions
   Pure functions that return HTML strings. No framework.
   ============================================================ */

/* ---- SVG Icons (Lucide-style 1.5px stroke) ---- */
const ICONS = {
  grid:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  layers:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  sparkle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/><circle cx="12" cy="12" r="3"/></svg>`,
  plug:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M9 8h6M7 12a5 5 0 0 0 10 0v-2H7zM12 17v5"/></svg>`,
  wallet:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>`,
  search:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  arrow:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>`,
  chevR:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`,
  chevD:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  send:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`,
  github:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1 .8-.2 1.7-.3 2.5-.3.8 0 1.7.1 2.5.3 1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.8v2.6c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>`,
  external:`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7"/></svg>`,
  zap:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  eth:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 5 12l7 4 7-4-7-10ZM5 13l7 4 7-4M12 16v6"/></svg>`,
  doc:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
  copy:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  term:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6M12 19h8"/></svg>`,
  img:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
  figma:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2a3 3 0 0 0 0 6h3V2H9ZM12 2v6h3a3 3 0 0 0 0-6h-3ZM12 8h3a3 3 0 0 1 0 6h-3V8ZM9 8a3 3 0 0 0 0 6h3V8H9ZM9 14a3 3 0 1 0 3 3v-3H9Z"/></svg>`,
  dot:     `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="4"/></svg>`,
};

function icon(name, size) {
  const svg = ICONS[name] || '';
  if (size && size !== 16) {
    return svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
  }
  return svg;
}

/* ---- Logo ---- */
function logoIcon(size = 24) {
  return `<img src="assets/logo-icon.svg" alt="" width="${size}" height="${size}" style="display:block;filter:invert(1)">`;
}
function logoWordmark(h = 18) {
  return `<img src="assets/logo-wordmark.svg" alt="Skywalker" style="height:${h}px;display:block;filter:invert(1)">`;
}
function logoLockup(h = 22) {
  return `<div style="display:flex;gap:10px;align-items:center">${logoIcon(h + 2)}${logoWordmark(h)}</div>`;
}
function cwMark(size = 28) {
  return `<img src="assets/christianwu-mark.svg" alt="Christian Wu" width="${size}" height="${size}" style="display:block">`;
}

/* ---- Primitives ---- */
function renderButton(text, opts = {}) {
  const { variant = 'primary', size = 'md', glow, iconLeft, iconRight, onclick } = opts;
  const cls = ['sw-btn', `sw-btn--${variant}`];
  if (size !== 'md') cls.push(`sw-btn--${size}`);
  if (glow) cls.push('sw-btn--glow');
  const click = onclick ? ` onclick="${onclick}"` : '';
  return `<button class="${cls.join(' ')}"${click}>${iconLeft ? icon(iconLeft) : ''}${text}${iconRight ? icon(iconRight) : ''}</button>`;
}

function renderTag(text, opts = {}) {
  const { tone, dot, sans, style: extraStyle } = opts;
  const cls = ['sw-tag'];
  if (tone) cls.push(`sw-tag--${tone}`);
  if (sans) cls.push('sw-tag--sans');
  const styleAttr = extraStyle ? ` style="${extraStyle}"` : '';
  const dotHtml = dot ? '<span class="sw-tag-dot"></span>' : '';
  return `<span class="${cls.join(' ')}"${styleAttr}>${dotHtml}${text}</span>`;
}

function renderCard(content, opts = {}) {
  const { interactive, cls: extraCls, style: extraStyle } = opts;
  const cls = ['sw-card'];
  if (interactive) cls.push('sw-card--interactive');
  if (extraCls) cls.push(extraCls);
  const style = extraStyle ? ` style="${extraStyle}"` : '';
  return `<div class="${cls.join(' ')}"${style}>${content}</div>`;
}

function renderEyebrow(text) {
  return `<span class="sw-eyebrow">${text}</span>`;
}

function renderKbd(text) {
  return `<span class="sw-kbd">${text}</span>`;
}

function renderToggle(on) {
  return `<div class="sw-toggle${on ? ' on' : ''}"><div class="sw-toggle-knob"></div></div>`;
}

function renderMetric(label, value, sub, opts = {}) {
  const { color, sizeClass } = opts;
  const valCls = sizeClass ? `sw-stat-value ${sizeClass}` : 'sw-stat-value';
  const colorStyle = color ? ` style="color:${color}"` : '';
  return `
    <div class="sw-stat-label">${label}</div>
    <div class="${valCls}"${colorStyle}>${value}</div>
    ${sub ? `<div class="sw-stat-sub">${sub}</div>` : ''}
  `;
}

/* ---- Project card ---- */
function renderProjectCard(p, opts = {}) {
  const { onclick } = opts;
  const coverStyle = `background:${DATA.coverGradients[p.cover]}`;
  const statusTone = p.status === 'live' ? 'success' : p.status === 'beta' ? 'warn' : 'default';
  const click = onclick ? ` onclick="${onclick}"` : '';
  return renderCard(`
    <div class="sw-project-cover" style="${coverStyle}">
      <div class="sw-project-cover-shine"></div>
      <span class="sw-project-cover-id">// ${p.id}</span>
      <div class="sw-project-cover-status">${renderTag(p.status, { tone: statusTone, dot: true, style: 'background:rgba(0,0,0,0.4);backdrop-filter:blur(8px)' })}</div>
      <div class="sw-project-cover-watermark">${logoIcon(18)}</div>
    </div>
    <div class="sw-project-meta">
      <div class="sw-project-title">${p.title}</div>
      <div class="sw-project-tags">${p.tags.map(t => renderTag(t)).join('')}</div>
    </div>
    <div class="sw-project-footer">
      <div class="sw-project-footer-col">
        <span class="sw-stat-label">price</span>
        <span class="sw-value">${p.price} Ξ</span>
      </div>
      <div class="sw-project-footer-col" style="align-items:flex-end">
        <span class="sw-stat-label">chain</span>
        <span class="sw-value--muted">${p.chain}</span>
      </div>
    </div>
  `, { interactive: true, cls: 'sw-project-card', style: click ? `cursor:pointer" ${click.trim()}` : undefined });
}

/* ---- Activity row ---- */
function renderActivityRow(item) {
  return `
    <div class="sw-activity-row">
      <div class="sw-activity-dot" style="background:${item.dot}"></div>
      <div style="flex:1">
        <div class="sw-activity-text">${item.text}</div>
        <div class="sw-activity-sub">${item.sub}</div>
      </div>
    </div>
  `;
}

/* ---- Sparkline chart (SVG) ---- */
function renderSparkChart() {
  const pts = DATA.chartPoints;
  const max = 90, W = 760, H = 160;
  const path = pts.map((v, i) => `${i ? 'L' : 'M'} ${(i / (pts.length - 1)) * W} ${H - (v / max) * H}`).join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  const lastX = W;
  const lastY = H - (pts[pts.length - 1] / max) * H;
  return `
    <svg viewBox="0 0 ${W} ${H + 30}" style="width:100%;height:200px;margin-top:18px;overflow:visible">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#56D6FF" stop-opacity="0.4"/><stop offset="100%" stop-color="#56D6FF" stop-opacity="0"/></linearGradient></defs>
      ${[0.25,0.5,0.75,1].map(p => `<line x1="0" x2="${W}" y1="${H*p}" y2="${H*p}" stroke="rgba(255,255,255,0.05)"/>`).join('')}
      <path d="${area}" fill="url(#cg)"/>
      <path d="${path}" fill="none" stroke="#56D6FF" stroke-width="1.5"/>
      <circle cx="${lastX}" cy="${lastY}" r="4" fill="#56D6FF"/>
      <circle cx="${lastX}" cy="${lastY}" r="10" fill="#56D6FF" opacity="0.2"/>
    </svg>
  `;
}

/* ---- AI Bubble ---- */
function renderBubble(who, name, content, opts = {}) {
  const { streaming } = opts;
  const avatarCls = who === 'ai' ? 'sw-bubble-avatar--ai' : 'sw-bubble-avatar--user';
  const initials = who === 'ai' ? 'SK' : 'CW';
  const streamHtml = streaming ? '<span class="sw-bubble-streaming">● streaming</span>' : '';
  return `
    <div class="sw-bubble">
      <div class="sw-bubble-avatar ${avatarCls}">${initials}</div>
      <div style="flex:1">
        <div class="sw-bubble-name">${name}${streamHtml}</div>
        <div class="sw-bubble-body">${content}</div>
      </div>
    </div>
  `;
}

/* ---- Tool call ---- */
function renderToolCall(name, args, duration, running) {
  return `
    <div class="sw-tool-call">
      <span class="sw-tool-call-arrow">→</span>
      <span class="sw-tool-call-name">${name}</span>
      <span class="sw-tool-call-sep">·</span>
      <span class="sw-tool-call-args">${args}</span>
      <span class="sw-tool-call-sep">·</span>
      <span>${running ? 'running' : duration}</span>
    </div>
  `;
}

/* ---- Composer ---- */
function renderComposer() {
  return `
    <div class="sw-composer">
      <div class="sw-composer-input">
        <span class="sw-composer-prompt">›</span>
        <span>Ask anything about my work, code or process…</span>
        <span class="sw-composer-cursor"></span>
      </div>
      <div class="sw-composer-actions">
        ${renderButton('attach', { variant: 'ghost', size: 'sm', iconLeft: 'img' })}
        ${renderButton('tools (7)', { variant: 'ghost', size: 'sm', iconLeft: 'plug' })}
        ${renderButton('context', { variant: 'ghost', size: 'sm', iconLeft: 'layers' })}
        <span class="sw-composer-hint">${renderKbd('↩')} send · ${renderKbd('⇧↩')} newline</span>
        ${renderButton('send', { variant: 'primary', size: 'sm', glow: true, iconLeft: 'send' })}
      </div>
    </div>
  `;
}

/* ---- MCP card ---- */
function renderMcpCard(a) {
  const statusTone = a.status === 'live' ? 'success' : a.status === 'beta' ? 'warn' : 'default';
  return renderCard(`
    <div class="sw-mcp-card">
      <div class="sw-mcp-header">
        <div class="sw-mcp-icon" style="background:${a.grad}">${a.initial}</div>
        <div class="sw-mcp-info">
          <div class="sw-mcp-name">${a.name}</div>
          <div class="sw-mcp-desc">${a.desc}</div>
        </div>
        ${renderToggle(a.enabled)}
      </div>
      <div class="sw-mcp-stats">
        <div>
          <div class="sw-stat-label">status</div>
          <div style="margin-top:4px">${renderTag(a.status, { tone: statusTone, dot: true })}</div>
        </div>
        <div>
          <div class="sw-stat-label">calls 24h</div>
          <div style="font-family:var(--font-mono);font-size:12px;margin-top:4px">${a.calls.toLocaleString()}</div>
        </div>
        <div>
          <div class="sw-stat-label">latency</div>
          <div style="font-family:var(--font-mono);font-size:12px;margin-top:4px">${a.latency}</div>
        </div>
      </div>
    </div>
  `, { cls: '', style: 'padding:18px' });
}

/* ---- Console ---- */
function renderConsole() {
  const rows = DATA.consoleLog.map(r => {
    const cmdCls = r.warn ? 'sw-console-warn' : 'sw-console-cmd';
    return `<div><span class="sw-console-time">${r.time}</span>  <span class="${cmdCls}">${r.cmd}</span>  ${r.args}  <span class="sw-console-ok">${r.result}</span> ${r.extra ? `<span class="sw-console-time">${r.extra}</span>` : ''}</div>`;
  }).join('');
  return renderCard(`
    <div class="sw-console-header">
      ${icon('term')}
      ${renderEyebrow('// tool console · live')}
      ${renderTag('recording', { tone: 'success', dot: true })}
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:10px;color:var(--fg-muted)">tail -f</span>
    </div>
    <div class="sw-console-body">${rows}</div>
  `, { style: 'padding:0;overflow:hidden' });
}

/* ---- Code block ---- */
function renderCodeBlock() {
  return `
    <div class="sw-codeblock">
      <div class="sw-codeblock-header">
        <div class="sw-codeblock-dots">
          <span class="sw-codeblock-dot sw-codeblock-dot--red"></span>
          <span class="sw-codeblock-dot sw-codeblock-dot--yellow"></span>
          <span class="sw-codeblock-dot sw-codeblock-dot--green"></span>
        </div>
        <span class="sw-codeblock-filename">skywalker-mcp · server.ts</span>
      </div>
      <pre><span class="sw-code-keyword">export const</span> <span class="sw-code-fn">figmaExport</span> = mcp.tool({
  <span class="sw-code-prop">name</span>: <span class="sw-code-string">"figma.export"</span>,
  <span class="sw-code-prop">input</span>: z.object({ frame: z.string(), scale: z.number().default(<span class="sw-code-num">2</span>) }),
  <span class="sw-code-prop">handler</span>: <span class="sw-code-keyword">async</span> ({ frame, scale }) =&gt; {
    <span class="sw-code-keyword">const</span> png = <span class="sw-code-keyword">await</span> figma.export(frame, { scale });
    <span class="sw-code-keyword">return</span> { bytes: png.bytes, mime: <span class="sw-code-string">"image/png"</span> };
  },
});</pre>
    </div>
  `;
}

/**
 * Render an iPhone Mockup with arbitrary HTML content
 * @param {string} content - HTML content inside the screen
 * @returns {string} HTML string
 */
function renderIphoneMockup(content) {
  return `
    <div class="sw-iphone-mockup">
      <div class="sw-iphone-notch"></div>
      <div class="sw-iphone-content">
        ${content}
      </div>
      <div class="sw-iphone-indicator"></div>
    </div>
  `;
}

/**
 * Render a Figma-like frame wrapper for the iPhone Mockup
 * @param {string} title - Frame title
 * @param {string} subtitle - Frame subtitle/node name
 * @param {string} content - HTML content for the iphone
 * @param {number} delay - Animation delay index
 * @returns {string} HTML string
 */
function renderFigmaFrame(title, subtitle, content, delay = 0) {
  return `
    <div class="sw-frame-wrapper" style="animation-delay: ${delay * 0.1}s">
      <div class="sw-frame-header">
        <div class="sw-tag">${subtitle}</div>
        <strong>${title}</strong>
      </div>
      ${renderIphoneMockup(content)}
    </div>
  `;
}
