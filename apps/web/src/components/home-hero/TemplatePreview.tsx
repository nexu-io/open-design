// Beautiful, data-driven thumbnails for the Home "Template examples" rail.
//
// A preset's `preview` spec is a (layout skeleton x palette) pair. This file
// owns both halves:
//   - PALETTES maps a palette id to CSS custom properties (surface, ink,
//     accent, grid, ...). Colors live here, not in CSS, so the matrix of
//     layout x palette stays trivially extensible.
//   - SocialPreview / DiagramPreview interpret a layout into a crisp HTML or
//     SVG mini-mockup. Social cards are HTML/flex (sharp text + depth);
//     diagrams are SVG with the fireworks shape grammar (hexagon = agent,
//     double-border = LLM, cylinder = store, diamond = decision).
//
// Styling hooks live under `.tpl-preview` in styles/home/home-hero.css.

import type { CSSProperties } from 'react';
import type {
  DiagramPalette,
  DiagramPreviewLayout,
  LocalTemplatePreset,
  PreviewSpec,
  SocialPalette,
  SocialPreviewLayout,
} from './local-template-presets';

type Vars = Record<string, string>;

// --- Social palettes: light editorial / swiss / platform tints. One premium
// midnight-ink theme (the gold-on-dark quote cover) is the single dark social
// surface, mirroring guizang's "Midnight Ink" editorial theme.
const SOCIAL_PALETTES: Record<SocialPalette, Vars> = {
  x: { '--p-bg': '#f4f6f8', '--p-surface': '#ffffff', '--p-surface2': '#eef2f5', '--p-ink': '#0f1419', '--p-sub': '#5a6b78', '--p-accent': '#1d9bf0', '--p-accent-soft': '#dcefff', '--p-line': '#e7ecef' },
  ink: { '--p-bg': '#efece6', '--p-surface': '#f7f5f0', '--p-surface2': '#e7e2d8', '--p-ink': '#17130d', '--p-sub': '#6f6657', '--p-accent': '#b8472e', '--p-accent-soft': '#f0ddd4', '--p-line': '#e3ddd1' },
  kraft: { '--p-bg': '#e7ddc9', '--p-surface': '#f0e8d8', '--p-surface2': '#ddd0b5', '--p-ink': '#2c2417', '--p-sub': '#796d56', '--p-accent': '#9a6b3f', '--p-accent-soft': '#ecdcc3', '--p-line': '#dccdb1' },
  dune: { '--p-bg': '#ece4d8', '--p-surface': '#f5efe4', '--p-surface2': '#e3d8c5', '--p-ink': '#2a2316', '--p-sub': '#7c715b', '--p-accent': '#c08a3e', '--p-accent-soft': '#f0e2c8', '--p-line': '#e1d6c1' },
  linkedin: { '--p-bg': '#eef3f8', '--p-surface': '#ffffff', '--p-surface2': '#e9f0f7', '--p-ink': '#1b1f23', '--p-sub': '#56687a', '--p-accent': '#0a66c2', '--p-accent-soft': '#dbeaf9', '--p-line': '#e3ebf2' },
  klein: { '--p-bg': '#edeffa', '--p-surface': '#ffffff', '--p-surface2': '#e6e9f7', '--p-ink': '#0b1020', '--p-sub': '#5b6483', '--p-accent': '#002fa7', '--p-accent-soft': '#d9def4', '--p-line': '#e1e5f4' },
  instagram: { '--p-bg': '#fdf0ec', '--p-surface': '#ffffff', '--p-surface2': '#fbe6ee', '--p-ink': '#1f1320', '--p-sub': '#7a5d72', '--p-accent': '#e1306c', '--p-accent2': '#f77737', '--p-accent-soft': '#fbdbe8', '--p-line': '#f4dce6' },
  safety: { '--p-bg': '#fdeee6', '--p-surface': '#ffffff', '--p-surface2': '#fbe3d6', '--p-ink': '#1c150f', '--p-sub': '#7a6657', '--p-accent': '#ff6b35', '--p-accent2': '#ff9e2c', '--p-accent-soft': '#ffe0d1', '--p-line': '#f4ddcf' },
  rednote: { '--p-bg': '#fdebec', '--p-surface': '#ffffff', '--p-surface2': '#fbdee1', '--p-ink': '#20141a', '--p-sub': '#7c5b65', '--p-accent': '#ff2442', '--p-accent-soft': '#ffd9de', '--p-line': '#f6d6da' },
  forest: { '--p-bg': '#e6ede6', '--p-surface': '#f4f7f2', '--p-surface2': '#dbe6dc', '--p-ink': '#15201a', '--p-sub': '#5e6f64', '--p-accent': '#2f6f4f', '--p-accent-soft': '#d7e7dc', '--p-line': '#d8e4db' },
  wechat: { '--p-bg': '#e8f3ea', '--p-surface': '#ffffff', '--p-surface2': '#ddefe1', '--p-ink': '#122017', '--p-sub': '#5a6f60', '--p-accent': '#07c160', '--p-accent-soft': '#d4f0de', '--p-line': '#d6ebdc' },
  indigo: { '--p-bg': '#e9ebf3', '--p-surface': '#f5f6fb', '--p-surface2': '#dfe2ef', '--p-ink': '#161a2b', '--p-sub': '#5f6680', '--p-accent': '#3b4a8c', '--p-accent-soft': '#dde1f0', '--p-line': '#dde0ee' },
  midnight: { '--p-bg': '#15141b', '--p-surface': '#1d1b25', '--p-surface2': '#262430', '--p-ink': '#f3ecdd', '--p-sub': '#b6a98c', '--p-accent': '#d4a04a', '--p-accent-soft': '#3a3322', '--p-line': '#2e2b39' },
  reddit: { '--p-bg': '#fdeee6', '--p-surface': '#ffffff', '--p-surface2': '#fbe4d6', '--p-ink': '#1a1a1b', '--p-sub': '#787c7e', '--p-accent': '#ff4500', '--p-accent-soft': '#ffe1d2', '--p-line': '#f3ddcf' },
  youtube: { '--p-bg': '#f6eded', '--p-surface': '#ffffff', '--p-surface2': '#f4e3e3', '--p-ink': '#0f0f0f', '--p-sub': '#606060', '--p-accent': '#ff0000', '--p-accent-soft': '#ffdada', '--p-line': '#efdcdc' },
  facebook: { '--p-bg': '#eef2f9', '--p-surface': '#ffffff', '--p-surface2': '#e7eefb', '--p-ink': '#1c1e21', '--p-sub': '#606770', '--p-accent': '#1877f2', '--p-accent-soft': '#dbe7fb', '--p-line': '#e2e8f3' },
  producthunt: { '--p-bg': '#fdeee9', '--p-surface': '#ffffff', '--p-surface2': '#fbe2d9', '--p-ink': '#21130d', '--p-sub': '#7c685e', '--p-accent': '#da552f', '--p-accent-soft': '#fbdacd', '--p-line': '#f3ddd2' },
  spotify: { '--p-bg': '#0c130e', '--p-surface': '#16201a', '--p-surface2': '#1f2c24', '--p-ink': '#eafff1', '--p-sub': '#9ab8a6', '--p-accent': '#1db954', '--p-accent-soft': '#143222', '--p-line': '#26352c' },
};

// --- Diagram palettes: four light fireworks styles + the two canonical dark
// showcases (blueprint, terminal). Adds grid/node/stroke for SVG.
const DIAGRAM_PALETTES: Record<DiagramPalette, Vars> = {
  flat: { '--p-bg': '#f7f4ee', '--p-surface': '#ffffff', '--p-node': '#ffffff', '--p-stroke': '#34302a', '--p-ink': '#1b1815', '--p-sub': '#8a8073', '--p-accent': '#e8623d', '--p-accent2': '#2a6df4', '--p-grid': 'rgba(52,48,42,0.10)', '--p-soft': '#f4ece4' },
  notion: { '--p-bg': '#ffffff', '--p-surface': '#ffffff', '--p-node': '#fbfbfa', '--p-stroke': '#37352f', '--p-ink': '#37352f', '--p-sub': '#9b9890', '--p-accent': '#2f7de1', '--p-accent2': '#d9730d', '--p-grid': 'rgba(55,53,47,0.07)', '--p-soft': '#f1f0ee' },
  claude: { '--p-bg': '#f4f0e8', '--p-surface': '#faf7f0', '--p-node': '#fffdf8', '--p-stroke': '#463f33', '--p-ink': '#2b2419', '--p-sub': '#8a7d68', '--p-accent': '#cc785c', '--p-accent2': '#6a9a8a', '--p-grid': 'rgba(70,63,51,0.09)', '--p-soft': '#efe7d7' },
  openai: { '--p-bg': '#ffffff', '--p-surface': '#ffffff', '--p-node': '#ffffff', '--p-stroke': '#202123', '--p-ink': '#202123', '--p-sub': '#9a9ba1', '--p-accent': '#10a37f', '--p-accent2': '#5436da', '--p-grid': 'rgba(32,33,35,0.06)', '--p-soft': '#f2f2f3' },
  blueprint: { '--p-bg': '#0a1628', '--p-surface': '#0e1d36', '--p-node': '#11294a', '--p-stroke': '#5aa6e6', '--p-ink': '#d4e8ff', '--p-sub': '#6f9fcf', '--p-accent': '#38c6ff', '--p-accent2': '#9be0ff', '--p-grid': 'rgba(120,180,255,0.16)', '--p-soft': '#123257' },
  terminal: { '--p-bg': '#0c0e13', '--p-surface': '#12151c', '--p-node': '#171b24', '--p-stroke': '#56d99a', '--p-ink': '#d8ffe9', '--p-sub': '#6f9f86', '--p-accent': '#43e08f', '--p-accent2': '#ff7a59', '--p-grid': 'rgba(120,255,190,0.10)', '--p-soft': '#16261d' },
};

export function TemplatePreview({ preset }: { preset: LocalTemplatePreset }) {
  const spec = preset.preview;
  const vars = (spec.kind === 'social' ? SOCIAL_PALETTES[spec.palette] : DIAGRAM_PALETTES[spec.palette]) as Vars;
  return (
    <span
      className={`tpl-preview tpl-preview--${spec.kind}`}
      data-layout={spec.layout}
      data-palette={spec.palette}
      style={vars as CSSProperties}
    >
      {spec.kind === 'social' ? (
        <SocialPreview layout={spec.layout} />
      ) : (
        <DiagramPreview layout={spec.layout} uid={preset.id} dark={spec.palette === 'blueprint' || spec.palette === 'terminal'} />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Social layouts (HTML)
//
// Thumbnails render *real* micro-copy, not anonymous gray bars: a finished
// card the user can recognize and want. Copy is intentionally evergreen and
// product-flavored so it reads as a polished example regardless of palette.
// ---------------------------------------------------------------------------

function SocialPreview({ layout }: { layout: SocialPreviewLayout }) {
  switch (layout) {
    case 'post':
      return (
        <span className="tpl-card tpl-post">
          <span className="tpl-post__head">
            <span className="tpl-avatar">A</span>
            <span className="tpl-post__id">
              <strong className="tpl-post__name">Acme Labs</strong>
              <span className="tpl-post__handle">@acmelabs · 2h</span>
            </span>
            <span className="tpl-post__verified" />
          </span>
          <span className="tpl-post__body">
            <span className="tpl-post__text">We shipped onboarding v2 — and activation just did this:</span>
            <span className="tpl-post__metric">+248%</span>
            <span className="tpl-post__sub">week-1 activation, 30-day rolling</span>
          </span>
          <span className="tpl-post__foot">
            <span className="tpl-post__react"><i className="tpl-ico-reply" />84</span>
            <span className="tpl-post__react"><i className="tpl-ico-rt" />312</span>
            <span className="tpl-post__react"><i className="tpl-ico-like" />2.1K</span>
          </span>
        </span>
      );
    case 'metric':
      return (
        <span className="tpl-card tpl-metric">
          <span className="tpl-eyebrow">Q3 GROWTH</span>
          <strong className="tpl-bignum">48%</strong>
          <span className="tpl-metric__cap">faster time-to-value vs. last quarter</span>
          <span className="tpl-spark">
            <i /><i /><i /><i /><i /><i />
          </span>
        </span>
      );
    case 'chart':
      return (
        <span className="tpl-card tpl-chart">
          <span className="tpl-chart__head">
            <strong className="tpl-chart__title">Revenue, last 5 weeks</strong>
            <span className="tpl-chart__delta">▲ 31%</span>
          </span>
          <span className="tpl-bars">
            <span style={{ height: '38%' }}><b>W1</b></span>
            <span style={{ height: '58%' }}><b>W2</b></span>
            <span style={{ height: '46%' }}><b>W3</b></span>
            <span className="is-accent" style={{ height: '92%' }}><b>W4</b></span>
            <span style={{ height: '70%' }}><b>W5</b></span>
          </span>
        </span>
      );
    case 'thread-strip': {
      const beats = ['The hook that stopped the scroll', 'Proof: 3 numbers that matter', 'How we actually did it', 'Your turn — steal this'];
      return (
        <span className="tpl-strip">
          <span className="tpl-strip__rail" />
          {beats.map((beat, i) => (
            <span key={beat} className={`tpl-strip__card${i === 0 ? ' is-lead' : ''}`}>
              <span className="tpl-strip__num">{i + 1}</span>
              <span className="tpl-strip__head">{beat}</span>
            </span>
          ))}
        </span>
      );
    }
    case 'editorial-carousel': {
      const titles = ['The Slow Studio', 'Made by Hand', 'Less, Better'];
      const kickers = ['ISSUE 04', 'CRAFT', 'ESSAY'];
      return (
        <span className="tpl-carousel tpl-carousel--editorial">
          {titles.map((title, i) => (
            <span key={title} className="tpl-mag">
              <span className="tpl-mag__img" />
              <span className="tpl-mag__kicker">{kickers[i]}</span>
              <span className="tpl-serif">{title}</span>
              <span className="tpl-rule" />
              <span className="tpl-mag__by">Words by Studio Editorial</span>
            </span>
          ))}
          <span className="tpl-dots"><i className="is-on" /><i /><i /></span>
        </span>
      );
    }
    case 'swiss-carousel': {
      const cards = [
        { tag: 'KPI', head: 'NPS climbed to 72' },
        { tag: 'S09', head: 'Setup in 9 minutes' },
        { tag: 'MX', head: 'Wins on every axis' },
      ];
      return (
        <span className="tpl-carousel tpl-carousel--swiss">
          {cards.map((card) => (
            <span key={card.tag} className="tpl-swiss">
              <span className="tpl-swiss__anchor" />
              <strong className="tpl-swiss__tag">{card.tag}</strong>
              <span className="tpl-swiss__head">{card.head}</span>
            </span>
          ))}
        </span>
      );
    }
    case 'cover':
      return (
        <span className="tpl-cover">
          <span className="tpl-cover__img" />
          <span className="tpl-cover__page">1/6</span>
          <span className="tpl-cover__band">
            <span className="tpl-cover__kicker">FIELD NOTES</span>
            <strong className="tpl-cover__title">5 habits that <em>actually</em> stuck</strong>
            <span className="tpl-cover__hook">save this before you forget →</span>
          </span>
        </span>
      );
    case 'wechat-pair':
      return (
        <span className="tpl-wechat">
          <span className="tpl-wechat__wide">
            <span className="tpl-wechat__wide-img" />
            <strong className="tpl-wechat__wide-title">深度 · 一篇讲透增长</strong>
          </span>
          <span className="tpl-wechat__square">
            <strong className="tpl-wechat__sq-title">分享卡</strong>
            <span className="tpl-wechat__sq-sub">点击阅读全文</span>
          </span>
        </span>
      );
    case 'story':
      return (
        <span className="tpl-story">
          <span className="tpl-story__segs"><i className="is-on" /><i /><i /><i /></span>
          <span className="tpl-story__kicker">LAUNCHING IN</span>
          <strong className="tpl-story__num">03</strong>
          <span className="tpl-story__line">days until early access</span>
          <span className="tpl-story__cta">Swipe up to join →</span>
        </span>
      );
    case 'poll':
      return (
        <span className="tpl-story tpl-poll">
          <span className="tpl-story__segs"><i className="is-on" /><i /><i /></span>
          <span className="tpl-poll__q">Which do you ship first?</span>
          <span className="tpl-poll__sticker">
            <span className="tpl-poll__opt is-a">Dark mode</span>
            <span className="tpl-poll__opt is-b">Mobile app</span>
          </span>
          <span className="tpl-poll__tap">tap to vote</span>
        </span>
      );
    case 'quote':
      return (
        <span className="tpl-quote">
          <span className="tpl-quote__mark">&#8220;</span>
          <span className="tpl-quote__text">Ship the thing you’re slightly afraid of.</span>
          <span className="tpl-quote__by">— Founder’s notebook</span>
        </span>
      );
    case 'framework': {
      const steps = ['Find the real bottleneck', 'Make it embarrassingly small', 'Ship, then measure', 'Cut what didn’t move'];
      return (
        <span className="tpl-card tpl-framework">
          <strong className="tpl-framework__title">The 4-step ship loop</strong>
          {steps.map((step, i) => (
            <span key={step} className="tpl-frw__row">
              <span className="tpl-frw__num">{i + 1}</span>
              <span className="tpl-frw__label">{step}</span>
            </span>
          ))}
        </span>
      );
    }
    case 'photo-grid':
      return (
        <span className="tpl-grid">
          <i className="is-hero" />
          <i />
          <i className="is-accent" />
          <i />
        </span>
      );
    case 'thumbnail':
      return (
        <span className="tpl-thumb">
          <span className="tpl-thumb__burst" />
          <span className="tpl-thumb__face" />
          <span className="tpl-thumb__title">
            <b>I tried this</b>
            <b className="is-accent">for 30 days</b>
          </span>
          <span className="tpl-thumb__dur">10:24</span>
        </span>
      );
    case 'poster':
      return (
        <span className="tpl-poster">
          <span className="tpl-poster__frame">
            <span className="tpl-poster__mark">&#8220;</span>
            <span className="tpl-poster__text">The best time to start was yesterday. The second best is now.</span>
            <span className="tpl-poster__by">— Daily Reminder</span>
          </span>
        </span>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Diagram layouts (SVG, 248 x 150)
// ---------------------------------------------------------------------------

const W = 248;
const H = 150;

// Rounded node.
function N({ x, y, w, h, accent = false, r = 6 }: { x: number; y: number; w: number; h: number; accent?: boolean; r?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} className={`tpl-d-node${accent ? ' is-accent' : ''}`} />;
}

// Double-border node = LLM.
function Llm({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} className="tpl-d-node is-accent" />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={4} className="tpl-d-inner" />
    </g>
  );
}

// Hexagon = agent.
function Hex({ cx, cy, r, accent = false }: { cx: number; cy: number; r: number; accent?: boolean }) {
  const pts = [
    [cx - r, cy],
    [cx - r / 2, cy - r * 0.86],
    [cx + r / 2, cy - r * 0.86],
    [cx + r, cy],
    [cx + r / 2, cy + r * 0.86],
    [cx - r / 2, cy + r * 0.86],
  ]
    .map((p) => p.map((n) => Math.round(n * 100) / 100).join(','))
    .join(' ');
  return <polygon points={pts} className={`tpl-d-node${accent ? ' is-accent' : ''}`} />;
}

// Cylinder = store / memory.
function Cyl({ x, y, w, h, accent = false }: { x: number; y: number; w: number; h: number; accent?: boolean }) {
  const ry = Math.min(6, h * 0.16);
  return (
    <g className={`tpl-d-node${accent ? ' is-accent' : ''}`}>
      <path d={`M${x} ${y + ry} V${y + h - ry} A${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} V${y + ry}`} className="tpl-d-cyl-body" />
      <ellipse cx={x + w / 2} cy={y + ry} rx={w / 2} ry={ry} className="tpl-d-cyl-top" />
    </g>
  );
}

// Diamond = decision.
function Dmd({ cx, cy, r, accent = false }: { cx: number; cy: number; r: number; accent?: boolean }) {
  return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} className={`tpl-d-node${accent ? ' is-accent' : ''}`} />;
}

function DiagramPreview({ layout, uid, dark }: { layout: DiagramPreviewLayout; uid: string; dark: boolean }) {
  const gridId = `tpl-grid-${uid}`;
  const arrowId = `tpl-arw-${uid}`;
  const arrowAccentId = `tpl-arwa-${uid}`;
  return (
    <svg className={`tpl-d${dark ? ' is-dark' : ''}`} viewBox={`0 0 ${W} ${H}`} role="presentation" focusable="false" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id={gridId} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="var(--p-grid)" strokeWidth="1" />
        </pattern>
        <marker id={arrowId} markerWidth="7" markerHeight="7" refX="5.2" refY="3" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 0L6 3L0 6" fill="none" stroke="var(--p-stroke)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <marker id={arrowAccentId} markerWidth="7" markerHeight="7" refX="5.2" refY="3" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 0L6 3L0 6" fill="none" stroke="var(--p-accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      <rect width={W} height={H} className="tpl-d-bg" />
      <rect width={W} height={H} fill={`url(#${gridId})`} />
      <DiagramBody layout={layout} arrow={`url(#${arrowId})`} arrowAccent={`url(#${arrowAccentId})`} />
    </svg>
  );
}

function DiagramBody({ layout, arrow, arrowAccent }: { layout: DiagramPreviewLayout; arrow: string; arrowAccent: string }) {
  const A = { markerEnd: arrow } as const;
  const AA = { markerEnd: arrowAccent } as const;
  switch (layout) {
    case 'architecture':
      return (
        <>
          {Band({ x: 8, y: 9, w: 232, h: 58 })}
          {Band({ x: 8, y: 71, w: 232, h: 31 })}
          {Band({ x: 8, y: 105, w: 232, h: 35 })}
          <path d="M124 34V42" className="tpl-d-arw" {...A} />
          <path d="M105 62L52 76M124 62V74M143 62L196 76" className="tpl-d-arw" {...A} />
          <path d="M45 98V112M124 98V110M203 98V110" className="tpl-d-arw" {...A} />
          {N({ x: 99, y: 14, w: 50, h: 20 })}
          {N({ x: 89, y: 42, w: 70, h: 20, accent: true })}
          {N({ x: 18, y: 76, w: 54, h: 22 })}
          {N({ x: 97, y: 76, w: 54, h: 22 })}
          {N({ x: 176, y: 76, w: 54, h: 22 })}
          {Cyl({ x: 28, y: 110, w: 44, h: 26, accent: true })}
          {N({ x: 96, y: 110, w: 56, h: 24 })}
          {N({ x: 172, y: 110, w: 58, h: 24 })}
        </>
      );
    case 'swimlane':
      return (
        <>
          {[40, 73, 106].map((cy, i) => (
            <g key={cy}>
              <line x1="40" y1={cy} x2="236" y2={cy} className="tpl-d-lane" />
              <rect x="12" y={cy - 13} width="22" height="26" rx="4" className={`tpl-d-tab${i === 1 ? ' is-accent' : ''}`} />
            </g>
          ))}
          <path d="M88 40L104 40Q112 40 112 56L112 64" className="tpl-d-arw" {...A} />
          <path d="M146 64L160 64" className="tpl-d-arw" {...A} />
          <path d="M180 76L180 88Q180 96 168 96L150 96" className="tpl-d-arw" {...A} />
          {N({ x: 46, y: 32, w: 42, h: 16 })}
          {N({ x: 104, y: 56, w: 42, h: 16 })}
          {Dmd({ cx: 180, cy: 64, r: 13, accent: true })}
          {N({ x: 104, y: 88, w: 46, h: 16 })}
        </>
      );
    case 'agent-loop':
      return (
        <>
          {Band({ x: 8, y: 48, w: 232, h: 52 })}
          <path d="M124 36V47" className="tpl-d-arw" {...A} />
          <path d="M105 68L60 68M143 68L188 68" className="tpl-d-arw" {...A} />
          <path d="M124 90V110" className="tpl-d-arw" {...A} />
          <path d="M150 121Q196 118 196 70Q196 36 156 26" className="tpl-d-loop" {...AA} />
          {Llm({ x: 96, y: 14, w: 56, h: 22 })}
          {Hex({ cx: 124, cy: 68, r: 22, accent: true })}
          {N({ x: 18, y: 58, w: 42, h: 20 })}
          {N({ x: 188, y: 58, w: 42, h: 20 })}
          {Cyl({ x: 100, y: 110, w: 48, h: 26 })}
        </>
      );
    case 'rag':
      return (
        <>
          {Band({ x: 6, y: 32, w: 236, h: 38 })}
          {Band({ x: 36, y: 100, w: 60, h: 36 })}
          <path d="M42 52H50M84 52H90M126 52H134M170 52H176" className="tpl-d-arw" {...A} />
          <path d="M196 64Q196 92 150 92Q116 92 116 70" className="tpl-d-loop" {...AA} />
          <path d="M107 92H78Q66 92 66 104" className="tpl-d-arw" {...A} />
          {N({ x: 10, y: 42, w: 32, h: 20 })}
          {N({ x: 52, y: 42, w: 32, h: 20 })}
          {Cyl({ x: 90, y: 38, w: 34, h: 28, accent: true })}
          {N({ x: 134, y: 42, w: 36, h: 20 })}
          {N({ x: 176, y: 42, w: 44, h: 20 })}
          {Cyl({ x: 44, y: 104, w: 44, h: 26 })}
        </>
      );
    case 'sequence':
      return (
        <>
          {[40, 96, 152, 208].map((x, i) => (
            <g key={x}>
              {N({ x: x - 20, y: 12, w: 40, h: 18 })}
              <line x1={x} y1="30" x2={x} y2="134" className="tpl-d-lane" />
              {i < 3 ? <rect x={x - 3} y={46 + i * 22} width="6" height="34" rx="2" className="tpl-d-activation" /> : null}
            </g>
          ))}
          <path d="M40 50H96" className="tpl-d-arw" {...A} />
          <path d="M96 72H152" className="tpl-d-arw" {...A} />
          <path d="M152 94H208" className="tpl-d-arw" {...AA} />
          <path d="M208 116H40" className="tpl-d-arw is-dash" {...A} />
        </>
      );
    case 'class':
      return (
        <>
          <path d="M124 92L124 84Q124 80 96 80L49 80L49 74" className="tpl-d-arw" {...A} />
          <path d="M124 92L124 84Q124 80 152 80L199 80L199 74" className="tpl-d-arw" {...A} />
          <ClassBox x={14} y={20} w={70} h={54} />
          <ClassBox x={164} y={20} w={70} h={54} />
          <ClassBox x={89} y={92} w={70} h={46} accent />
        </>
      );
    case 'pipeline':
      return (
        <>
          <path d="M44 73H58M100 73H126" className="tpl-d-arw" {...A} />
          <path d="M154 64L160 50Q162 45 176 45" className="tpl-d-arw" {...A} />
          <path d="M154 82L160 100Q162 105 176 105" className="tpl-d-arw is-dash" {...A} />
          {N({ x: 10, y: 60, w: 34, h: 26 })}
          {N({ x: 58, y: 60, w: 42, h: 26 })}
          {Dmd({ cx: 140, cy: 73, r: 15, accent: true })}
          {N({ x: 176, y: 34, w: 56, h: 22 })}
          {N({ x: 176, y: 92, w: 56, h: 22 })}
        </>
      );
    case 'lineage':
      return (
        <>
          <path d="M40 74L80 40M40 76L80 108" className="tpl-d-arw" {...A} />
          <path d="M114 40L140 70M114 110L140 78" className="tpl-d-arw" {...A} />
          <path d="M174 72L200 44M174 76L200 104" className="tpl-d-arw" {...AA} />
          {N({ x: 10, y: 62, w: 30, h: 24 })}
          {N({ x: 80, y: 28, w: 34, h: 22 })}
          {N({ x: 80, y: 98, w: 34, h: 22 })}
          {N({ x: 140, y: 60, w: 34, h: 24, accent: true })}
          {N({ x: 200, y: 34, w: 38, h: 22 })}
          {N({ x: 200, y: 92, w: 38, h: 22 })}
        </>
      );
    case 'matrix':
      return (
        <>
          <rect x="14" y="16" width="220" height="118" rx="8" className="tpl-d-node" />
          <rect x="160" y="16" width="74" height="118" rx="8" className="tpl-d-col-accent" />
          <line x1="14" y1="46" x2="234" y2="46" className="tpl-d-grid-line" />
          <line x1="86" y1="16" x2="86" y2="134" className="tpl-d-grid-line" />
          <line x1="160" y1="16" x2="160" y2="134" className="tpl-d-grid-line" />
          <line x1="14" y1="76" x2="234" y2="76" className="tpl-d-grid-line" />
          <line x1="14" y1="106" x2="234" y2="106" className="tpl-d-grid-line" />
          {[31, 61, 91].map((cy) => (
            <rect key={`l${cy}`} x="24" y={cy} width="42" height="6" rx="3" className="tpl-d-bar" />
          ))}
          {[123, 197].map((cx) => <rect key={`h${cx}`} x={cx - 16} y="27" width="32" height="8" rx="4" className="tpl-d-bar is-head" />)}
          {[61, 91, 121].map((cy) => <circle key={`c1${cy}`} cx="123" cy={cy} r="4.5" className="tpl-d-cell" />)}
          {[61, 91, 121].map((cy) => <circle key={`c2${cy}`} cx="197" cy={cy} r="4.5" className="tpl-d-cell is-accent" />)}
        </>
      );
    case 'before-after':
      return (
        <>
          <line x1="124" y1="22" x2="124" y2="128" className="tpl-d-divider" />
          <path d="M104 75H148" className="tpl-d-arw is-thick" {...AA} />
          {N({ x: 22, y: 30, w: 36, h: 18 })}
          {N({ x: 22, y: 58, w: 60, h: 18 })}
          {N({ x: 22, y: 86, w: 44, h: 18 })}
          {N({ x: 158, y: 36, w: 64, h: 22, accent: true })}
          {N({ x: 158, y: 70, w: 48, h: 22, accent: true })}
          {N({ x: 158, y: 104, w: 56, h: 20, accent: true })}
        </>
      );
    case 'quadrant':
      return (
        <>
          <rect x="124" y="22" width="106" height="53" rx="3" className="tpl-d-col-accent" />
          <path d="M124 132V20" className="tpl-d-axis" {...A} />
          <path d="M16 75H232" className="tpl-d-axis" {...A} />
          <circle cx="66" cy="52" r="6" className="tpl-d-cell" />
          <circle cx="58" cy="104" r="5" className="tpl-d-cell" />
          <circle cx="156" cy="108" r="5" className="tpl-d-cell" />
          <circle cx="178" cy="46" r="8" className="tpl-d-cell is-accent" />
          <circle cx="178" cy="46" r="12" className="tpl-d-ring" />
        </>
      );
    case 'mesh':
      return (
        <>
          <path d="M124 75L70 38M124 75L188 40M124 75L52 104M124 75L196 104M124 75L124 24" className="tpl-d-mesh" />
          <path d="M70 38L124 24M124 24L188 40M188 40L196 104M52 104L196 104M52 104L70 38" className="tpl-d-mesh is-faint" />
          {Hex({ cx: 124, cy: 24, r: 14 })}
          {Hex({ cx: 64, cy: 38, r: 14 })}
          {Hex({ cx: 192, cy: 40, r: 14 })}
          {Hex({ cx: 48, cy: 106, r: 14 })}
          {Hex({ cx: 200, cy: 106, r: 14 })}
          {Hex({ cx: 124, cy: 75, r: 20, accent: true })}
        </>
      );
    case 'state':
      return (
        <>
          <circle cx="16" cy="75" r="4" className="tpl-d-dot" />
          <path d="M20 75H38" className="tpl-d-arw" {...A} />
          <path d="M70 64Q96 40 122 44" className="tpl-d-arw" {...A} />
          <path d="M70 86Q96 110 122 106" className="tpl-d-arw" {...A} />
          <path d="M138 50Q176 56 196 68" className="tpl-d-arw" {...AA} />
          <path d="M138 102Q176 96 196 84" className="tpl-d-arw" {...A} />
          <path d="M118 32Q140 22 144 36" className="tpl-d-loop" {...A} />
          <StateNode cx={56} cy={75} r={17} />
          <StateNode cx={130} cy={45} r={17} />
          <StateNode cx={130} cy={105} r={17} />
          <StateNode cx={210} cy={76} r={17} accent terminal />
        </>
      );
    case 'mindmap':
      return (
        <>
          <path d="M101 67Q74 44 62 31" className="tpl-d-branch" />
          <path d="M147 67Q174 44 186 31" className="tpl-d-branch is-alt" />
          <path d="M98 75H54" className="tpl-d-branch" />
          <path d="M150 75H194" className="tpl-d-branch is-alt" />
          <path d="M104 84Q74 108 78 120" className="tpl-d-branch is-alt" />
          <path d="M144 84Q176 108 172 120" className="tpl-d-branch" />
          {N({ x: 16, y: 16, w: 46, h: 18, r: 9 })}
          {N({ x: 186, y: 16, w: 46, h: 18, r: 9 })}
          {N({ x: 10, y: 66, w: 44, h: 18, r: 9 })}
          {N({ x: 194, y: 66, w: 44, h: 18, r: 9 })}
          {N({ x: 32, y: 116, w: 46, h: 18, r: 9 })}
          {N({ x: 172, y: 116, w: 46, h: 18, r: 9 })}
          {N({ x: 96, y: 62, w: 56, h: 26, accent: true, r: 13 })}
        </>
      );
    case 'timeline':
      return (
        <>
          <path d="M14 75H236" className="tpl-d-axis is-thick" {...A} />
          {[44, 96, 148, 200].map((x) => (
            <line key={`s${x}`} x1={x} y1="75" x2={x} y2={x % 96 === 44 || x === 148 ? 50 : 100} className="tpl-d-stem" />
          ))}
          {N({ x: 22, y: 26, w: 44, h: 22 })}
          {N({ x: 74, y: 102, w: 44, h: 22 })}
          {N({ x: 126, y: 26, w: 44, h: 22 })}
          {N({ x: 178, y: 102, w: 44, h: 22, accent: true })}
          {[44, 96, 148, 200].map((x, i) => (
            <circle key={`d${x}`} cx={x} cy="75" r={i === 3 ? 5 : 4} className={`tpl-d-cell${i === 3 ? ' is-accent' : ''}`} />
          ))}
        </>
      );
    default:
      return null;
  }
}

// Dashed section-group container — the signature "fireworks" grouping that
// makes a flow diagram read as a real, sectioned technical figure.
function Band({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={9} className="tpl-d-band" />;
}

function ClassBox({ x, y, w, h, accent = false }: { x: number; y: number; w: number; h: number; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={5} className="tpl-d-node" />
      <path d={`M${x} ${y + 16}h${w}`} className="tpl-d-class-rule" />
      <path d={`M${x} ${y + h - 16}h${w}`} className="tpl-d-class-rule" />
      <rect x={x + 8} y={y + 6} width={w - 28} height={5} rx={2.5} className={`tpl-d-bar${accent ? ' is-head' : ' is-head'}`} />
      <rect x={x + 8} y={y + 23} width={w - 22} height={3.5} rx={1.75} className="tpl-d-bar" />
      <rect x={x + 8} y={y + 31} width={w - 34} height={3.5} rx={1.75} className="tpl-d-bar" />
      <rect x={x + 8} y={y + h - 11} width={w - 30} height={3.5} rx={1.75} className="tpl-d-bar" />
    </g>
  );
}

function StateNode({ cx, cy, r, accent = false, terminal = false }: { cx: number; cy: number; r: number; accent?: boolean; terminal?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className={`tpl-d-node${accent ? ' is-accent' : ''}`} />
      {terminal ? <circle cx={cx} cy={cy} r={r - 4} className="tpl-d-inner" /> : null}
      <rect x={cx - 9} y={cy - 2.5} width="18" height="5" rx="2.5" className="tpl-d-bar" />
    </g>
  );
}

export type { PreviewSpec };
