// kh-detail-annotated.jsx — annotated versions of detail screens

function AnnotatedDetail({ mode = 'dark', kind = 'video' }) {
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

  const Screen = kind === 'video' ? ScreenVideoDetail : ScreenSourceDetail;
  const isVid = kind === 'video';

  return (
    <div style={{
      width: totalW, height: totalH, position: 'relative', background: '#f0eee9',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>
      <svg width={totalW} height={totalH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <path d={`M 260 98 L ${devLeft + 10} 98`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={`M 260 ${isVid ? 230 : 180} L ${devLeft + deviceW - 100} ${isVid ? 230 : 180}`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={`M 260 ${isVid ? 380 : 340} L ${devLeft + 20} ${isVid ? 380 : 340}`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={`M ${devLeft + deviceW - 16} ${isVid ? 300 : 300} L 720 ${isVid ? 300 : 300}`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={`M ${devLeft + deviceW - 16} ${isVid ? 500 : 560} L 720 ${isVid ? 500 : 560}`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={`M 260 560 L ${devLeft + 20} 560`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={`M ${devLeft + deviceW - 16} 770 L 720 770`} stroke="#c96442" strokeWidth="1" strokeDasharray="3 3" fill="none" />
      </svg>

      {isVid ? (
        <>
          <Callout top={72} left={50} title="01 · Context header" body="Back arrow + breadcrumb label + overflow. No duplicated title — that's in the hero below. 56px fixed, blurred." />
          <Callout top={208} left={50} title="02 · Hero thumb" body="16:9 with center play button and a duration chip. Taps through to YouTube. The only non-text affordance above the fold." />
          <Callout top={360} left={50} title="03 · Section labels" body="Same uppercase 11px label as the Library feed — vertical rhythm is consistent with the list view." />
          <Callout top={540} left={50} title="04 · Skim-first order" body="Summary → takeaways → things → quote → tools → topics → transcript. The cheapest-to-read items come first." />

          <Callout top={270} right={50} title="05 · Title + meta" body="20px/650 title, 2-line max by content. Meta line below: channel · posted · processed, separated by mid-dots. Tabular numerals." />
          <Callout top={470} right={50} title="06 · Action bar" body="Primary (Create skill, indigo fill) + secondary (YouTube, outline). 32px pills. Scrolls with the page — always reachable, never sticky-chrome." />
          <Callout top={750} right={50} title="07 · Bottom nav, always" body="Same 4-item nav everywhere in the app. Home stays active on detail pages — context is clear from the back breadcrumb, not the tab." />
        </>
      ) : (
        <>
          <Callout top={72} left={50} title="01 · Context header" body="Same back + breadcrumb + overflow pattern as video detail. Reusing the pattern keeps the product coherent across source types." />
          <Callout top={148} left={50} title="02 · Kind + status strip" body="Icon chip + 'Article · done' line. Replaces the heavy badge-in-hero from desktop — here it's a single muted line." />
          <Callout top={316} left={50} title="03 · Compact KV block" body="Type, status, created, processed in a 2-column grid inside one card. Desktop used a long inline kv-row — this packs the same info into ~72px." />
          <Callout top={540} left={50} title="04 · Analysis as prose" body="Rendered markdown flows at 14px/1.65 with inline h3 at 13/600. Full reading measure inside 16px gutter — no nested card chrome." />

          <Callout top={270} right={50} title="05 · Title + host" body="20/650 title with a single muted host line below. No subtitle wrapping; host truncates with an ellipsis." />
          <Callout top={530} right={50} title="06 · Notes card" body="Personal notes get their own tinted card so they're visually distinct from extracted analysis above — a cheap way to signal authorship." />
          <Callout top={750} right={50} title="07 · Bottom nav" body="Shared across all detail pages. No action rail, no sidebar — the phone has one column." />
        </>
      )}

      {dot(devLeft + 10, 98)}
      {dot(devLeft + deviceW - 100, isVid ? 230 : 180)}
      {dot(devLeft + 20, isVid ? 380 : 340)}
      {dot(devLeft + deviceW - 16, 300)}
      {dot(devLeft + deviceW - 16, isVid ? 500 : 560)}
      {dot(devLeft + 20, 560)}
      {dot(devLeft + deviceW - 16, 770)}

      <div style={{ position: 'absolute', left: devLeft, top: devTop, width: deviceW, height: deviceH,
                    borderRadius: 42, overflow: 'hidden',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)',
                    background: '#000' }}>
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
          <Screen />
        </div>
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 128, height: 4, borderRadius: 3,
          background: mode === 'dark' ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.28)',
          zIndex: 60,
        }} />
      </div>

      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center',
        fontSize: 12, color: 'rgba(40,30,20,0.5)', letterSpacing: 0.2,
      }}>
        {isVid ? 'Video' : 'Source'} detail · mobile · {mode}
      </div>
    </div>
  );
}

function PlainDetailDevice({ mode = 'dark', kind = 'video', width = 390, height = 760 }) {
  const Screen = kind === 'video' ? ScreenVideoDetail : ScreenSourceDetail;
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
        <Screen />
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

Object.assign(window, { AnnotatedDetail, PlainDetailDevice });
