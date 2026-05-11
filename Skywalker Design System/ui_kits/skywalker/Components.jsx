// Components.jsx — Skywalker portfolio shared components
// Loaded as Babel JSX. All named pieces export to window so other files see them.

// React hooks accessed via React.* to avoid collisions across babel scripts

/* =============================================================
   ICONS  — minimal Lucide-style line icons (1.5px stroke)
   Re-exported as named SVG components.
   ============================================================= */
const Icon = ({ d, size = 16, fill = "none", stroke = "currentColor", sw = 1.5, style, children, viewBox = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={sw}
       strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);
const IcGrid     = (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></Icon>;
const IcLayers   = (p) => <Icon {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></Icon>;
const IcSparkle  = (p) => <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/><circle cx="12" cy="12" r="3"/></Icon>;
const IcPlug     = (p) => <Icon {...p}><path d="M12 2v6M9 8h6M7 12a5 5 0 0 0 10 0v-2H7zM12 17v5"/></Icon>;
const IcWallet   = (p) => <Icon {...p}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></Icon>;
const IcSearch   = (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>;
const IcArrow    = (p) => <Icon {...p}><path d="M5 12h14M13 5l7 7-7 7"/></Icon>;
const IcChevR    = (p) => <Icon {...p}><path d="m9 6 6 6-6 6"/></Icon>;
const IcChevD    = (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>;
const IcMenu     = (p) => <Icon {...p}><path d="M3 6h18M3 12h18M3 18h18"/></Icon>;
const IcSend     = (p) => <Icon {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></Icon>;
const IcStar     = (p) => <Icon {...p}><polygon points="12 2 15 9 22 9 17 14 19 22 12 17 5 22 7 14 2 9 9 9 12 2"/></Icon>;
const IcExternal = (p) => <Icon {...p}><path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7"/></Icon>;
const IcGithub   = (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1 .8-.2 1.7-.3 2.5-.3.8 0 1.7.1 2.5.3 1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.8v2.6c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></Icon>;
const IcCopy     = (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Icon>;
const IcSettings = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></Icon>;
const IcCheck    = (p) => <Icon {...p}><path d="m20 6-11 11L4 12"/></Icon>;
const IcDot      = (p) => <Icon {...p} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="4"/></Icon>;
const IcZap      = (p) => <Icon {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Icon>;
const IcEth      = (p) => <Icon {...p}><path d="M12 2 5 12l7 4 7-4-7-10ZM5 13l7 4 7-4M12 16v6"/></Icon>;
const IcFigma    = (p) => <Icon {...p}><path d="M9 2a3 3 0 0 0 0 6h3V2H9ZM12 2v6h3a3 3 0 0 0 0-6h-3ZM12 8h3a3 3 0 0 1 0 6h-3V8ZM9 8a3 3 0 0 0 0 6h3V8H9ZM9 14a3 3 0 1 0 3 3v-3H9Z"/></Icon>;
const IcTerm     = (p) => <Icon {...p}><path d="m4 17 6-6-6-6M12 19h8"/></Icon>;
const IcImg      = (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></Icon>;
const IcDoc      = (p) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Icon>;
const IcLock     = (p) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></Icon>;

/* =============================================================
   LOGO COMPONENTS
   ============================================================= */
function LogoIcon({ size = 24, color }) {
  return <img src="../../assets/logo-icon.svg" alt="" width={size} height={size}
    style={{ display: 'block', filter: color === 'light' ? 'invert(1)' : color === 'primary' ? 'invert(11%) sepia(96%) saturate(7000%) hue-rotate(245deg)' : undefined }} />;
}
function LogoWordmark({ height = 18, color = 'light' }) {
  return <img src="../../assets/logo-wordmark.svg" alt="Skywalker"
    style={{ height, display: 'block', filter: color === 'light' ? 'invert(1)' : undefined }} />;
}
function LogoLockup({ height = 22, color = 'light', stacked = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', gap: stacked ? 6 : 10, alignItems: stacked ? 'flex-start' : 'center' }}>
      <LogoIcon size={height + 2} color={color} />
      <LogoWordmark height={height} color={color} />
    </div>
  );
}
function CWMark({ size = 28 }) {
  return <img src="../../assets/christianwu-mark.svg" alt="Christian Wu" width={size} height={size} style={{ display: 'block' }} />;
}

/* =============================================================
   PRIMITIVES
   ============================================================= */
function Button({ children, variant = 'primary', size = 'md', icon, iconRight, onClick, style, glow, ...rest }) {
  const base = {
    fontFamily: 'var(--font-sans)', fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    borderRadius: 8, border: '1px solid var(--border-default)',
    transition: 'all 200ms var(--ease-out)',
    fontSize: size === 'sm' ? 12 : 13,
    padding: size === 'sm' ? '6px 10px' : size === 'lg' ? '10px 18px' : '8px 14px',
  };
  const variants = {
    primary: { background: '#0500FF', color: '#fff', borderColor: 'rgba(255,255,255,0.18)', boxShadow: glow ? 'var(--shadow-glow)' : 'none' },
    secondary: { background: 'var(--bg-elevated)', color: 'var(--fg-primary)' },
    ghost: { background: 'transparent', color: 'var(--fg-secondary)', border: '1px solid transparent' },
    glass: { background: 'rgba(255,255,255,0.04)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' },
    danger: { background: 'rgba(244,103,114,0.1)', color: '#f46772', borderColor: 'rgba(244,103,114,0.4)' },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {icon}{children}{iconRight}
    </button>
  );
}

function Tag({ children, tone = 'default', dot, mono = true, style }) {
  const tones = {
    default: { color: 'var(--fg-secondary)', borderColor: 'var(--border-default)' },
    accent:  { color: '#56D6FF', background: 'rgba(86,214,255,0.10)', borderColor: 'rgba(86,214,255,0.3)' },
    primary: { color: '#fff',    background: 'rgba(5,0,255,0.5)', borderColor: 'rgba(255,255,255,0.18)' },
    success: { color: '#1fa463', borderColor: 'rgba(31,164,99,0.4)' },
    warn:    { color: '#f5a524', borderColor: 'rgba(245,165,36,0.4)' },
    danger:  { color: '#f46772', borderColor: 'rgba(244,103,114,0.4)' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999,
      border: '1px solid', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontSize: 11, fontWeight: 500, letterSpacing: '0.02em',
      ...tones[tone], ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', boxShadow: tone === 'success' ? '0 0 8px currentColor' : 'none' }} />}
      {children}
    </span>
  );
}

function Card({ children, style, hover = true, ...rest }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: 10,
      transition: 'all 200ms var(--ease-out)',
      ...style,
    }} {...rest}>
      {children}
    </div>
  );
}

function Eyebrow({ children, style }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', ...style }}>{children}</span>;
}

function KBD({ children }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '1px 5px' }}>{children}</span>;
}

/* =============================================================
   APP SHELL — sidebar + topbar
   ============================================================= */
function Sidebar({ active, onNav }) {
  const groups = [
    { label: 'Workspace', items: [
      ['landing',   'Home',         IcZap],
      ['dashboard', 'Dashboard',    IcGrid],
      ['collection','Selected Work',IcLayers],
      ['casestudy', 'Case Study',   IcDoc],
    ]},
    { label: 'AI · Web3', items: [
      ['assistant', 'Assistant',    IcSparkle],
      ['mcp',       'MCP Apps',     IcPlug],
      ['wallet',    'Wallet',       IcWallet],
    ]},
  ];
  return (
    <aside style={{
      width: 220, flex: 'none',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-default)',
      display: 'flex', flexDirection: 'column',
      padding: '14px 12px',
      gap: 22,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px' }}>
        <CWMark size={26} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '-0.01em' }}>Christian Wu</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>skywalker · v0.42</span>
        </div>
      </div>

      {groups.map((g) => (
        <nav key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px' }}>{g.label}</div>
          {g.items.map(([key, label, IcoComp]) => {
            const isActive = active === key;
            return (
              <button key={key} onClick={() => onNav(key)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: isActive ? 'rgba(5,0,255,0.12)' : 'transparent',
                color: isActive ? '#56D6FF' : 'var(--fg-secondary)',
                border: '1px solid', borderColor: isActive ? 'rgba(86,214,255,0.25)' : 'transparent',
                fontSize: 13, fontWeight: 500,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 160ms var(--ease-out)',
              }}>
                <IcoComp size={16} />
                <span>{label}</span>
                {isActive && <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: 999, background: '#56D6FF' }} />}
              </button>
            );
          })}
        </nav>
      ))}

      <div style={{ marginTop: 'auto', padding: 12, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#1fa463', boxShadow: '0 0 8px #1fa463' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)' }}>system online</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
          last deploy 12m<br/>arbitrum-mainnet<br/>3 mcp tools live
        </div>
      </div>
    </aside>
  );
}

function TopBar({ title, breadcrumb, onCommandK }) {
  return (
    <header style={{
      height: 48, flex: 'none', display: 'flex', alignItems: 'center',
      padding: '0 22px', gap: 14,
      borderBottom: '1px solid var(--border-default)',
      background: 'rgba(10,10,12,0.7)', backdropFilter: 'blur(20px)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
        {breadcrumb?.map((b, i) => (
          <React.Fragment key={i}>
            <span style={{ color: i === breadcrumb.length - 1 ? 'var(--fg-primary)' : 'inherit' }}>{b}</span>
            {i < breadcrumb.length - 1 && <span style={{ opacity: 0.4 }}>/</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={onCommandK} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-muted)',
        minWidth: 280,
      }}>
        <IcSearch size={14} />
        <span>Search projects, tools, addresses…</span>
        <span style={{ marginLeft: 'auto' }}><KBD>⌘K</KBD></span>
      </button>
      <Button variant="secondary" size="sm" icon={<IcWallet size={14} />}>0xa3f9…b21c</Button>
      <div style={{ width: 28, height: 28, borderRadius: 999, background: 'linear-gradient(135deg,#0500FF,#56D6FF)' }} />
    </header>
  );
}

/* =============================================================
   EXPOSE
   ============================================================= */
Object.assign(window, {
  IcGrid, IcLayers, IcSparkle, IcPlug, IcWallet, IcSearch, IcArrow, IcChevR, IcChevD, IcMenu,
  IcSend, IcStar, IcExternal, IcGithub, IcCopy, IcSettings, IcCheck, IcDot, IcZap, IcEth, IcFigma, IcTerm, IcImg, IcDoc, IcLock,
  LogoIcon, LogoWordmark, LogoLockup, CWMark,
  Button, Tag, Card, Eyebrow, KBD,
  Sidebar, TopBar,
});
