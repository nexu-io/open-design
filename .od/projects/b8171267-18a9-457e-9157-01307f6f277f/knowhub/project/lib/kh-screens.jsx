// kh-screens.jsx — redesigned Knowledge Hub mobile screens
// Shared component set that consumes project/design-system/tokens.css.

// ─── Icons (stroke-only, 20px) ─────────────────────────────
const Icon = ({ d, size = 20, stroke = 'currentColor', fill = 'none', sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);
const IconSearch = (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>} />;
const IconMoon   = (p) => <Icon {...p} d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.5 6.5 0 0 0 10 10Z" />;
const IconSun    = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></>} />;
const IconHome   = (p) => <Icon {...p} d={<><path d="M3.5 11 12 4l8.5 7"/><path d="M5 10v9h14v-9"/></>} />;
const IconLibrary= (p) => <Icon {...p} d={<><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M8 4v15M3.5 9h4.5"/></>} />;
const IconOps    = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>} />;
const IconPlay   = (p) => <Icon {...p} d="M8 5v14l11-7z" fill="currentColor" stroke="none" />;
const IconImage  = (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m3 16 5-4 6 5 3-2 4 3"/></>} />;
const IconLink   = (p) => <Icon {...p} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L12.5 17" />;
const IconGit    = (p) => <Icon {...p} d={<><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M8.5 6H14a3 3 0 0 1 3 3v1"/></>} />;
const IconClock  = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/></>} />;
const IconChevronLeft = (p) => <Icon {...p} d="M15 6l-6 6 6 6" />;
const IconMoreHorizontal = (p) => <Icon {...p} d={<><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></>} stroke="none" />;

// ─── Tiny primitives ───────────────────────────────────────
const BOTTOM_NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: IconHome },
  { id: 'search', label: 'Search', icon: IconSearch },
  { id: 'library', label: 'Library', icon: IconLibrary },
  { id: 'ops', label: 'Ops', icon: IconOps },
];

function useCanvasTheme() {
  const ctx = window.DCCtx ? React.useContext(window.DCCtx) : null;
  return ctx || {};
}

const pillColorForTone = (tone, active) => {
  if (active || tone === 'primary') return 'var(--primary)';
  if (tone === 'success') return 'var(--success)';
  if (tone === 'info') return 'var(--info)';
  if (tone === 'warning') return 'var(--warning)';
  if (tone === 'danger') return 'var(--danger)';
  return 'var(--foreground-dim)';
};

const Pill = ({ tone = 'neutral', size = 'sm', active, style, children, ...rest }) => {
  const h = size === 'xs' ? 20 : 22;
  const fs = size === 'xs' ? 10 : 11;
  return (
    <span {...rest} style={{
      display: 'inline-flex', alignItems: 'center', height: h, padding: '0 8px',
      borderRadius: 'var(--radius-full)', fontSize: fs, fontWeight: 500,
      letterSpacing: 'var(--tracking-wide)',
      background: active || tone === 'primary' ? 'var(--primary-tint)' : 'var(--pill-bg)',
      color: pillColorForTone(tone, active),
      border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
      ...style,
    }}>{children}</span>
  );
};

// ─── Header (56px, single row) ─────────────────────────────
function SearchBar() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 8,
      height: 36, padding: '0 12px',
      background: 'var(--pill-bg)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-lg)', color: 'var(--foreground)',
    }}>
      <IconSearch size={14} stroke="var(--muted)" />
      <div style={{ flex: 1, fontSize: 13, color: 'var(--foreground)' }}>
        agent orchestration
        <span style={{ display: 'inline-block', width: 1, height: 13, marginLeft: 1,
                       background: 'var(--primary)', verticalAlign: '-2px',
                       animation: 'khBlink 1s steps(2) infinite' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Cancel</span>
    </div>
  );
}

function PageHeader({ title, leading, actions }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      height: 56, padding: '0 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--header-bg)', backdropFilter: 'blur(var(--blur-md))', WebkitBackdropFilter: 'blur(var(--blur-md))',
      borderBottom: '1px solid var(--border)',
    }}>
      {leading ?? (
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'var(--primary)', color: 'var(--primary-foreground)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, letterSpacing: -0.3,
        }}>KH</div>
      )}
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)', letterSpacing: -0.2 }}>{title}</div>
      <div style={{ flex: 1 }} />
      {actions}
    </header>
  );
}

function DetailHeader({ back = 'Back', actions }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      height: 56, padding: '0 8px 0 4px',
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'var(--header-bg)', backdropFilter: 'blur(var(--blur-md))', WebkitBackdropFilter: 'blur(var(--blur-md))',
      borderBottom: '1px solid var(--border)',
    }}>
      <IconButton icon={IconChevronLeft} label="Back" />
      <div style={{
        fontSize: 13, fontWeight: 500, color: 'var(--muted)', letterSpacing: -0.1,
      }}>{back}</div>
      <div style={{ flex: 1 }} />
      {actions}
      <IconButton icon={IconMoreHorizontal} label="More" />
    </header>
  );
}

function Header({ searchOpen, title = 'Library' }) {
  const { themeMode = 'dark', toggleTheme } = useCanvasTheme();
  const ThemeIcon = themeMode === 'dark' ? IconSun : IconMoon;
  return searchOpen ? (
    <PageHeader title="" leading={<SearchBar />} />
  ) : (
    <PageHeader
      title={title}
      actions={
        <>
          <IconButton icon={IconSearch} label="Search" />
          <IconButton icon={ThemeIcon} label="Toggle theme" onClick={toggleTheme} />
        </>
      }
    />
  );
}

function Button({ variant = 'ghost', size = 'md', icon: IconEl, iconRight: IconRight, fullWidth, style, children, ...rest }) {
  const sizes = {
    sm: { h: 28, px: 10, fs: 12, gap: 5 },
    md: { h: 32, px: 12, fs: 13, gap: 6 },
    lg: { h: 44, px: 16, fs: 14, gap: 8 },
  };
  const variants = {
    primary: { background: 'var(--primary)', color: 'var(--primary-foreground)', border: '1px solid transparent' },
    ghost: { background: 'transparent', color: 'var(--foreground)', border: '1px solid transparent' },
    outline: { background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' },
    danger: { background: 'var(--danger)', color: 'var(--primary-foreground)', border: '1px solid transparent' },
  };
  const s = sizes[size];
  return (
    <button {...rest} style={{
      height: s.h, padding: `0 ${s.px}px`,
      borderRadius: 'var(--radius-md)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
      fontFamily: 'inherit', fontSize: s.fs, fontWeight: 500,
      letterSpacing: 'var(--tracking-flat)', whiteSpace: 'nowrap', cursor: 'pointer',
      transition: 'background var(--duration-2) var(--ease-out)',
      width: fullWidth ? '100%' : undefined,
      ...variants[variant],
      ...style,
    }}>
      {IconEl && <IconEl size={s.fs} sw={1.6} strokeWidth={1.6} />}
      {children}
      {IconRight && <IconRight size={s.fs} sw={1.6} strokeWidth={1.6} />}
    </button>
  );
}

function IconButton({ icon: IconEl, size = 'md', label, style, ...rest }) {
  const dim = size === 'sm' ? 28 : size === 'lg' ? 44 : 36;
  const ic = size === 'sm' ? 14 : size === 'lg' ? 20 : 17;
  return (
    <button aria-label={label} {...rest} style={{
      width: dim, height: dim, border: 'none', background: 'transparent',
      borderRadius: 'var(--radius-md)', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--foreground)',
      ...style,
    }}><IconEl size={ic} sw={1.6} strokeWidth={1.6} /></button>
  );
}

// ─── Section header ────────────────────────────────────────
function SectionLabel({ label, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '0 16px', marginTop: 20, marginBottom: 8,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
        color: 'var(--muted)',
      }}>{label}</div>
      {count != null && (
        <div style={{ fontSize: 11, color: 'var(--muted-dim)', fontVariantNumeric: 'tabular-nums' }}>{count}</div>
      )}
    </div>
  );
}

// ─── Video card (list row) ────────────────────────────────
function VideoCard({ data }) {
  return (
    <article style={{
      margin: '0 16px 8px', padding: 12,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, display: 'flex', gap: 12,
    }}>
      <div style={{
        flexShrink: 0, width: 72, height: 72, borderRadius: 8,
        background: 'linear-gradient(135deg, var(--thumb), var(--thumb-accent))',
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 9px, var(--border) 9px 10px)',
          opacity: 0.7,
        }} />
        <div style={{
          width: 28, height: 28, borderRadius: 14, background: 'var(--scrim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--primary-foreground)', position: 'relative', backdropFilter: 'blur(4px)',
        }}>
          <IconPlay size={12} />
        </div>
        <div style={{
          position: 'absolute', right: 4, bottom: 4,
          padding: '1px 5px', borderRadius: 4,
          background: 'var(--scrim)', color: 'var(--primary-foreground)',
          fontSize: 9, fontWeight: 600, letterSpacing: 0.2,
          fontVariantNumeric: 'tabular-nums',
        }}>{data.duration}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: 'var(--foreground)',
          letterSpacing: -0.2,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{data.title}</div>
        <div style={{
          fontSize: 13, lineHeight: 1.4, color: 'var(--muted)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{data.summary}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {data.tags.map((tg) => <Pill key={tg}>#{tg}</Pill>)}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 2,
          fontSize: 11, color: 'var(--muted-dim)', fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{data.channel}</span>
          <span>·</span>
          <span>{data.date}</span>
          {data.ss && (<><span>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <IconImage size={11} stroke="var(--muted-dim)" sw={1.8} />{data.ss}
          </span></>)}
        </div>
      </div>
    </article>
  );
}

// ─── Source card (article/repo/link) ──────────────────────
function SourceCard({ data }) {
  const iconFor = { Article: IconLink, Repo: IconGit, Site: IconLink }[data.kind] || IconLink;
  const IconEl = iconFor;
  return (
    <article style={{
      margin: '0 16px 8px', padding: 12,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'var(--pill-bg)', color: 'var(--muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)',
        }}>
          <IconEl size={13} stroke="var(--muted)" />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, letterSpacing: 0.1 }}>
          {data.kind} · <span style={{ color: data.status === 'done' ? 'var(--success)' : data.status === 'processing' ? 'var(--info)' : 'var(--muted)' }}>{data.status}</span>
        </div>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: 'var(--foreground)',
        letterSpacing: -0.2, marginBottom: 6,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{data.title}</div>
      <div style={{
        fontSize: 13, lineHeight: 1.45, color: 'var(--muted)', marginBottom: 8,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{data.summary}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {data.tags.map((tg) => <Pill key={tg}>#{tg}</Pill>)}
      </div>
      <div style={{
        fontSize: 11, color: 'var(--muted-dim)', fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{data.url}</div>
    </article>
  );
}

// ─── Bottom nav (4 items, 64px, labelled) ─────────────────
function BottomNav({ items = BOTTOM_NAV_ITEMS, active, onSelect }) {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      height: 64, paddingBottom: 'env(safe-area-inset-bottom, 0)',
      borderTop: '1px solid var(--border)',
      background: 'var(--nav-bg)', backdropFilter: 'blur(var(--blur-lg))', WebkitBackdropFilter: 'blur(var(--blur-lg))',
      display: 'flex', zIndex: 30,
    }}>
      {items.map(({ id, label, icon: I }) => {
        const on = id === active;
        return (
          <button key={id} onClick={() => onSelect?.(id)} style={{
            flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, padding: 0,
            color: on ? 'var(--primary)' : 'var(--muted)',
          }}>
            <I size={20} stroke="currentColor" sw={on ? 2 : 1.6} />
            <span style={{ fontSize: 11, fontWeight: on ? 600 : 500, letterSpacing: 0.1, lineHeight: 1 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Sample data ──────────────────────────────────────────
const VIDEOS = [
  { title: 'Building agent orchestration with LangGraph from first principles',
    summary: 'A ground-up walkthrough of stateful graphs, checkpointing, and how to escape the ReAct-loop tarpit when tools start failing.',
    tags: ['agents', 'langgraph', 'tooling'], channel: 'Latent Space', date: 'Apr 14', duration: '42:08', ss: 18 },
  { title: 'The case against micro-RAG: when retrieval actually hurts',
    summary: 'Why naïve chunked vector search falls apart on long-form reasoning — and three patterns that replace it.',
    tags: ['rag', 'evals'], channel: 'Anthropic', date: 'Apr 10', duration: '28:41', ss: 9 },
  { title: 'Designing a knowledge hub for a team of one',
    summary: 'Solo-dev notes on keeping transcripts, sources, and skills from turning into a graveyard of half-read PDFs.',
    tags: ['knowledge', 'workflow'], channel: 'Notes from work', date: 'Apr 6', duration: '14:22', ss: 5 },
];

const SOURCES = [
  { kind: 'Article', title: 'Context engineering is the new prompt engineering',
    summary: 'A tour through why the "prompt" abstraction is dissolving into something closer to long-form context curation.',
    tags: ['context', 'prompting'], status: 'done', url: 'simonwillison.net/2026/apr/context' },
  { kind: 'Repo', title: 'stanford-crfm/levanter',
    summary: 'JAX-based training framework with a clean separation between model code, optimizer state, and checkpointing.',
    tags: ['training', 'jax'], status: 'processing', url: 'github.com/stanford-crfm/levanter' },
];

// ─── Full screen: Library ─────────────────────────────────
function ScreenLibrary({ searchOpen = false, active = 'home' }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--background)',
      color: 'var(--foreground)', fontFamily: 'var(--font-sans)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      fontFeatureSettings: 'var(--font-feature-settings)',
    }}>
      <Header searchOpen={searchOpen} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        <SectionLabel label="Videos" count="24 total" />
        {VIDEOS.map((v, i) => <VideoCard key={i} data={v} />)}
        <SectionLabel label="Other knowledge" count="12 sources" />
        {SOURCES.map((s, i) => <SourceCard key={i} data={s} />)}
        <SectionLabel label="Recent activity" />
        <div style={{
          margin: '0 16px', padding: 12,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: 'var(--primary-tint)',
            color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><IconClock size={15} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)', letterSpacing: -0.1 }}>
              Poll completed · 3 new videos
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-dim)', marginTop: 2 }}>
              kolejain · 4 min ago
            </div>
          </div>
        </div>
      </div>
      <BottomNav active={active} />
    </div>
  );
}

Object.assign(window, {
  ScreenLibrary, Header, PageHeader, DetailHeader, SearchBar, SectionLabel, VideoCard, SourceCard,
  BottomNav, Button, IconButton, Pill, VIDEOS, SOURCES,
  IconSearch, IconMoon, IconSun, IconHome, IconLibrary, IconOps, IconPlay,
});
