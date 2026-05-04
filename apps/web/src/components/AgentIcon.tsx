interface Props {
  id: string;
  size?: number;
  className?: string;
}

interface Visual {
  bg: string;
  fg: string;
  glyph: (size: number) => JSX.Element;
}

function star4(size: number, color: string) {
  // Sparkle / 4-point star — used for Claude.
  const s = size;
  const c = s / 2;
  const r = s * 0.36;
  const t = s * 0.08;
  return (
    <path
      d={`M ${c} ${c - r} C ${c} ${c - t}, ${c + t} ${c}, ${c + r} ${c} C ${c + t} ${c}, ${c} ${c + t}, ${c} ${c + r} C ${c} ${c + t}, ${c - t} ${c}, ${c - r} ${c} C ${c - t} ${c}, ${c} ${c - t}, ${c} ${c - r} Z`}
      fill={color}
    />
  );
}

const VISUALS: Record<string, Visual> = {
  // Claude — warm Anthropic terracotta with sparkle.
  claude: {
    bg: 'linear-gradient(135deg, #d97757 0%, #b85a3b 100%)',
    fg: '#fff7ef',
    glyph: (s) => star4(s, '#fff7ef'),
  },
  // Codex — OpenAI signature dark green knot.
  codex: {
    bg: 'linear-gradient(135deg, #1a1a1a 0%, #303030 100%)',
    fg: '#10a37f',
    glyph: (s) => {
      const c = s / 2;
      const r = s * 0.32;
      return (
        <g
          transform={`rotate(15 ${c} ${c})`}
          stroke="#10a37f"
          strokeWidth={s * 0.07}
          fill="none"
          strokeLinecap="round"
        >
          <ellipse cx={c} cy={c} rx={r} ry={r * 0.45} />
          <ellipse
            cx={c}
            cy={c}
            rx={r}
            ry={r * 0.45}
            transform={`rotate(60 ${c} ${c})`}
          />
          <ellipse
            cx={c}
            cy={c}
            rx={r}
            ry={r * 0.45}
            transform={`rotate(120 ${c} ${c})`}
          />
        </g>
      );
    },
  },
  // Gemini — Google blue/purple with diamond spark.
  gemini: {
    bg: 'linear-gradient(135deg, #4285f4 0%, #9b72cb 60%, #d96570 100%)',
    fg: '#ffffff',
    glyph: (s) => star4(s, '#ffffff'),
  },
  // OpenCode — terminal green angle brackets.
  opencode: {
    bg: 'linear-gradient(135deg, #064e3b 0%, #0f766e 100%)',
    fg: '#a7f3d0',
    glyph: (s) => {
      const c = s / 2;
      const off = s * 0.16;
      const arm = s * 0.12;
      return (
        <g
          stroke="#a7f3d0"
          strokeWidth={s * 0.08}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points={`${c - off + arm},${c - arm} ${c - off},${c} ${c - off + arm},${c + arm}`} />
          <polyline points={`${c + off - arm},${c - arm} ${c + off},${c} ${c + off - arm},${c + arm}`} />
        </g>
      );
    },
  },
  // Cursor — clean black with a cursor arrow.
  'cursor-agent': {
    bg: 'linear-gradient(135deg, #18181b 0%, #3f3f46 100%)',
    fg: '#ffffff',
    glyph: (s) => {
      const c = s / 2;
      const o = s * 0.22;
      return (
        <path
          d={`M ${c - o} ${c - o} L ${c + o * 0.9} ${c} L ${c} ${c + o * 0.2} L ${c - o * 0.05} ${c + o * 0.85} Z`}
          fill="#ffffff"
        />
      );
    },
  },
  // GitHub Copilot — GitHub-dark with the Copilot two-eye mark.
  copilot: {
    bg: 'linear-gradient(135deg, #0d1117 0%, #1f2937 100%)',
    fg: '#ffffff',
    glyph: (s) => {
      const c = s / 2;
      const eyeOff = s * 0.14;
      const eyeRx = s * 0.075;
      const eyeRy = s * 0.12;
      return (
        <g fill="#ffffff">
          <ellipse cx={c - eyeOff} cy={c} rx={eyeRx} ry={eyeRy} />
          <ellipse cx={c + eyeOff} cy={c} rx={eyeRx} ry={eyeRy} />
        </g>
      );
    },
  },
  // Qwen — Alibaba indigo with stylized Q.
  qwen: {
    bg: 'linear-gradient(135deg, #615ced 0%, #8b5cf6 100%)',
    fg: '#ffffff',
    glyph: (s) => {
      const c = s / 2;
      const r = s * 0.26;
      return (
        <g fill="none" stroke="#ffffff" strokeWidth={s * 0.07} strokeLinecap="round">
          <circle cx={c} cy={c} r={r} />
          <line x1={c + r * 0.45} y1={c + r * 0.45} x2={c + r * 0.95} y2={c + r * 0.95} />
        </g>
      );
    },
  },
  // DeepSeek — DeepSeek-blue with abstract whale-tail / wave glyph.
  deepseek: {
    bg: 'linear-gradient(135deg, #4d6bfe 0%, #1f3fce 100%)',
    fg: '#ffffff',
    glyph: (s) => {
      const c = s / 2;
      const r = s * 0.3;
      return (
        <g fill="none" stroke="#ffffff" strokeWidth={s * 0.08} strokeLinecap="round" strokeLinejoin="round">
          <path d={`M ${c - r} ${c + r * 0.3} Q ${c - r * 0.4} ${c - r * 0.6}, ${c} ${c - r * 0.1} T ${c + r} ${c + r * 0.3}`} />
          <path d={`M ${c - r * 0.6} ${c + r * 0.7} Q ${c} ${c + r * 0.2}, ${c + r * 0.6} ${c + r * 0.7}`} />
        </g>
      );
    },
  },
  // MiMo — Xiaomi orange with "Mi" stylized mark.
  mimo: {
    bg: 'linear-gradient(135deg, #FF6900 0%, #FF4D00 100%)',
    fg: '#ffffff',
    glyph: (s) => {
      const c = s / 2;
      const r = s * 0.22;
      return (
        <g fill="none" stroke="#ffffff" strokeWidth={s * 0.06} strokeLinecap="round" strokeLinejoin="round">
          {/* Stylized "Mi" — three vertical bars */}
          <line x1={c - r * 0.9} y1={c - r * 0.6} x2={c - r * 0.9} y2={c + r * 0.8} />
          <line x1={c - r * 0.1} y1={c - r * 0.6} x2={c - r * 0.1} y2={c + r * 0.8} />
          <line x1={c + r * 0.9} y1={c - r * 0.6} x2={c + r * 0.9} y2={c + r * 0.8} />
          {/* Connecting roof */}
          <polyline points={`${c - r * 0.9},${c - r * 0.6} ${c - r * 0.1},${c - r * 1.2} ${c + r * 0.9},${c - r * 0.6}`} />
        </g>
      );
    },
  },
};

const FALLBACK: Visual = {
  bg: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
  fg: '#ffffff',
  glyph: (s) => {
    const c = s / 2;
    const r = s * 0.18;
    return <circle cx={c} cy={c} r={r} fill="#ffffff" />;
  },
};

export function AgentIcon({ id, size = 36, className }: Props) {
  const v = VISUALS[id] ?? FALLBACK;
  return (
    <span
      className={'agent-icon' + (className ? ' ' + className : '')}
      style={{
        width: size,
        height: size,
        background: v.bg,
        borderRadius: Math.round(size * 0.28),
      }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill={v.fg}>
        {v.glyph(size)}
      </svg>
    </span>
  );
}
