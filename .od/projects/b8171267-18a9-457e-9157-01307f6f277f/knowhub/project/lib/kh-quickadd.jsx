// kh-quickadd.jsx — two-tap link capture flow.

const IconQ = ({ d, size = 20, stroke = 'currentColor', fill = 'none', sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);
const IconPlus = (p) => <IconQ {...p} d="M12 5v14M5 12h14" sw={2} />;
const IconClipboard = (p) => <IconQ {...p} d={<><rect x="7" y="4" width="10" height="16" rx="2"/><path d="M9 3h6v3H9z"/></>} />;
const IconClose = (p) => <IconQ {...p} d="M6 6l12 12M18 6L6 18" />;
const IconCheck = (p) => <IconQ {...p} d="M5 12.5l4.5 4.5L19 7" sw={2.2} />;
const IconLink = (p) => <IconQ {...p} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L12.5 17" />;
const IconRepo = (p) => <IconQ {...p} d={<><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M8.5 6H14a3 3 0 0 1 3 3v1"/></>} />;
const IconVid = (p) => <IconQ {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></>} />;
const IconArt = (p) => <IconQ {...p} d={<><path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h8M8 18h5"/></>} />;

// Floating action button — sits above the bottom nav, pulls up slightly
function FAB({ onClick, pressed = false }) {
  return (
    <button onClick={onClick} style={{
      position: 'absolute', right: 16, bottom: 80, zIndex: 40,
      width: 52, height: 52, borderRadius: 26,
      background: "var(--primary)", border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--primary-foreground)',
      boxShadow: pressed
        ? 'var(--shadow-fab-pressed)'
        : 'var(--shadow-fab)',
      transition: 'box-shadow .14s ease',
    }}>
      <IconPlus size={22} stroke="var(--primary-foreground)" sw={2.2} />
    </button>
  );
}

// The paste sheet (state = 'empty' | 'pasted' | 'done')
function PasteSheet({ state = 'pasted' }) {
  const url = 'https://simonwillison.net/2026/apr/context-engineering';
  const domain = 'simonwillison.net';

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      display: 'flex', flexDirection: 'column',
      background: 'var(--scrim)', backdropFilter: 'blur(2px)',
    }}>
      {/* scrim click target */}
      <div style={{ flex: 1 }} />

      {/* sheet */}
      <div style={{
        background: "var(--background-elev)",
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        {/* grab handle */}
        <div style={{ padding: '8px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: "var(--border-strong)",
          }} />
        </div>

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '4px 8px 4px 16px', height: 44,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", letterSpacing: -0.2 }}>
            Quick add
          </div>
          <div style={{ flex: 1 }} />
          <button style={{
            width: 32, height: 32, border: 'none', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: "var(--muted)", borderRadius: 8, cursor: 'pointer',
          }}><IconClose size={18} stroke="var(--muted)" /></button>
        </div>

        {state === 'empty' && <EmptyState />}
        {state === 'pasted' && <PastedState url={url} domain={domain} />}
        {state === 'done' && <DoneState domain={domain} />}
      </div>
    </div>
  );
}

// Empty — no clipboard URL; show paste target + manual hint
function EmptyState() {
  return (
    <div style={{ padding: '12px 16px 20px' }}>
      <div style={{
        padding: 20, borderRadius: 12,
        border: '1px dashed var(--border-strong)', background: "var(--card)",
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 20, background: "var(--pill-bg)",
          color: "var(--muted)",
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><IconClipboard size={18} stroke="var(--muted)" /></div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)", letterSpacing: -0.1 }}>
          Paste a link from your clipboard
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: 'center', lineHeight: 1.5 }}>
          YouTube, articles, repos, sites.<br/>We'll figure out the rest.
        </div>
      </div>
      <button style={{
        marginTop: 12, width: '100%', height: 44, borderRadius: 10,
        background: "var(--primary)", color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 14, fontWeight: 600, letterSpacing: -0.1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <IconClipboard size={15} stroke="var(--primary-foreground)" /> Paste from clipboard
      </button>
      <button style={{
        marginTop: 8, width: '100%', height: 40, borderRadius: 10,
        background: 'transparent', color: "var(--foreground-dim)", border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
      }}>Type a URL instead</button>
    </div>
  );
}

// Pasted — URL detected; preview + kind detection + one-tap Add
function PastedState({ url, domain }) {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      {/* URL preview card — auto-detected */}
      <div style={{
        padding: 12, borderRadius: 12, background: "var(--card)", border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 8,
          background: "var(--primary-tint)", color: "var(--primary)",
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><IconArt size={18} stroke="var(--primary)" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, letterSpacing: 0.1 }}>
            Detected · Article
          </div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: "var(--foreground)", letterSpacing: -0.1, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{domain}</div>
        </div>
        <button style={{
          width: 28, height: 28, border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: "var(--muted)", borderRadius: 6, cursor: 'pointer',
        }}><IconClose size={14} stroke="var(--muted)" /></button>
      </div>

      {/* Topic (optional) */}
      <div style={{ marginTop: 14 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
          color: "var(--muted)", marginBottom: 6,
        }}>Topic</div>
        <div style={{
          height: 40, padding: '0 12px', borderRadius: 10,
          background: "var(--pill-bg)", border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          fontSize: 13, color: "var(--muted-dim)", letterSpacing: -0.1,
        }}>
          # context <span style={{ marginLeft: 'auto', color: "var(--muted-dim)", fontSize: 11 }}>Auto-tag</span>
        </div>
      </div>

      {/* CTAs */}
      <button style={{
        marginTop: 16, width: '100%', height: 48, borderRadius: 12,
        background: "var(--primary)", color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 15, fontWeight: 600, letterSpacing: -0.1,
      }}>Add to library</button>
      <div style={{
        marginTop: 10, fontSize: 11, color: "var(--muted-dim)", textAlign: 'center',
      }}>
        Will queue for processing · you'll see it in Library instantly
      </div>
    </div>
  );
}

// Done — success flash
function DoneState({ domain }) {
  return (
    <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 28,
        background: "var(--primary-tint)", color: "var(--primary)",
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
      }}><IconCheck size={24} stroke="var(--primary)" /></div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", letterSpacing: -0.2 }}>
        Queued for processing
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, letterSpacing: -0.1 }}>
        {domain}
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 8, width: '100%' }}>
        <button style={{
          flex: 1, height: 44, borderRadius: 10,
          background: 'transparent', color: "var(--foreground)", border: '1px solid var(--border)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
        }}>View in Library</button>
        <button style={{
          flex: 1, height: 44, borderRadius: 10,
          background: "var(--primary)", color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
        }}>Add another</button>
      </div>
    </div>
  );
}

// Screen wrappers — Library-with-FAB, and Library-with-sheet-open (dimmed bg)
function ScreenLibraryFab() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ScreenLibrary active="home" />
      <FAB />
    </div>
  );
}

function ScreenLibrarySheet({ state = 'pasted' }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ScreenLibrary active="home" />
      <PasteSheet state={state} />
    </div>
  );
}

Object.assign(window, {
  FAB, PasteSheet, ScreenLibraryFab, ScreenLibrarySheet,
});
