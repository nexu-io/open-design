// kh-history.jsx — Import History screen.
// Shows all items added via Quick Add with their processing status.

const IconH_Q = ({ d, size = 20, stroke = 'currentColor', fill = 'none', sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);
const IconBack = (p) => <IconH_Q {...p} d="M15 6l-6 6 6 6" sw={2} />;
const IconMore = (p) => <IconH_Q {...p} d={<><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/></>} stroke="none" />;
const IconRetry = (p) => <IconH_Q {...p} d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0 1 14-3M20 14a8 8 0 0 1-14 3" />;
const IconVidH = (p) => <IconH_Q {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></>} />;
const IconArtH = (p) => <IconH_Q {...p} d={<><path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h8M8 18h5"/></>} />;
const IconRepoH = (p) => <IconH_Q {...p} d={<><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M8.5 6H14a3 3 0 0 1 3 3v1"/></>} />;
const IconSiteH = (p) => <IconH_Q {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></>} />;

const KIND_ICON = { video: IconVidH, article: IconArtH, repo: IconRepoH, site: IconSiteH };
const KIND_LABEL = { video: 'Video', article: 'Article', repo: 'Repo', site: 'Site' };

// Status dot + label
function StatusTag({ status }) {
  const map = {
    ready:      { color: 'var(--success)', label: 'Ready' },
    processing: { color: "var(--primary)", label: 'Processing' },
    queued:     { color: "var(--muted)",    label: 'Queued' },
    failed:     { color: 'var(--danger)', label: 'Failed' },
  };
  const { color, label } = map[status];
  const pulse = status === 'processing';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 500, letterSpacing: -0.05,
      color: status === 'ready' ? "var(--muted)" : color,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 3, background: color,
        animation: pulse ? 'khPulse 1.4s ease-in-out infinite' : 'none',
      }} />
      {label}
    </span>
  );
}

// Sample history data — recent to old
const HISTORY = [
  { id: 1, kind: 'article', title: 'Context engineering for AI agents',
    domain: 'simonwillison.net', status: 'processing', when: 'Just now' },
  { id: 2, kind: 'video', title: 'Building reliable LLM systems at scale',
    domain: 'youtube.com', status: 'queued', when: '2 min ago' },
  { id: 3, kind: 'repo', title: 'anthropics/anthropic-cookbook',
    domain: 'github.com', status: 'ready', when: '8 min ago' },
  { id: 4, kind: 'article', title: 'Why retrieval is the bottleneck',
    domain: 'eugeneyan.com', status: 'ready', when: '34 min ago' },
  { id: 5, kind: 'site', title: 'Linear changelog',
    domain: 'linear.app', status: 'failed', when: '1 hr ago' },
  { id: 6, kind: 'video', title: 'The shape of AI-native products',
    domain: 'youtube.com', status: 'ready', when: '2 hr ago' },
  { id: 7, kind: 'article', title: 'Evals are all you need',
    domain: 'hamel.dev', status: 'ready', when: 'Yesterday' },
  { id: 8, kind: 'repo', title: 'vercel/ai',
    domain: 'github.com', status: 'ready', when: 'Yesterday' },
];

// Group by day bucket for section labels
const GROUPS = [
  { label: 'Today', items: HISTORY.slice(0, 6) },
  { label: 'Yesterday', items: HISTORY.slice(6) },
];

function HistoryRow({ item, showDivider = true }) {
  const Icon = KIND_ICON[item.kind];
  const failed = item.status === 'failed';

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: showDivider ? '1px solid var(--border)' : 'none',
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: failed ? 0.75 : 1,
    }}>
      {/* Kind glyph */}
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: 8,
        background: failed ? 'var(--primary-tint)' : "var(--pill-bg)",
        color: failed ? 'var(--danger)' : "var(--muted)",
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon size={16} stroke={failed ? 'var(--danger)' : "var(--muted)"} /></div>

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: "var(--foreground)", letterSpacing: -0.1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>{item.title}</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: "var(--muted)", letterSpacing: -0.05,
        }}>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 120,
          }}>{item.domain}</span>
          <span style={{ color: "var(--muted-dim)" }}>·</span>
          <StatusTag status={item.status} />
          <span style={{ color: "var(--muted-dim)" }}>·</span>
          <span>{item.when}</span>
        </div>
      </div>

      {/* Action: retry for failed, overflow menu otherwise */}
      {failed ? (
        <button style={{
          flexShrink: 0, height: 28, padding: '0 10px', borderRadius: 14,
          background: 'transparent', color: 'var(--danger)',
          border: '1px solid var(--danger)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 500, letterSpacing: -0.05,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <IconRetry size={12} stroke="var(--danger)" sw={1.8} /> Retry
        </button>
      ) : (
        <button style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: "var(--muted)",
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><IconMore size={16} stroke="var(--muted)" /></button>
      )}
    </div>
  );
}

// Mini header specific to History (has a back button + title)
function HistoryHeader() {
  return (
    <DetailHeader
      back="Import history"
      actions={<Button variant="ghost" size="md">Clear</Button>}
    />
  );
}

// Section label, mirrors the Library pattern
function HistorySection({ label }) {
  return (
    <div style={{
      padding: '20px 16px 8px',
      fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
      color: "var(--muted)",
    }}>{label}</div>
  );
}

// Counter summary bar at very top (subtle)
function HistorySummary() {
  const processing = HISTORY.filter(h => h.status === 'processing' || h.status === 'queued').length;
  const failed = HISTORY.filter(h => h.status === 'failed').length;

  return (
    <div style={{
      margin: '12px 16px 0', padding: '10px 12px', borderRadius: 10,
      background: "var(--card)", border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 16,
      fontSize: 12, color: "var(--foreground-dim)", letterSpacing: -0.05,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 6, height: 6, borderRadius: 3, background: "var(--primary)",
          animation: 'khPulse 1.4s ease-in-out infinite',
        }} />
        <strong style={{ fontWeight: 600, color: "var(--foreground)" }}>{processing}</strong> processing
      </span>
      {failed > 0 && (
        <>
          <span style={{ color: "var(--muted-dim)" }}>·</span>
          <span style={{ color: 'var(--danger)' }}>
            <strong style={{ fontWeight: 600 }}>{failed}</strong> failed
          </span>
        </>
      )}
      <span style={{ marginLeft: 'auto', color: "var(--muted-dim)" }}>
        {HISTORY.length} total
      </span>
    </div>
  );
}

function ScreenImportHistory() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: "var(--background)", color: "var(--foreground)",
      fontFamily: "var(--font-sans)",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`@keyframes khPulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
      <HistoryHeader />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <HistorySummary />
        {GROUPS.map((g, gi) => (
          <div key={g.label}>
            <HistorySection label={g.label} />
            <div style={{
              margin: '0 16px',
              background: "var(--card)", border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {g.items.map((item, i) => (
                <HistoryRow key={item.id} item={item}
                            showDivider={i < g.items.length - 1} />
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

Object.assign(window, { ScreenImportHistory, HistoryRow, StatusTag, HISTORY });
