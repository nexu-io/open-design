/*
 * Site-header enhancement for the static community sub-pages.
 *
 * Trimmed port of `app/_components/header-enhancer.astro` (Liquid Glass
 * condense-on-scroll, hamburger menu, live GitHub star/version counts) plus
 * the menu-binding half of `app/_components/locale-switcher-script.astro`.
 * The locale `autoAdapt` redirect is deliberately omitted: these pages have
 * no locale variants, so auto-routing a saved locale would 404 on
 * `/zh/community/...`. Keep in sync with those two components.
 */
(() => {
  const REPO_API = 'https://api.github.com/repos/nexu-io/open-design';
  const DISCORD = 'https://discord.gg/mHAjSMV6gz';
  const REPO = 'https://github.com/nexu-io/open-design';
  const X_PROFILE = 'https://x.com/OpenDesignHQ';
  const AMR_URL = 'https://open-design.ai/amr/';

  const renderSiteNav = () => `
    <div class="site-chrome" data-chrome-headroom>
      <header class="nav" data-od-id="nav">
        <div class="container nav-inner">
          <a href="/zh/" class="brand">
            <img class="brand-logo" src="/logo-lockup.svg" alt="Open Design" width="225" height="83" />
          </a>
          <button
            type="button"
            class="nav-toggle"
            aria-label="切换导航菜单"
            aria-controls="primary-nav"
            aria-expanded="false"
            data-nav-toggle
          >
            <span class="nav-toggle-icon" aria-hidden="true"></span>
          </button>
          <nav id="primary-nav" data-nav-primary>
            <ul class="nav-links">
              <li class="has-dropdown">
                <a href="/zh/">
                  产品<span class="dropdown-caret" aria-hidden="true">▾</span>
                </a>
                <ul class="nav-dropdown" aria-label="产品">
                  <li><a href="/zh/"><span class="dropdown-name">Open Design</span><span class="dropdown-blurb">Agent 原生设计工作台：围绕 SKILL.md 工作流组织。</span></a></li>
                  <li><a href="/zh/html-anything/"><span class="dropdown-name">HTML Anything</span><span class="dropdown-blurb">Markdown / 数据变成可交付 HTML，由本地 Agent 完成。</span></a></li>
                  <li><a href="/zh/html-video/"><span class="dropdown-name">HTML Video</span><span class="dropdown-blurb">一个 prompt、文章或仓库，变成真实 MP4。</span></a></li>
                </ul>
              </li>
              <li class="has-dropdown">
                <a href="/zh/solutions/">
                  解决方案<span class="dropdown-caret" aria-hidden="true">▾</span>
                </a>
                <ul class="nav-dropdown nav-dropdown-solution" aria-label="解决方案">
                  <li class="nav-dropdown-group"><span class="nav-dropdown-group-label">使用场景</span></li>
                  <li><a href="/zh/solutions/prototype/"><span class="dropdown-name">原型</span></a></li>
                  <li><a href="/zh/solutions/dashboard/"><span class="dropdown-name">看板</span></a></li>
                  <li><a href="/zh/solutions/slides/"><span class="dropdown-name">幻灯片</span></a></li>
                  <li><a href="/zh/solutions/image/"><span class="dropdown-name">图片</span></a></li>
                  <li><a href="/zh/solutions/video/"><span class="dropdown-name">视频</span></a></li>
                  <li><a href="/zh/solutions/design-system/"><span class="dropdown-name">设计系统</span></a></li>
                  <li class="nav-dropdown-group"><span class="nav-dropdown-group-label">角色</span></li>
                  <li><a href="/zh/solutions/solo-builder/"><span class="dropdown-name">独立开发者</span></a></li>
                  <li><a href="/zh/solutions/designer/"><span class="dropdown-name">设计师</span></a></li>
                  <li><a href="/zh/solutions/engineering/"><span class="dropdown-name">工程</span></a></li>
                  <li><a href="/zh/solutions/product-managers/"><span class="dropdown-name">产品经理</span></a></li>
                  <li><a href="/zh/solutions/marketing/"><span class="dropdown-name">市场</span></a></li>
                </ul>
              </li>
              <li class="has-dropdown">
                <a href="/zh/agents/">
                  Agent<span class="dropdown-caret" aria-hidden="true">▾</span>
                </a>
                <ul class="nav-dropdown nav-dropdown-solution" aria-label="Agent">
                  <li><a href="${AMR_URL}"><span class="dropdown-name">Open Design</span><span class="dropdown-blurb">专业设计 Agent、零配置使用、自带 SOTA 模型与 Harness</span></a></li>
                  <li><a href="/zh/agents/codex-design/"><span class="dropdown-name">Codex</span></a></li>
                  <li><a href="/zh/agents/cursor-design/"><span class="dropdown-name">Cursor Agent</span></a></li>
                  <li><a href="/zh/agents/claude-code-design/"><span class="dropdown-name">Claude Code</span></a></li>
                  <li><a href="/zh/agents/opencode-design/"><span class="dropdown-name">OpenCode</span></a></li>
                  <li><a href="/zh/agents/gemini-design/"><span class="dropdown-name">Gemini CLI</span></a></li>
                  <li><a href="/zh/agents/copilot-design/"><span class="dropdown-name">GitHub Copilot CLI</span></a></li>
                  <li><a href="/zh/agents/qwen-design/"><span class="dropdown-name">Qwen Code</span></a></li>
                  <li><a href="/zh/agents/grok-design/"><span class="dropdown-name">Grok Build</span></a></li>
                  <li><a href="/zh/agents/kimi-design/"><span class="dropdown-name">Kimi CLI</span></a></li>
                  <li><a href="/zh/agents/deepseek-design/"><span class="dropdown-name">DeepSeek TUI</span></a></li>
                  <li><a href="/zh/agents/trae-cli-design/"><span class="dropdown-name">Trae CLI</span></a></li>
                  <li><a href="/zh/agents/aider-design/"><span class="dropdown-name">Aider</span></a></li>
                  <li><a href="/zh/agents/antigravity-design/"><span class="dropdown-name">Antigravity</span></a></li>
                  <li><a href="/zh/agents/reasonix-design/"><span class="dropdown-name">DeepSeek Reasonix</span></a></li>
                  <li><a href="/zh/agents/hermes-design/"><span class="dropdown-name">Hermes</span></a></li>
                  <li><a href="/zh/agents/devin-design/"><span class="dropdown-name">Devin for Terminal</span></a></li>
                  <li><a href="/zh/agents/pi-design/"><span class="dropdown-name">Pi</span></a></li>
                  <li><a href="/zh/agents/kiro-design/"><span class="dropdown-name">Kiro CLI</span></a></li>
                  <li><a href="/zh/agents/kilo-design/"><span class="dropdown-name">Kilo</span></a></li>
                  <li><a href="/zh/agents/vibe-design/"><span class="dropdown-name">Mistral Vibe CLI</span></a></li>
                  <li><a href="/zh/agents/qoder-design/"><span class="dropdown-name">Qoder CLI</span></a></li>
                </ul>
              </li>
              <li class="has-dropdown">
                <a href="/zh/plugins/">
                  插件<span class="dropdown-caret" aria-hidden="true">▾</span>
                </a>
                <ul class="nav-dropdown" aria-label="插件">
                  <li><a href="/zh/plugins/templates/"><span class="dropdown-name">模板</span></a></li>
                  <li><a href="/zh/plugins/skills/"><span class="dropdown-name">技能</span></a></li>
                  <li><a href="/zh/plugins/systems/"><span class="dropdown-name">设计系统</span></a></li>
                </ul>
              </li>
              <li class="has-dropdown">
                <a href="/zh/blog/">
                  资源<span class="dropdown-caret" aria-hidden="true">▾</span>
                </a>
                <ul class="nav-dropdown" aria-label="资源">
                  <li><a href="/zh/blog/"><span class="dropdown-name">博客</span></a></li>
                  <li><a href="/zh/tutorials/"><span class="dropdown-name">教程</span></a></li>
                  <li><a href="/zh/compare/"><span class="dropdown-name">比较</span></a></li>
                  <li><a href="/zh/download/"><span class="dropdown-name">下载</span></a></li>
                </ul>
              </li>
              <li class="has-dropdown">
                <a href="/community/" class="is-active">
                  社区<span class="dropdown-caret" aria-hidden="true">▾</span>
                </a>
                <ul class="nav-dropdown" aria-label="社区">
                  <li><a href="/community/#contributors"><span class="dropdown-name">贡献者</span></a></li>
                  <li><a href="/community/#ambassadors"><span class="dropdown-name">大使</span></a></li>
                  <li><a href="/community/#moderators"><span class="dropdown-name">版主</span></a></li>
                  <li><a href="${DISCORD}" target="_blank" rel="noreferrer noopener"><span class="dropdown-name">Discord</span></a></li>
                  <li><a href="${REPO}/discussions" target="_blank" rel="noreferrer noopener"><span class="dropdown-name">Discussions</span></a></li>
                  <li><a href="${X_PROFILE}" target="_blank" rel="noreferrer noopener"><span class="dropdown-name">X</span></a></li>
                </ul>
              </li>
            </ul>
          </nav>
          <div class="nav-side">
            <details class="locale-switch nav-locale-switch" data-locale-switch>
              <summary class="locale-trigger locale-trigger-iconic" aria-label="切换语言" title="切换语言">
                <span class="locale-trigger-icon" aria-hidden="true"></span>
                <span class="locale-trigger-caret ri-glyph" aria-hidden="true"></span>
              </summary>
              <div class="locale-menu" role="menu">
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="en" href="/" lang="en"><span class="locale-menu-code">EN</span><span class="locale-menu-label">English</span></a>
                <a class="locale-menu-item is-active" role="menuitem" data-locale-link data-locale-code="zh" href="/zh/" lang="zh-CN" aria-current="true"><span class="locale-menu-code">ZH</span><span class="locale-menu-label">简体中文</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="zh-tw" href="/zh-tw/" lang="zh-Hant"><span class="locale-menu-code">ZH-TW</span><span class="locale-menu-label">繁體中文</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="ja" href="/ja/" lang="ja"><span class="locale-menu-code">JA</span><span class="locale-menu-label">日本語</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="ko" href="/ko/" lang="ko"><span class="locale-menu-code">KO</span><span class="locale-menu-label">한국어</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="de" href="/de/" lang="de"><span class="locale-menu-code">DE</span><span class="locale-menu-label">Deutsch</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="fr" href="/fr/" lang="fr"><span class="locale-menu-code">FR</span><span class="locale-menu-label">Français</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="ru" href="/ru/" lang="ru"><span class="locale-menu-code">RU</span><span class="locale-menu-label">Русский</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="es" href="/es/" lang="es"><span class="locale-menu-code">ES</span><span class="locale-menu-label">Español</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="pt-br" href="/pt-br/" lang="pt-BR"><span class="locale-menu-code">PT-BR</span><span class="locale-menu-label">Português (BR)</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="it" href="/it/" lang="it"><span class="locale-menu-code">IT</span><span class="locale-menu-label">Italiano</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="vi" href="/vi/" lang="vi"><span class="locale-menu-code">VI</span><span class="locale-menu-label">Tiếng Việt</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="pl" href="/pl/" lang="pl"><span class="locale-menu-code">PL</span><span class="locale-menu-label">Polski</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="id" href="/id/" lang="id"><span class="locale-menu-code">ID</span><span class="locale-menu-label">Bahasa Indonesia</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="nl" href="/nl/" lang="nl"><span class="locale-menu-code">NL</span><span class="locale-menu-label">Nederlands</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="ar" href="/ar/" lang="ar"><span class="locale-menu-code">AR</span><span class="locale-menu-label">العربية</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="tr" href="/tr/" lang="tr"><span class="locale-menu-code">TR</span><span class="locale-menu-label">Türkçe</span></a>
                <a class="locale-menu-item" role="menuitem" data-locale-link data-locale-code="uk" href="/uk/" lang="uk"><span class="locale-menu-code">UK</span><span class="locale-menu-label">Українська</span></a>
              </div>
            </details>
            <a class="nav-cta ghost" href="/zh/download/" aria-label="下载桌面端" title="下载桌面端" data-download-cta data-download-page>下载</a>
          </div>
        </div>
        <svg class="nav-glass-defs" aria-hidden="true" focusable="false" width="0" height="0">
          <defs>
            <filter id="nav-liquid-glass" color-interpolation-filters="sRGB">
              <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" data-nav-glass-map></feImage>
              <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-180" result="dispRed"></feDisplacementMap>
              <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red"></feColorMatrix>
              <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-170" result="dispGreen"></feDisplacementMap>
              <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green"></feColorMatrix>
              <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-160" result="dispBlue"></feDisplacementMap>
              <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue"></feColorMatrix>
              <feBlend in="red" in2="green" mode="screen" result="rg"></feBlend>
              <feBlend in="rg" in2="blue" mode="screen" result="output"></feBlend>
              <feGaussianBlur in="output" stdDeviation="0.7"></feGaussianBlur>
            </filter>
          </defs>
        </svg>
      </header>
    </div>
  `;

  for (const placeholder of document.querySelectorAll('od-site-nav')) {
    placeholder.outerHTML = renderSiteNav();
  }

  const injectHomeFooterStyles = () => {
    if (document.querySelector('style[data-od-home-footer]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-od-home-footer', '');
    style.textContent = `
      footer[data-od-id="footer"] {
        --paper: #fafafa;
        --ink: #262626;
        --ink-soft: #434343;
        --ink-mute: #595959;
        --ink-faint: #8c8c8c;
        --coral: #63fe13;
        --mustard: #63fe13;
        --line: #d9d9d9;
        --sans: "Albert Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
        --body: "Albert Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
        padding: 60px 0 30px;
        margin-top: 60px;
        background: var(--paper);
        color: var(--ink);
      }
      footer[data-od-id="footer"] .container { max-width: none; padding: 0 238px; margin: 0 auto; position: relative; }
      footer[data-od-id="footer"] .foot-grid { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 40px 80px; margin-bottom: 60px; }
      footer[data-od-id="footer"] .foot-brand .brand { margin-bottom: 18px; display: inline-flex; align-items: center; text-decoration: none; color: var(--ink); }
      footer[data-od-id="footer"] .foot-brand p { font-family: var(--body); font-size: 13.5px; color: var(--ink-mute); line-height: 125%; max-width: 38ch; }
      footer[data-od-id="footer"] .foot-cta { display: inline-flex; align-items: center; gap: 10px; margin-top: 22px; padding: 11px 18px; border-radius: var(--spacing-8); background: var(--ink); color: var(--paper); font-family: var(--sans); font-size: 13px; font-weight: 500; letter-spacing: 0; text-decoration: none; transition: transform 160ms ease, background 160ms ease; }
      footer[data-od-id="footer"] .foot-cta:hover { transform: translateY(-1px); background: var(--ink-soft); }
      footer[data-od-id="footer"] .foot-cta::after { content: '↓'; color: var(--mustard); font-size: 12px; }
      footer[data-od-id="footer"] .foot-cta .meta { color: rgba(250, 250, 250, 0.55); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; margin-left: 4px; }
      footer[data-od-id="footer"] .foot-col h5 { font-family: var(--sans); font-size: 11px; color: var(--ink); letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 18px; font-weight: 800; }
      footer[data-od-id="footer"] .foot-col ul { list-style: none; padding: 0; margin: 0; }
      footer[data-od-id="footer"] .foot-col li { margin-bottom: 18px; }
      footer[data-od-id="footer"] .foot-col a { font-family: var(--body); font-size: 13.5px; color: var(--ink-soft); text-decoration: none; }
      footer[data-od-id="footer"] .foot-col a:hover { color: var(--coral); }
      footer[data-od-id="footer"] .foot-bottom { border-top: 1px solid var(--line); padding-top: 22px; display: flex; justify-content: space-between; align-items: center; font-family: var(--sans); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint); }
      footer[data-od-id="footer"] .foot-bottom .right { display: inline-flex; gap: 24px; align-items: center; }
      footer[data-od-id="footer"] .foot-bottom .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--coral); display: inline-block; margin-right: 6px; vertical-align: middle; }
      footer[data-od-id="footer"] .foot-mega { margin-top: 60px; padding-bottom: 12px; overflow-x: hidden; overflow-y: visible; }
      footer[data-od-id="footer"] .foot-mega .word { font-family: var(--sans); font-weight: 900; font-size: var(--font-size-64); letter-spacing: 0; line-height: 125%; color: var(--ink); white-space: nowrap; text-align: center; margin-top: 30px; padding-bottom: 0.18em; }
      @media (max-width: 1024px) { footer[data-od-id="footer"] .container { padding: 0 32px; } }
      @media (max-width: 880px) {
        footer[data-od-id="footer"] .foot-grid { gap: 32px 48px; }
        footer[data-od-id="footer"] .foot-bottom { flex-direction: column; align-items: flex-start; gap: 12px; }
        footer[data-od-id="footer"] .foot-bottom .right { flex-wrap: wrap; gap: 12px 20px; }
      }
      @media (max-width: 640px) { footer[data-od-id="footer"] .foot-mega .word { font-size: var(--font-size-52); } }
      @media (max-width: 560px) {
        footer[data-od-id="footer"] .foot-grid { flex-direction: column; align-items: center; text-align: center; gap: 24px; }
        footer[data-od-id="footer"] .foot-mega .word { font-size: var(--font-size-48); }
      }
      @media (max-width: 420px) { footer[data-od-id="footer"] .foot-mega .word { font-size: var(--font-size-36); } }
      .sub-footer { border-top: 1px solid #d9d9d9; background: #fafafa; padding: 60px 0 32px; margin-top: 96px; }
      .sub-footer .sub-footer-inner { max-width: none; padding-inline: 238px; }
      .sub-footer-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 40px; margin-bottom: 36px; }
      .sub-footer-col h5 { font-family: "Albert Sans", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #595959; margin: 0 0 14px; font-weight: 500; }
      .sub-footer-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
      .sub-footer-col a { text-decoration: none; color: #262626; font-size: 14px; transition: color 0.16s ease; }
      .sub-footer-col a:hover { color: #63fe13; }
      @media (max-width: 720px) {
        .sub-footer .sub-footer-inner { padding-inline: 24px; }
        .sub-footer-grid { grid-template-columns: 1fr; gap: 32px; }
        .sub-footer { padding: 40px 0 24px; }
      }
    `;
    document.head.appendChild(style);
  };

  const renderSiteFooter = () => `
    <footer class="sub-footer" data-od-id="sub-footer">
      <div class="container sub-footer-inner">
        <div class="sub-footer-grid">
          <div class="sub-footer-col">
            <h5>产品</h5>
            <ul>
              <li><a href="/zh/">Open Design</a></li>
              <li><a href="/zh/html-anything/">HTML Anything</a></li>
              <li><a href="/zh/html-video/">HTML Video</a></li>
            </ul>
          </div>
          <div class="sub-footer-col">
            <h5>插件</h5>
            <ul>
              <li><a href="/zh/plugins/templates/">模板</a></li>
              <li><a href="/zh/plugins/skills/">技能</a></li>
              <li><a href="/zh/plugins/systems/">设计系统</a></li>
            </ul>
          </div>
          <div class="sub-footer-col">
            <h5>资源</h5>
            <ul>
              <li><a href="/zh/official/">官方来源页</a></li>
              <li><a href="/zh/quickstart/">快速开始</a></li>
              <li><a href="/zh/agents/">Agent</a></li>
            </ul>
          </div>
          <div class="sub-footer-col">
            <h5>对比</h5>
            <ul>
              <li><a href="/zh/alternatives/claude-design/">Claude Design</a></li>
              <li><a href="/zh/alternatives/figma/">Figma</a></li>
              <li><a href="/zh/alternatives/lovable/">Lovable</a></li>
              <li><a href="/zh/alternatives/bolt/">Bolt</a></li>
              <li><a href="/zh/alternatives/v0/">v0</a></li>
              <li><a href="/zh/alternatives/framer/">Framer</a></li>
            </ul>
          </div>
          <div class="sub-footer-col">
            <h5>连接</h5>
            <ul>
              <li><a href="${REPO}" target="_blank" rel="noreferrer noopener">GitHub</a></li>
              <li><a href="${REPO}/issues" target="_blank" rel="noreferrer noopener">议题</a></li>
              <li><a href="${REPO}/releases" target="_blank" rel="noreferrer noopener">版本发布</a></li>
              <li><a href="${DISCORD}" target="_blank" rel="noreferrer noopener">Discord</a></li>
              <li><a href="${X_PROFILE}" target="_blank" rel="noreferrer noopener">X / Twitter</a></li>
              <li><a href="/blog/rss.xml">RSS</a></li>
              <li><a href="/zh/#contact">联系</a></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  `;

  for (const footer of document.querySelectorAll('footer.foot')) {
    injectHomeFooterStyles();
    footer.outerHTML = renderSiteFooter();
  }

  const formatStars = (count) => {
    if (!Number.isFinite(count) || count <= 0) return null;
    if (count < 1000) return String(count);
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  };

  const formatVersion = (release) => {
    const fromTag = (tag) => {
      if (typeof tag !== 'string') return null;
      const cleaned = tag.replace(/^open-design[-_]?v?/i, '').trim();
      return cleaned ? `v${cleaned.replace(/^v/, '')}` : null;
    };
    const fromName = (name) => {
      if (typeof name !== 'string') return null;
      const m = name.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
      return m ? `v${m[1]}` : null;
    };
    return fromName(release?.name) ?? fromTag(release?.tag_name) ?? null;
  };

  const chrome = document.querySelector('[data-chrome-headroom]');
  if (chrome) {
    const navBar = chrome.querySelector('.nav');
    const glassMap = chrome.querySelector('[data-nav-glass-map]');

    const buildGlassMap = (w, h) => {
      const radius = Math.round(Math.min(w, h) / 2);
      const borderRatio = 0.07;
      const lightness = 50;
      const alpha = 0.93;
      const blur = 11;
      const blend = 'difference';
      const inset = Math.min(w, h) * (borderRatio * 0.5);
      const svg =
        '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
          '<defs>' +
            '<linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
            '<linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
          '</defs>' +
          '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="black"/>' +
          '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="url(#red)"/>' +
          '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="url(#blue)" style="mix-blend-mode:' + blend + '"/>' +
          '<rect x="' + inset + '" y="' + inset + '" width="' + (w - inset * 2) + '" height="' + (h - inset * 2) + '" rx="' + radius + '" fill="hsl(0 0% ' + lightness + '% / ' + alpha + ')" style="filter:blur(' + blur + 'px)"/>' +
        '</svg>';
      return 'data:image/svg+xml,' + encodeURIComponent(svg);
    };

    const syncGlassMap = () => {
      if (!navBar || !glassMap) return;
      const rect = navBar.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const uri = buildGlassMap(w, h);
      glassMap.setAttribute('href', uri);
      glassMap.setAttributeNS('http://www.w3.org/1999/xlink', 'href', uri);
    };

    let mapTimer = 0;
    const scheduleGlassMap = () => {
      clearTimeout(mapTimer);
      mapTimer = setTimeout(syncGlassMap, 140);
    };

    const condenseOn = 64;
    const condenseOff = 24;
    let condensed = false;
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const y = window.scrollY;
      if (!condensed && y > condenseOn) {
        condensed = true;
        chrome.classList.add('is-condensed');
      } else if (condensed && y < condenseOff) {
        condensed = false;
        chrome.classList.remove('is-condensed');
      }
    };
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(onScroll);
      },
      { passive: true },
    );
    condensed = window.scrollY > condenseOn;
    chrome.classList.toggle('is-condensed', condensed);

    syncGlassMap();
    if (navBar) {
      if (window.ResizeObserver) {
        new ResizeObserver(scheduleGlassMap).observe(navBar);
      }
      window.addEventListener('resize', scheduleGlassMap, { passive: true });
    }
  }

  const toggle = document.querySelector('[data-nav-toggle]');
  const primaryNav = document.querySelector('[data-nav-primary]');
  const navEl = toggle ? toggle.closest('header.nav') : null;
  if (toggle && primaryNav && navEl) {
    const setOpen = (open) => {
      navEl.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setOpen(!navEl.classList.contains('is-open'));
    });
    primaryNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('click', (ev) => {
      if (!navEl.contains(ev.target)) setOpen(false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') setOpen(false);
    });
  }

  const starSlots = document.querySelectorAll('[data-github-stars]');
  if (starSlots.length > 0) {
    fetch(REPO_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http error'))))
      .then((data) => {
        const label = formatStars(data?.stargazers_count);
        if (!label) return;
        for (const slot of starSlots) slot.textContent = label;
      })
      .catch(() => {});
  }

  const versionSlots = document.querySelectorAll('[data-github-version]');
  if (versionSlots.length > 0) {
    fetch(`${REPO_API}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http error'))))
      .then((data) => {
        const label = formatVersion(data);
        if (!label) return;
        for (const slot of versionSlots) slot.textContent = label;
      })
      .catch(() => {});
  }

  // Locale menu behavior (persist choice + hover/outside-click/Escape).
  // Entries are real <a> links to the localized homepages.
  const STORAGE_KEY = 'od.preferredLocale';
  for (const link of document.querySelectorAll('[data-locale-link]')) {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const code = link.dataset.localeCode;
      if (!code) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, code);
      } catch {}
      const details = link.closest('[data-locale-switch]');
      if (details && details.open) details.open = false;
    });
  }
  const hoverCapable = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
  if (hoverCapable) {
    for (const details of document.querySelectorAll('[data-locale-switch]')) {
      let closeTimer = null;
      const cancelClose = () => {
        if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = null; }
      };
      details.addEventListener('mouseenter', () => {
        cancelClose();
        details.open = true;
      });
      details.addEventListener('mouseleave', () => {
        cancelClose();
        closeTimer = window.setTimeout(() => { details.open = false; }, 120);
      });
    }
  }
  document.addEventListener('click', (event) => {
    const target = event.target;
    for (const details of document.querySelectorAll('[data-locale-switch][open]')) {
      if (target instanceof Node && details.contains(target)) continue;
      details.open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const details of document.querySelectorAll('[data-locale-switch][open]')) {
      details.open = false;
      const summary = details.querySelector('summary');
      if (summary instanceof HTMLElement) summary.focus();
    }
  });
})();
