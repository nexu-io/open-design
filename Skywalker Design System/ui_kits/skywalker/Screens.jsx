/* Screens.jsx — Skywalker portfolio screens */
const useSt = React.useState;

/* ---------- shared decorations ---------- */
function HeroGlow({ size = 720 }) {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 'auto', width: size, height: size,
      borderRadius: '50%', filter: 'blur(120px)', opacity: 0.18,
      pointerEvents: 'none', zIndex: 0, mixBlendMode: 'screen',
      background: 'conic-gradient(from 180deg at 50% 50%, rgba(86,214,255,0) 0deg, rgba(86,214,255,0.45) 120deg, rgba(5,0,255,0.7) 220deg, rgba(86,214,255,0) 360deg)',
      animation: 'sw-spin 18s linear infinite',
    }} />
  );
}

function GridBG() {
  return <div aria-hidden="true" style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
    backgroundSize: '32px 32px',
    maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 30%, transparent 80%)',
  }} />;
}

/* =============================================================
   1. LANDING HERO
   ============================================================= */
function LandingHero({ onEnter }) {
  return (
    <div style={{ position: 'relative', minHeight: '100%', overflow: 'hidden', background: 'var(--bg-canvas)' }}>
      <GridBG />
      <div style={{ position: 'absolute', left: '50%', top: '20%', transform: 'translateX(-50%)' }}><HeroGlow /></div>

      {/* Top nav */}
      <header style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', padding: '22px 48px' }}>
        <LogoLockup height={20} color="light" />
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 28, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', textTransform: 'lowercase' }}>
          <a style={{ color: 'var(--fg-secondary)' }}>work</a>
          <a>writing</a>
          <a>open source</a>
          <a>about</a>
        </nav>
        <div style={{ marginLeft: 28, display: 'flex', gap: 10 }}>
          <Button variant="ghost" size="sm" icon={<IcGithub size={14} />}>github</Button>
          <Button variant="primary" size="sm" glow iconRight={<IcArrow size={14} />} onClick={onEnter}>enter portfolio</Button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ position: 'relative', zIndex: 10, maxWidth: 1080, margin: '60px auto 0', padding: '0 48px', textAlign: 'center' }}>
        <Tag tone="accent" style={{ marginBottom: 28 }}><IcDot size={8} />v0.42 — now with on-chain case studies</Tag>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 96, fontWeight: 400, letterSpacing: '-0.04em', lineHeight: 1.0, margin: 0, color: 'var(--fg-primary)', textTransform: 'uppercase' }}>
          AI-native interfaces<br/>
          <span style={{ color: 'var(--c-cyan)' }}>shipped on-chain.</span>
        </h1>

        <p style={{ marginTop: 28, fontSize: 19, lineHeight: 1.55, color: 'var(--fg-secondary)', maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
          I'm Christian Wu — designer–engineer building Web3 product surfaces, MCP tooling and AI assistant systems. Twelve case studies, three production tools, ledgered work.
        </p>

        <div style={{ marginTop: 36, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button variant="primary" size="lg" glow iconRight={<IcArrow size={16} />} onClick={onEnter}>browse selected work</Button>
          <Button variant="glass" size="lg" icon={<IcSparkle size={14} />}>ask the assistant</Button>
        </div>

        {/* Stats strip */}
        <div style={{ marginTop: 88, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: '24px 0' }}>
          {[
            ['12', 'case studies'],
            ['3', 'production tools'],
            ['2.4k', 'commits this year'],
            ['arbitrum', 'primary chain'],
          ].map(([n, l]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.02em' }}>{n}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Featured shelf */}
      <section style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '80px auto 64px', padding: '0 48px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <Eyebrow>// featured</Eyebrow>
            <h2 className="sw-h4" style={{ margin: '6px 0 0 0' }}>Selected Work</h2>
          </div>
          <Button variant="ghost" size="sm" iconRight={<IcArrow size={14} />} onClick={onEnter}>view all 12</Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {FEATURED.slice(0, 3).map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      </section>

      <style>{`@keyframes sw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ---------- Project tile ---------- */
const FEATURED = [
  { id: '023', title: 'Skywalker MCP Suite', tags: ['mcp', 'ai-workflow', 'design-system'], cover: 'gradient-1', price: '0.42', chain: 'arbitrum', year: '2026', status: 'live' },
  { id: '022', title: 'On-chain Portfolio Ledger', tags: ['web3', 'product'], cover: 'gradient-2', price: '0.21', chain: 'base', year: '2025', status: 'live' },
  { id: '021', title: 'Composer for Claude', tags: ['ai-workflow', 'tooling'], cover: 'gradient-3', price: '0.18', chain: 'arbitrum', year: '2025', status: 'beta' },
  { id: '020', title: 'Wallet Identity Kit', tags: ['web3', 'design-system'], cover: 'gradient-4', price: '0.12', chain: 'base', year: '2025', status: 'live' },
  { id: '019', title: 'Tool-call Visualizer', tags: ['ai-workflow', 'observability'], cover: 'gradient-5', price: '0.09', chain: 'arbitrum', year: '2024', status: 'archived' },
  { id: '018', title: 'NFT Index Dashboard', tags: ['web3', 'data-viz'], cover: 'gradient-6', price: '0.30', chain: 'base', year: '2024', status: 'live' },
];
const COVER_GRADS = {
  'gradient-1': 'radial-gradient(circle at 30% 30%, rgba(86,214,255,0.45) 0%, rgba(5,0,255,0.4) 45%, #07070a 100%)',
  'gradient-2': 'linear-gradient(135deg, rgba(5,0,255,0.55) 0%, #0a0d18 60%, rgba(86,214,255,0.25) 100%)',
  'gradient-3': 'radial-gradient(circle at 70% 25%, rgba(86,214,255,0.4) 0%, rgba(5,0,255,0.3) 45%, #07070a 100%)',
  'gradient-4': 'linear-gradient(150deg, rgba(86,214,255,0.3), rgba(5,0,255,0.4) 60%, #07070a)',
  'gradient-5': 'linear-gradient(180deg, rgba(86,214,255,0.18) 0%, #07070a 90%)',
  'gradient-6': 'radial-gradient(circle at 30% 80%, rgba(5,0,255,0.5), #07070a 70%)',
};

function ProjectCard({ p, onClick, large = false }) {
  return (
    <Card style={{ overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
          onMouseEnter={(e)=>{e.currentTarget.style.boxShadow='var(--shadow-lg)';e.currentTarget.style.transform='translateY(-2px)';}}
          onMouseLeave={(e)=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none';}}
          onClick={onClick}>
      <div style={{ position: 'relative', aspectRatio: large ? '16/9' : '4/3', background: COVER_GRADS[p.cover] }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 60%)' }} />
        <div style={{ position: 'absolute', left: 14, top: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.12em' }}>// {p.id}</span>
        </div>
        <div style={{ position: 'absolute', right: 14, top: 12 }}>
          <Tag tone={p.status === 'live' ? 'success' : p.status === 'beta' ? 'warn' : 'default'} dot style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>{p.status}</Tag>
        </div>
        {/* watermark */}
        <div style={{ position: 'absolute', right: 12, bottom: 10, opacity: 0.55 }}>
          <LogoIcon size={18} color="light" />
        </div>
      </div>
      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>{p.title}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {p.tags.map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 14px', borderTop: '1px solid var(--border-subtle)', marginTop: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>price</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{p.price} Ξ</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>chain</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-secondary)' }}>{p.chain}</span>
        </div>
      </div>
    </Card>
  );
}

/* =============================================================
   2. PORTFOLIO DASHBOARD
   ============================================================= */
function Dashboard({ onOpen }) {
  return (
    <div style={{ padding: '28px 36px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <Eyebrow>// dashboard</Eyebrow>
          <h1 className="sw-h3" style={{ margin: '6px 0 0' }}>Welcome back, Christian.</h1>
          <p style={{ color: 'var(--fg-muted)', margin: '6px 0 0' }}>Last deployment 12 minutes ago to <span style={{ fontFamily: 'var(--font-mono)' }}>arbitrum-mainnet</span> via Skywalker CLI.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" icon={<IcTerm size={14} />}>open cli</Button>
          <Button variant="primary" size="sm" glow icon={<IcZap size={14} />}>new deployment</Button>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 26 }}>
        {[
          ['Lifetime volume', '4.82 Ξ', '+0.12 this week', 'var(--c-cyan)'],
          ['Live tools', '3', '· figma, claude, ledger', 'var(--fg-primary)'],
          ['Case studies', '12', '+1 in draft', 'var(--fg-primary)'],
          ['MCP calls 24h', '1,284', '+18% vs yesterday', 'var(--fg-primary)'],
        ].map(([l, n, d, c]) => (
          <Card key={l} style={{ padding: 18 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, color: c, marginTop: 6, letterSpacing: '-0.02em' }}>{n}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{d}</div>
          </Card>
        ))}
      </div>

      {/* Two-column: chart + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginTop: 14 }}>
        {/* Volume chart */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Eyebrow>// volume · 30d</Eyebrow>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, marginTop: 6 }}>0.84 <span style={{ color: 'var(--fg-muted)' }}>Ξ</span></div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['7d', '30d', '90d', 'all'].map((p, i) => (
                <button key={p} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 6,
                  background: i === 1 ? 'rgba(86,214,255,0.12)' : 'transparent',
                  color: i === 1 ? '#56D6FF' : 'var(--fg-muted)',
                  border: '1px solid', borderColor: i === 1 ? 'rgba(86,214,255,0.3)' : 'transparent', cursor: 'pointer',
                }}>{p}</button>
              ))}
            </div>
          </div>
          <SparkLineChart />
        </Card>

        {/* Activity feed */}
        <Card style={{ padding: 22 }}>
          <Eyebrow>// activity</Eyebrow>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
            {[
              { dot: '#56D6FF', t: 'figma_export · ok', s: '12m · 1.2s · skywalker mcp' },
              { dot: '#1fa463', t: 'deploy → arbitrum',  s: '34m · 0.42 ETH gas' },
              { dot: '#7147FF', t: 'claude.complete',    s: '1h · sonnet-4.5 · 814 tok' },
              { dot: '#f5a524', t: 'wallet.connect',     s: '2h · 0xa3f9…b21c' },
              { dot: '#56D6FF', t: 'ledger.mint case-022', s: '5h · 0.21 ETH' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--border-subtle)' : 'none' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: r.dot, marginTop: 6, flex: 'none' }} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-primary)' }}>{r.t}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{r.s}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent work */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Eyebrow>// recent work</Eyebrow>
          <Button variant="ghost" size="sm" iconRight={<IcArrow size={14} />} onClick={() => onOpen('collection')}>open collection</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {FEATURED.slice(0, 3).map((p) => <ProjectCard key={p.id} p={p} onClick={() => onOpen('detail', p)} />)}
        </div>
      </div>
    </div>
  );
}

function SparkLineChart() {
  // 30 deterministic points
  const pts = [12,14,11,18,22,20,24,28,26,32,30,38,42,40,44,42,48,50,46,52,58,62,60,68,72,70,76,82,78,84];
  const max = 90; const W = 760; const H = 160;
  const path = pts.map((v, i) => `${i ? 'L' : 'M'} ${(i / (pts.length - 1)) * W} ${H - (v / max) * H}`).join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} style={{ width: '100%', height: 200, marginTop: 18, overflow: 'visible' }}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#56D6FF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#56D6FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1="0" x2={W} y1={H * p} y2={H * p} stroke="rgba(255,255,255,0.05)" />
      ))}
      <path d={area} fill="url(#grad)" />
      <path d={path} fill="none" stroke="#56D6FF" strokeWidth="1.5" />
      <circle cx={W} cy={H - (pts[pts.length - 1] / max) * H} r="4" fill="#56D6FF" />
      <circle cx={W} cy={H - (pts[pts.length - 1] / max) * H} r="10" fill="#56D6FF" opacity="0.2" />
    </svg>
  );
}

/* =============================================================
   3. COLLECTION GRID
   ============================================================= */
function Collection({ onOpen }) {
  const [filter, setFilter] = useSt('all');
  const filters = ['all', 'web3', 'ai-workflow', 'design-system', 'tooling'];
  const items = filter === 'all' ? FEATURED : FEATURED.filter(p => p.tags.includes(filter));
  return (
    <div style={{ padding: '28px 36px 64px' }}>
      <Eyebrow>// /collection</Eyebrow>
      <h1 className="sw-h3" style={{ margin: '6px 0 0' }}>Selected Work</h1>
      <p style={{ color: 'var(--fg-muted)', margin: '8px 0 0', maxWidth: 560 }}>
        Twelve case studies, ledgered on-chain. Each one links to a deployable artifact, a write-up and the source repo.
      </p>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 26, paddingBottom: 16, borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 12px', borderRadius: 8,
              background: filter === f ? 'rgba(86,214,255,0.12)' : 'transparent',
              color: filter === f ? '#56D6FF' : 'var(--fg-secondary)',
              border: '1px solid', borderColor: filter === f ? 'rgba(86,214,255,0.3)' : 'var(--border-default)',
              cursor: 'pointer',
            }}>{f}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{items.length} items</span>
          <Button variant="secondary" size="sm" icon={<IcGrid size={14} />}>grid</Button>
          <Button variant="secondary" size="sm" iconRight={<IcChevD size={14} />}>sort: recent</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 22 }}>
        {items.map((p) => <ProjectCard key={p.id} p={p} onClick={() => onOpen('detail', p)} />)}
      </div>
    </div>
  );
}

/* =============================================================
   4. NFT DETAIL / PROJECT
   ============================================================= */
function Detail({ project, onOpen }) {
  const p = project || FEATURED[0];
  return (
    <div style={{ padding: '28px 36px 64px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 36 }}>
      <div>
        <div style={{ aspectRatio: '1/1', borderRadius: 18, overflow: 'hidden', position: 'relative', border: '1px solid var(--border-default)', background: COVER_GRADS[p.cover] }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.2), transparent 60%)' }} />
          <div style={{ position: 'absolute', left: 18, top: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.1em' }}>// {p.id} · {p.year}</div>
          <div style={{ position: 'absolute', right: 18, bottom: 16 }}><LogoLockup height={20} color="light" /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {[1,2,3,4].map((i) => (
            <div key={i} style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid var(--border-default)', background: COVER_GRADS[`gradient-${i}`], opacity: i === 1 ? 1 : 0.5, cursor: 'pointer' }} />
          ))}
        </div>
      </div>

      <div>
        <Tag tone="success" dot>{p.status}</Tag>
        <h1 className="sw-h2" style={{ margin: '14px 0 6px', fontWeight: 600 }}>{p.title}</h1>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-muted)' }}>case-study/{p.id} · ledgered on {p.chain}</div>

        <div style={{ marginTop: 26, padding: 20, border: '1px solid var(--border-default)', borderRadius: 14, background: 'var(--bg-elevated)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <Eyebrow>price</Eyebrow>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500, marginTop: 4 }}>{p.price} Ξ</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>≈ $1,284 USD</div>
            </div>
            <div>
              <Eyebrow>edition</Eyebrow>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500, marginTop: 4 }}>1 / 1</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>unique edition</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <Button variant="primary" glow icon={<IcEth size={14} />} style={{ flex: 1, justifyContent: 'center' }}>collect on {p.chain}</Button>
            <Button variant="secondary" icon={<IcDoc size={14} />} onClick={() => onOpen('casestudy', p)}>read case study</Button>
          </div>
        </div>

        {/* Description */}
        <div style={{ marginTop: 24 }}>
          <Eyebrow>// abstract</Eyebrow>
          <p style={{ marginTop: 8, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
            A unified MCP server exposing my design and engineering toolchain as callable tools. Includes Figma export, Claude composer, on-chain ledger and Skywalker CLI bindings. Shipped to arbitrum mainnet.
          </p>
        </div>

        {/* Properties */}
        <div style={{ marginTop: 22 }}>
          <Eyebrow>// properties</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            {[
              ['role', 'design + eng'],
              ['stack', 'ts · react · viem'],
              ['surface', 'mcp + cli'],
              ['team', 'solo'],
              ['duration', '6 weeks'],
              ['license', 'MIT'],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Owner */}
        <div style={{ marginTop: 22, padding: 14, border: '1px solid var(--border-default)', borderRadius: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <CWMark size={32} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Christian Wu</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>0xa3f9…b21c · creator + owner</div>
          </div>
          <Button variant="ghost" size="sm" iconRight={<IcExternal size={12} />} style={{ marginLeft: 'auto' }}>view on chain</Button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================
   5. AI ASSISTANT PANEL
   ============================================================= */
function Assistant() {
  return (
    <div style={{ padding: '28px 36px 64px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 22, height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Eyebrow>// assistant</Eyebrow>
          <h1 className="sw-h3" style={{ margin: '6px 0 4px' }}>Ask Skywalker</h1>
          <p style={{ color: 'var(--fg-muted)', margin: 0 }}>Explore my work, code samples and skills. Backed by Claude sonnet-4.5 + 7 MCP tools.</p>
        </div>

        {/* Conversation */}
        <Card style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 18, overflow: 'hidden' }}>
          <Bubble who="user" name="you">Show me Skywalker case studies that ship to Arbitrum.</Bubble>
          <Bubble who="ai" name="skywalker">
            Found 3 projects matching <code style={{ fontFamily: 'var(--font-mono)', color: '#56D6FF' }}>chain:arbitrum</code> + <code style={{ fontFamily: 'var(--font-mono)', color: '#56D6FF' }}>status:live</code>. Loading covers.
            <ToolCall name="search.projects" args="chain:arbitrum status:live" duration="0.4s" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
              {FEATURED.filter(p => p.chain === 'arbitrum' && p.status !== 'archived').slice(0, 3).map(p => (
                <div key={p.id} style={{ aspectRatio: '1/1', borderRadius: 10, background: COVER_GRADS[p.cover], position: 'relative', border: '1px solid var(--border-default)' }}>
                  <div style={{ position: 'absolute', left: 8, bottom: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#fff' }}>// {p.id}</div>
                </div>
              ))}
            </div>
          </Bubble>
          <Bubble who="user" name="you">Open the MCP suite case study.</Bubble>
          <Bubble who="ai" name="skywalker" streaming>
            Opening <code style={{ fontFamily: 'var(--font-mono)', color: '#56D6FF' }}>case-study/023</code> — Skywalker MCP Suite. Shipped 12m ago on arbitrum-mainnet
            <ToolCall name="ledger.read" args="case-study/023" duration="0.2s" />
            <ToolCall name="figma.export" args="frame:hero@2x" duration="1.2s" running />
          </Bubble>

          {/* Composer */}
          <div style={{ marginTop: 'auto' }}>
            <Composer />
          </div>
        </Card>
      </div>

      {/* Right: tool sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ padding: 18 }}>
          <Eyebrow>// active model</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#0500FF,#56D6FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#fff', fontSize: 12 }}>SK</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>claude-sonnet-4.5</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>200k ctx · 814 / 8k tok</div>
            </div>
            <Button variant="ghost" size="sm" iconRight={<IcChevD size={12} />} style={{ marginLeft: 'auto' }}>swap</Button>
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>// available tools</Eyebrow>
            <Tag tone="accent">7 / 12</Tag>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
            {[
              { name: 'figma.export', s: 'idle', icon: IcFigma },
              { name: 'ledger.read', s: 'last 12s', icon: IcLayers },
              { name: 'search.projects', s: 'last 0.4s', icon: IcSearch },
              { name: 'wallet.read', s: 'idle', icon: IcWallet },
              { name: 'claude.complete', s: 'streaming', icon: IcSparkle },
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border-subtle)' : 'none' }}>
                <t.icon size={14} style={{ color: 'var(--fg-muted)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.name}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: t.s === 'streaming' ? '#56D6FF' : 'var(--fg-muted)' }}>{t.s}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <Eyebrow>// suggestions</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {[
              'What was your hardest design tradeoff in 2025?',
              'Show me your most-used color tokens.',
              'Pull recent commits from skywalker-mcp.',
              'Compare Composer vs Tool Visualizer scopes.',
            ].map((s, i) => (
              <button key={i} style={{
                textAlign: 'left', padding: '10px 12px', border: '1px solid var(--border-default)',
                borderRadius: 10, background: 'transparent', color: 'var(--fg-secondary)',
                fontFamily: 'var(--font-sans)', fontSize: 12, cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Bubble({ who, name, children, streaming }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        width: 28, height: 28, flex: 'none', borderRadius: 8,
        background: who === 'ai' ? 'linear-gradient(135deg,#0500FF,#56D6FF)' : 'var(--bg-elevated)',
        border: who === 'user' ? '1px solid var(--border-default)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11,
        color: who === 'ai' ? '#fff' : 'var(--fg-secondary)',
      }}>{who === 'ai' ? 'SK' : 'CW'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>
          {name}{streaming && <span style={{ marginLeft: 8, color: '#56D6FF' }}>● streaming</span>}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--fg-secondary)' }}>{children}</div>
      </div>
    </div>
  );
}

function ToolCall({ name, args, duration, running }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      marginTop: 10, marginRight: 10,
      padding: '6px 10px',
      background: 'rgba(245,165,36,0.08)',
      border: '1px solid', borderColor: 'rgba(245,165,36,0.3)',
      borderRadius: 8,
      fontFamily: 'var(--font-mono)', fontSize: 11,
      color: '#f5a524',
    }}>
      <span style={{ opacity: 0.6 }}>→</span>
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ opacity: 0.6 }}>·</span>
      <span style={{ color: 'var(--fg-muted)' }}>{args}</span>
      <span style={{ opacity: 0.6 }}>·</span>
      <span>{running ? 'running' : duration}</span>
    </div>
  );
}

function Composer() {
  return (
    <div style={{ marginTop: 14, border: '1px solid var(--border-default)', borderRadius: 14, padding: 12, background: 'var(--bg-canvas)' }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 14, color: 'var(--fg-muted)', minHeight: 22 }}>
        <span style={{ fontFamily: 'var(--font-mono)', color: '#56D6FF' }}>›</span>
        <span>Ask anything about my work, code or process…</span>
        <span style={{ width: 7, height: 16, background: '#56D6FF', display: 'inline-block', marginLeft: 'auto', animation: 'sw-blink 1s step-end infinite' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
        <Button variant="ghost" size="sm" icon={<IcImg size={14} />}>attach</Button>
        <Button variant="ghost" size="sm" icon={<IcPlug size={14} />}>tools (7)</Button>
        <Button variant="ghost" size="sm" icon={<IcLayers size={14} />}>context</Button>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}><KBD>↩</KBD> send · <KBD>⇧↩</KBD> newline</span>
        <Button variant="primary" size="sm" glow icon={<IcSend size={12} />}>send</Button>
      </div>
      <style>{`@keyframes sw-blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

/* =============================================================
   6. MCP APPS / INTEGRATIONS
   ============================================================= */
function MCPApps() {
  const apps = [
    { name: 'Figma exporter',     desc: '3 tools · last call 12m', initial: 'F', grad: 'linear-gradient(135deg,#a259ff,#f24e1e)', enabled: true,  calls: 248, status: 'live' },
    { name: 'Claude composer',    desc: '7 tools · last call 1m',  initial: 'C', grad: 'linear-gradient(135deg,#d97757,#5e00ff)', enabled: true,  calls: 1284, status: 'live' },
    { name: 'On-chain ledger',    desc: '4 tools · last call 5m',  initial: 'L', grad: 'linear-gradient(135deg,#0500FF,#56D6FF)', enabled: true,  calls: 96, status: 'live' },
    { name: 'Skywalker CLI',      desc: '12 tools · last call 12s',initial: 'S', grad: 'linear-gradient(135deg,#7147FF,#FF7EAB)', enabled: true,  calls: 422, status: 'live' },
    { name: 'GitHub commit feed', desc: '2 tools · last call 2h',  initial: 'G', grad: 'linear-gradient(135deg,#222,#444)',       enabled: false, calls: 18, status: 'paused' },
    { name: 'Linear sync',        desc: '5 tools · not connected', initial: 'L', grad: 'linear-gradient(135deg,#5E6AD2,#8B92F0)', enabled: false, calls: 0, status: 'beta' },
  ];
  return (
    <div style={{ padding: '28px 36px 64px' }}>
      <Eyebrow>// /mcp</Eyebrow>
      <h1 className="sw-h3" style={{ margin: '6px 0 0' }}>MCP Integrations</h1>
      <p style={{ color: 'var(--fg-muted)', margin: '6px 0 24px', maxWidth: 560 }}>
        Tools the Skywalker assistant can call. Each MCP server exposes a set of typed actions over a shared protocol — toggle them on or off, no redeploy.
      </p>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[['active servers', '4 / 6'], ['tools available', '33'], ['calls 24h', '1,284'], ['errors', '0.3%']].map(([k, v]) => (
          <Card key={k} style={{ padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, marginTop: 6 }}>{v}</div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Eyebrow>// servers</Eyebrow>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" icon={<IcSearch size={14} />}>filter</Button>
          <Button variant="primary" size="sm" glow icon={<IcPlug size={14} />}>add server</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {apps.map((a) => <McpCard key={a.name} a={a} />)}
        </div>
      </div>

      {/* Console */}
      <Card style={{ marginTop: 28, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <IcTerm size={14} style={{ color: 'var(--fg-muted)' }} />
          <Eyebrow>// tool console · live</Eyebrow>
          <Tag tone="success" dot>recording</Tag>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>tail -f</span>
        </div>
        <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.85, color: 'var(--fg-secondary)' }}>
          <div><span style={{ color: 'var(--fg-muted)' }}>12:42:17</span>  <span style={{ color: '#56D6FF' }}>→ figma.export</span>  frame:hero@2x  <span style={{ color: '#1fa463' }}>ok</span> <span style={{ color: 'var(--fg-muted)' }}>1.2s</span></div>
          <div><span style={{ color: 'var(--fg-muted)' }}>12:42:14</span>  <span style={{ color: '#56D6FF' }}>→ ledger.read</span>  case-study/023  <span style={{ color: '#1fa463' }}>ok</span> <span style={{ color: 'var(--fg-muted)' }}>0.2s</span></div>
          <div><span style={{ color: 'var(--fg-muted)' }}>12:42:09</span>  <span style={{ color: '#56D6FF' }}>→ search.projects</span>  chain:arbitrum  <span style={{ color: '#1fa463' }}>ok</span> <span style={{ color: 'var(--fg-muted)' }}>0.4s</span></div>
          <div><span style={{ color: 'var(--fg-muted)' }}>12:41:55</span>  <span style={{ color: '#56D6FF' }}>→ claude.complete</span>  sonnet-4.5  <span style={{ color: '#1fa463' }}>814 tok</span> <span style={{ color: 'var(--fg-muted)' }}>2.4s</span></div>
          <div><span style={{ color: 'var(--fg-muted)' }}>12:41:30</span>  <span style={{ color: '#7147FF' }}>↻ wallet.connect</span>  0xa3f9…b21c  <span style={{ color: '#1fa463' }}>ok</span></div>
        </div>
      </Card>
    </div>
  );
}

function McpCard({ a }) {
  return (
    <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: a.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff', fontSize: 16 }}>{a.initial}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{a.desc}</div>
        </div>
        <Toggle on={a.enabled} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <Stat l="status" v={<Tag tone={a.status === 'live' ? 'success' : a.status === 'beta' ? 'warn' : 'default'} dot>{a.status}</Tag>} />
        <Stat l="calls 24h" v={a.calls.toLocaleString()} />
        <Stat l="latency" v="0.4s" />
      </div>
    </Card>
  );
}
function Stat({ l, v }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 4 }}>{v}</div>
    </div>
  );
}
function Toggle({ on }) {
  return (
    <div style={{
      width: 38, height: 22, borderRadius: 999,
      background: on ? 'rgba(5,0,255,0.5)' : 'var(--bg-muted)',
      border: '1px solid', borderColor: on ? 'rgba(86,214,255,0.4)' : 'var(--border-default)',
      position: 'relative', transition: 'all 200ms var(--ease-out)',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: 999, background: '#fff',
        transition: 'left 200ms var(--ease-out)',
      }} />
    </div>
  );
}

/* =============================================================
   7. WALLET / PROFILE
   ============================================================= */
function WalletProfile() {
  return (
    <div style={{ padding: '28px 36px 64px' }}>
      <Eyebrow>// /wallet</Eyebrow>
      <h1 className="sw-h3" style={{ margin: '6px 0 0' }}>Wallet & Profile</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginTop: 26 }}>
        {/* Identity card */}
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 130, position: 'relative', background: 'conic-gradient(from 90deg at 30% 50%, #0500FF, #56D6FF, #FF7EAB, #5E00FF, #0500FF)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 70% 50%, rgba(255,255,255,0.15), transparent 60%)' }} />
            <div style={{ position: 'absolute', right: 14, top: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.1em' }}>// identity-card 0xa3f9</div>
          </div>
          <div style={{ padding: 22, marginTop: -38, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--bg-elevated)', border: '3px solid var(--bg-canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CWMark size={42} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Christian Wu</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: '#1fa463', boxShadow: '0 0 8px #1fa463' }} />
                0xa3f9…b21c
                <button style={{ background: 'transparent', border: 0, color: 'var(--fg-muted)', cursor: 'pointer' }}><IcCopy size={12} /></button>
              </div>
            </div>
            <p style={{ color: 'var(--fg-secondary)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
              Designer–engineer building AI-native interfaces and on-chain product surfaces. Based in Taipei. Previously Anthropic, Figma, &c.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Tag>arbitrum</Tag><Tag>base</Tag><Tag>ethereum</Tag>
            </div>
          </div>
        </Card>

        {/* Balances */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Eyebrow>total balance</Eyebrow>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, marginTop: 8, letterSpacing: '-0.02em' }}>0.42 <span style={{ color: 'var(--fg-muted)' }}>Ξ</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>≈ $1,284.92 USD</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" size="sm" glow icon={<IcArrow size={12} style={{ transform: 'rotate(-45deg)' }} />}>send</Button>
                <Button variant="secondary" size="sm" icon={<IcArrow size={12} style={{ transform: 'rotate(135deg)' }} />}>receive</Button>
              </div>
            </div>
            <div style={{ marginTop: 22 }}>
              {[
                ['ETH', 'arbitrum', '0.31', '$948.10'],
                ['ETH', 'base',     '0.08', '$245.20'],
                ['USDC','arbitrum','91.62','$91.62'],
              ].map(([s, c, b, u]) => (
                <div key={s+c} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: 'linear-gradient(135deg,#0500FF,#56D6FF)' }} />
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{s}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{c}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{b}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{u}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Settings */}
      <div style={{ marginTop: 28 }}>
        <Eyebrow>// preferences</Eyebrow>
        <Card style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          {[
            ['Default chain', 'arbitrum-mainnet', 'change'],
            ['Notifications', 'on-chain events only', 'configure'],
            ['Assistant model', 'claude-sonnet-4.5', 'swap'],
            ['Display name', 'Christian Wu', 'edit'],
            ['Two-factor', 'hardware key + passkey', 'manage'],
          ].map(([k, v, action], i, arr) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{v}</div>
              </div>
              <Button variant="ghost" size="sm" iconRight={<IcChevR size={12} />}>{action}</Button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* =============================================================
   8. FULL CASE STUDY
   ============================================================= */
function CaseStudy({ project }) {
  const p = project || FEATURED[0];
  return (
    <div style={{ padding: '28px 36px 64px', maxWidth: 1080, margin: '0 auto' }}>
      <Eyebrow>// case-study/{p.id}</Eyebrow>
      <h1 className="sw-h2" style={{ margin: '12px 0 16px', maxWidth: 720 }}>{p.title}</h1>
      <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--fg-secondary)', maxWidth: 720, margin: 0 }}>
        Designed and shipped a unified MCP server that makes my entire toolchain — Figma, Claude, on-chain ledger, Skywalker CLI — callable as typed actions from any agent surface.
      </p>

      {/* Meta strip */}
      <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: '18px 0' }}>
        {[['role', 'design + eng'], ['team', 'solo'], ['duration', '6 weeks'], ['shipped', `${p.year}-Q4`], ['chain', p.chain]].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Hero image */}
      <div style={{ marginTop: 36, aspectRatio: '16/9', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', background: COVER_GRADS[p.cover], position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.25), transparent 60%)' }} />
        <div style={{ position: 'absolute', left: 24, bottom: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Tag tone="primary">case-study/{p.id}</Tag>
          <LogoLockup height={26} color="light" />
        </div>
      </div>

      <Section title="Problem" eyebrow="01">
        Every agent I build re-implements the same five tools: read a Figma frame, pull a commit, complete with Claude, mint to chain, query the ledger. Each integration is bespoke — different auth, different error shapes, different observability. The cost is invisible until you try to add a sixth.
      </Section>

      <Section title="Approach" eyebrow="02">
        I exposed every tool through the Model Context Protocol so the contract is identical across surfaces. The CLI, the assistant, and any third-party agent all see the same JSON schema. I treated the tool catalog itself as a product: typed inputs, predictable error envelopes, latency budgets.
      </Section>

      {/* Code block */}
      <CodeBlock />

      <Section title="Outcome" eyebrow="03">
        Total integration time for a new tool: 22 minutes. Mean tool-call latency: 0.4s. The Skywalker assistant now resolves 78% of incoming questions without human intervention, and every answer is reproducible because every tool call is on-chain.
      </Section>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 18 }}>
        {[
          ['1,284', 'tool calls / 24h'],
          ['0.4s', 'p50 latency'],
          ['78%', 'auto-resolution rate'],
        ].map(([n, l]) => (
          <Card key={l} style={{ padding: 22 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: '#56D6FF', letterSpacing: '-0.02em' }}>{n}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 6 }}>{l}</div>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 56, padding: 26, border: '1px solid var(--border-default)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 18 }}>
        <CWMark size={42} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Want to ship something like this?</div>
          <div style={{ color: 'var(--fg-muted)', fontSize: 13, marginTop: 4 }}>Contracting Q1 2026 onward · arbitrum-friendly · MCP / AI surfaces.</div>
        </div>
        <Button variant="secondary" size="sm" icon={<IcGithub size={14} />}>view repo</Button>
        <Button variant="primary" size="sm" glow iconRight={<IcArrow size={14} />}>get in touch</Button>
      </div>
    </div>
  );
}

function Section({ title, eyebrow, children }) {
  return (
    <section style={{ marginTop: 48 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-cyan)', letterSpacing: '0.12em' }}>// {eyebrow}</div>
      <h2 className="sw-h4" style={{ margin: '6px 0 14px', fontWeight: 600 }}>{title}</h2>
      <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--fg-secondary)', maxWidth: 720, margin: 0 }}>{children}</p>
    </section>
  );
}

function CodeBlock() {
  return (
    <div style={{ marginTop: 22, borderRadius: 14, border: '1px solid var(--border-default)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#f46772' }} />
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#f5a524' }} />
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#1fa463' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginLeft: 8 }}>skywalker-mcp · server.ts</span>
      </div>
      <pre style={{ margin: 0, padding: 22, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.7, color: 'var(--fg-secondary)', overflowX: 'auto' }}>
<span style={{ color: '#7147FF' }}>export const</span> <span style={{ color: '#56D6FF' }}>figmaExport</span> = mcp.tool({'{'}
{'\n'}  <span style={{ color: '#FF7EAB' }}>name</span>: <span style={{ color: '#1fa463' }}>"figma.export"</span>,
{'\n'}  <span style={{ color: '#FF7EAB' }}>input</span>: z.object({'{'} frame: z.string(), scale: z.number().default(<span style={{ color: '#56D6FF' }}>2</span>) {'}'}),
{'\n'}  <span style={{ color: '#FF7EAB' }}>handler</span>: <span style={{ color: '#7147FF' }}>async</span> ({'{'} frame, scale {'}'}) =&gt; {'{'}
{'\n'}    <span style={{ color: '#7147FF' }}>const</span> png = <span style={{ color: '#7147FF' }}>await</span> figma.export(frame, {'{'} scale {'}'});
{'\n'}    <span style={{ color: '#7147FF' }}>return</span> {'{'} bytes: png.bytes, mime: <span style={{ color: '#1fa463' }}>"image/png"</span> {'}'};
{'\n'}  {'}'},
{'\n'}{'}'});
      </pre>
    </div>
  );
}

/* =============================================================
   EXPOSE
   ============================================================= */
Object.assign(window, {
  LandingHero, Dashboard, Collection, Detail, Assistant, MCPApps, WalletProfile, CaseStudy,
  ProjectCard, FEATURED, COVER_GRADS,
});
