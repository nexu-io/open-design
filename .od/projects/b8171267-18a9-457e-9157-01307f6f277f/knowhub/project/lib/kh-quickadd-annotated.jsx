// kh-quickadd-annotated.jsx — annotated Quick Add flow
// Assumes kh-screens.jsx + kh-quickadd.jsx loaded first.

// Reuse Callout pattern from existing annotated files
function QACallout({ x, y, w = 200, title, body, anchor }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w,
      fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5,
      color: '#3a3a40',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', color: '#5e6ad2', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ color: '#1a1a1e', letterSpacing: -0.05 }}>{body}</div>
      {anchor && (
        <svg style={{
          position: 'absolute', left: anchor.sx, top: anchor.sy,
          width: anchor.w, height: anchor.h, overflow: 'visible',
          pointerEvents: 'none',
        }}>
          <path d={anchor.d} fill="none" stroke="#5e6ad2" strokeWidth={1}
                strokeDasharray="3 3" />
          <circle cx={anchor.ex} cy={anchor.ey} r={2.5} fill="#5e6ad2" />
        </svg>
      )}
    </div>
  );
}

// Device frame consistent with other annotated screens
function QADevice({ children, x, y, w = 300, h = 600, label }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      <div style={{
        width: w, height: h, borderRadius: 28, overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.12)',
        boxShadow: '0 20px 40px -12px rgba(0,0,0,0.15), 0 4px 10px -2px rgba(0,0,0,0.08)',
        background: '#000',
      }}>
        {children}
      </div>
      {label && (
        <div style={{
          marginTop: 10, fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
          letterSpacing: 0.4, textTransform: 'uppercase', color: '#5e6ad2',
        }}>{label}</div>
      )}
    </div>
  );
}

function AnnotatedQuickAdd() {
  // Canvas layout: 3 devices in a row with callouts around them
  const deviceW = 280, deviceH = 560;
  const row1Y = 80;

  return (
    <div style={{
      width: 1500, height: 880, position: 'relative',
      background: '#fafafa', fontFamily: 'var(--font-sans)',
    }}>
      {/* Title */}
      <div style={{ position: 'absolute', top: 30, left: 40, right: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                      textTransform: 'uppercase', color: '#5e6ad2' }}>
          Flow · Quick add
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1e',
                      letterSpacing: -0.3, marginTop: 2 }}>
          Two taps from clipboard to library
        </div>
      </div>

      {/* ─ Step 1: Library + FAB ─────────────────────────── */}
      <QADevice x={60} y={row1Y} w={deviceW} h={deviceH} label="1 · Tap FAB">
        <div data-theme="dark" style={{ transform: 'scale(0.718)', transformOrigin: 'top left',
                      width: 390, height: 780 }}>
          <ScreenLibraryFab />
        </div>
      </QADevice>

      <QACallout
        x={60 + deviceW + 24} y={row1Y + 380} w={220}
        title="① Floating action button"
        body="Pinned above nav at 16px inset. Always reachable by thumb. Primary indigo signals the system's single most-used write action."
        anchor={{ sx: -30, sy: -240, w: 30, h: 260,
                  d: 'M 30 260 Q 10 250 5 140',
                  ex: 5, ey: 140 }}
      />

      {/* ─ Step 2: Paste sheet ────────────────────────────── */}
      <QADevice x={520} y={row1Y} w={deviceW} h={deviceH} label="2 · Confirm">
        <div data-theme="dark" style={{ transform: 'scale(0.718)', transformOrigin: 'top left',
                      width: 390, height: 780 }}>
          <ScreenLibrarySheet state="pasted" />
        </div>
      </QADevice>

      <QACallout
        x={520 - 200} y={row1Y + 180} w={180}
        title="Auto-paste"
        body="Sheet opens with clipboard URL already staged. If no URL: falls back to empty state with paste button + manual entry."
        anchor={{ sx: 180, sy: 10, w: 50, h: 40,
                  d: 'M 0 10 Q 30 5 50 20',
                  ex: 50, ey: 20 }}
      />

      <QACallout
        x={520 + deviceW + 24} y={row1Y + 230} w={220}
        title="② One-tap add"
        body="Kind is auto-detected from URL (YouTube → video, github.com → repo, etc.). User can override via chips. Topic auto-tagged from history."
        anchor={{ sx: -30, sy: -60, w: 30, h: 240,
                  d: 'M 30 80 Q 10 100 5 180',
                  ex: 5, ey: 180 }}
      />

      <QACallout
        x={520 + deviceW + 24} y={row1Y + 470} w={220}
        title="Commit"
        body="48px primary button · full width. Text confirms what happens next — queued, already visible in Library."
        anchor={{ sx: -30, sy: -20, w: 30, h: 40,
                  d: 'M 30 20 L 5 30',
                  ex: 5, ey: 30 }}
      />

      {/* ─ Step 3: Done flash ─────────────────────────────── */}
      <QADevice x={980} y={row1Y} w={deviceW} h={deviceH} label="3 · Continue or dismiss">
        <div data-theme="dark" style={{ transform: 'scale(0.718)', transformOrigin: 'top left',
                      width: 390, height: 780 }}>
          <ScreenLibrarySheet state="done" />
        </div>
      </QADevice>

      <QACallout
        x={980 + deviceW + 24} y={row1Y + 380} w={200}
        title="Two forward paths"
        body="View: jumps to Library where item is already visible (processing). Add another: keeps sheet open, clears fields — for pasting a batch."
        anchor={{ sx: -30, sy: -30, w: 30, h: 40,
                  d: 'M 30 30 L 5 40',
                  ex: 5, ey: 40 }}
      />

      {/* Tap-count badge at top */}
      <div style={{
        position: 'absolute', top: 88, left: 60 + deviceW + 24 + 240,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', borderRadius: 20,
        background: 'rgba(94,106,210,0.10)', color: '#5e6ad2',
        fontSize: 12, fontWeight: 600, letterSpacing: -0.1,
      }}>
        Tap 1 <span style={{ opacity: 0.5 }}>→</span> Tap 2 <span style={{ opacity: 0.5 }}>→</span> Done
      </div>

      {/* Bottom bar: alt path (empty state) */}
      <div style={{
        position: 'absolute', left: 40, right: 40, bottom: 30,
        padding: '14px 18px', borderRadius: 12,
        background: '#fff', border: '1px solid #e6e6e6',
        display: 'flex', alignItems: 'center', gap: 16,
        fontSize: 12, color: '#3a3a40', lineHeight: 1.5, letterSpacing: -0.05,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                      textTransform: 'uppercase', color: '#5e6ad2' }}>
          Edge case
        </div>
        <div>
          <strong style={{ color: '#1a1a1e' }}>No clipboard URL:</strong> sheet opens with a dashed
          paste target and a "Type a URL instead" escape. Still two taps — FAB, then paste button.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AnnotatedQuickAdd, QADevice, QACallout });
