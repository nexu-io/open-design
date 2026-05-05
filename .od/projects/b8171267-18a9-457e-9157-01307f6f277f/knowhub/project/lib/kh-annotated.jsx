// kh-annotated.jsx — annotated version of the library screen with callouts

function AnnoLine({ from, to, stroke = '#c96442' }) {
  // draw a line between two absolute coords in the parent SVG
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth="1" strokeDasharray="3 3" />;
}

function Callout({ top, left, right, title, body, color = '#c96442' }) {
  return (
    <div style={{
      position: 'absolute', top, left, right, width: 200,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color, marginBottom: 4,
      }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(40,30,20,0.78)' }}>{body}</div>
    </div>
  );
}

// A single artboard: iOS frame with the Library screen + callouts around it
function AnnotatedLibrary({ mode = 'dark' }) {
  const deviceW = 390;
  const deviceH = 760;
  const totalW = 900;
  const totalH = 900;
  const devLeft = (totalW - deviceW) / 2;
  const devTop = 60;

  const dot = (x, y) => (
    <div style={{
      position: 'absolute', left: x - 4, top: y - 4,
      width: 8, height: 8, borderRadius: 4,
      background: '#c96442', boxShadow: '0 0 0 3px rgba(201,100,66,0.18)',
    }} />
  );

  return (
    <div style={{
      width: totalW, height: totalH, position: 'relative',
      background: '#f0eee9',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>
      {/* connector lines behind everything */}
      <svg width={totalW} height={totalH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* Header → left callout */}
        <path d={`M 260 98 L ${devLeft + 12} 98`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        {/* Section label → left */}
        <path d={`M 260 200 L ${devLeft + 20} 200`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        {/* Section spacing → left */}
        <path d={`M 260 340 L ${devLeft + 12} 340`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        {/* Card → right */}
        <path d={`M ${devLeft + deviceW - 16} 250 L 720 250`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        {/* Tags → right */}
        <path d={`M ${devLeft + deviceW - 100} 310 L 720 420`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        {/* Bottom nav → right */}
        <path d={`M ${devLeft + deviceW - 16} 770 L 720 770`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        {/* Gutter → left bottom */}
        <path d={`M 260 560 L ${devLeft + 8} 560`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
      </svg>

      {/* LEFT callouts */}
      <Callout top={72} left={50} title="01 · Header, 56px fixed" body="Single row: KH mark + title left, search + theme-toggle right. Search icon expands inline into a full-width input — never wraps to a second row." />
      <Callout top={178} left={50} title="02 · Section label" body="12px uppercase, 0.8px tracking, muted. 20px top margin, 8px below. Small count on the right, tabular numerals." />
      <Callout top={316} left={50} title="03 · Section rhythm" body="24–28px between sections visually — labels carry the weight, not divider lines or heavy card chrome." />
      <Callout top={540} left={50} title="04 · 16px gutter, always" body="Cards float inside a consistent 16px horizontal margin. Never collapses to 12px at 480px — the breathing room is the design." />

      {/* RIGHT callouts */}
      <Callout top={220} right={50} title="05 · Card as list row" body="Full-width row, 12px internal padding. 72×72 thumb left, text right. Title 15px/600, 2-line summary 13px/muted, tag pills, then channel · date footer." />
      <Callout top={402} right={50} title="06 · Pills, subtle" body="22px tall, 11px label, 1px border. Background is 4% white tint — informational, never demanding attention." />
      <Callout top={748} right={50} title="07 · 4-item labelled nav" body="Home · Search · Library · Ops. 64px tall, icon + 11px label. Active = indigo fill on both. Subtle top border, background blur for depth." />

      {/* dots */}
      {dot(devLeft + 12, 98)}
      {dot(devLeft + 20, 200)}
      {dot(devLeft + 12, 340)}
      {dot(devLeft + 8, 560)}
      {dot(devLeft + deviceW - 16, 250)}
      {dot(devLeft + deviceW - 100, 310)}
      {dot(devLeft + deviceW - 16, 770)}

      {/* Device */}
      <div style={{ position: 'absolute', left: devLeft, top: devTop, width: deviceW, height: deviceH,
                    borderRadius: 42, overflow: 'hidden',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)',
                    background: '#000' }}>
        {/* status bar — minimal */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 40,
          display: 'flex', alignItems: 'center', padding: '0 28px',
          color: mode === 'dark' ? '#fff' : '#000',
          fontSize: 14, fontWeight: 600, letterSpacing: -0.2,
        }}>
          <div>9:41</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, opacity: 0.9 }}>● ● ●</div>
        </div>
        {/* notch */}
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          width: 118, height: 34, borderRadius: 22, background: '#000', zIndex: 50,
        }} />
        {/* content, offset for status bar */}
        <div data-theme={mode} style={{ paddingTop: 44, height: '100%', boxSizing: 'border-box' }}>
          <ScreenLibrary active="home" />
        </div>
        {/* home indicator */}
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 128, height: 4, borderRadius: 3,
          background: mode === 'dark' ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.28)',
          zIndex: 60,
        }} />
      </div>

      {/* caption below */}
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center',
        fontSize: 12, color: 'rgba(40,30,20,0.5)', letterSpacing: 0.2,
      }}>
        Library · mobile (≤ 640px) · {mode === 'dark' ? 'dark mode' : 'light mode'}
      </div>
    </div>
  );
}

// Plain device (no annotations) — for the other artboards
function PlainDevice({ mode = 'dark', searchOpen = false, active = 'home', width = 390, height = 760 }) {
  return (
    <div style={{
      width, height, borderRadius: 42, overflow: 'hidden', position: 'relative',
      boxShadow: '0 30px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)',
      background: '#000',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 40,
        display: 'flex', alignItems: 'center', padding: '0 28px',
        color: mode === 'dark' ? '#fff' : '#000',
        fontSize: 14, fontWeight: 600, letterSpacing: -0.2,
      }}>
        <div>9:41</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, opacity: 0.9 }}>● ● ●</div>
      </div>
      <div style={{
        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
        width: 118, height: 34, borderRadius: 22, background: '#000', zIndex: 50,
      }} />
      <div data-theme={mode} style={{ paddingTop: 44, height: '100%', boxSizing: 'border-box' }}>
        <ScreenLibrary active={active} searchOpen={searchOpen} />
      </div>
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 128, height: 4, borderRadius: 3,
        background: mode === 'dark' ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.28)',
        zIndex: 60,
      }} />
    </div>
  );
}

Object.assign(window, { AnnotatedLibrary, PlainDevice, Callout });
