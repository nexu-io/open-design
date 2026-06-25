// Illustrative "intent" thumbnails for the Home scenario rail.
//
// Each create-rail card used to show a single line icon, which reads the same
// for every scenario at a glance. These mini-mockups instead *depict* the
// artifact the card produces — a browser window for Prototype, a slide stack
// for Slide deck, a page for Document, a waveform for Audio — so the user can
// recognize the card by shape, like the reference design rails do.
//
// Two-tone, token-driven, no hardcoded colors: neutral ink for structure
// (`--text-muted`) plus a single `--accent` highlight per illustration so the
// eye lands on the meaningful part. Drawn in a shared 60×42 viewBox.

import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';

const INK = 'var(--text-muted)';
const ACCENT = 'var(--accent)';
// Opaque fill used to occlude shapes stacked behind another (slide/frame peeks)
// so overlapping outlines don't show through. Tracks the card-art surface.
const SURFACE = 'var(--bg-panel)';

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      className="home-hero__scenario-art-svg"
      viewBox="0 0 60 42"
      width={60}
      height={42}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function PrototypeArt() {
  // Browser/app window: chrome bar with dots, an accent CTA, body lines.
  return (
    <Frame>
      <rect x="6" y="7" width="48" height="28" rx="4" stroke={INK} strokeWidth="2" />
      <line x1="6" y1="15" x2="54" y2="15" stroke={INK} strokeWidth="2" />
      <circle cx="10.5" cy="11" r="1.1" fill={INK} />
      <circle cx="14.5" cy="11" r="1.1" fill={INK} />
      <circle cx="18.5" cy="11" r="1.1" fill={INK} />
      <rect x="11" y="20" width="13" height="5" rx="1.5" fill={ACCENT} />
      <line x1="28" y1="21" x2="48" y2="21" stroke={INK} strokeWidth="2" />
      <line x1="28" y1="26" x2="42" y2="26" stroke={INK} strokeWidth="2" />
      <line x1="11" y1="30" x2="48" y2="30" stroke={INK} strokeWidth="2" />
    </Frame>
  );
}

function WireframeArt() {
  // Lo-fi greybox screen: a dashed frame (the wireframe tell) over placeholder
  // blocks and an accent CTA placeholder.
  return (
    <Frame>
      <rect x="6" y="7" width="48" height="28" rx="4" stroke={INK} strokeWidth="2" strokeDasharray="3.5 3" />
      <rect x="11" y="12" width="38" height="6" rx="1.5" fill={INK} fillOpacity="0.16" />
      <rect x="11" y="22" width="16" height="9" rx="1.5" fill={INK} fillOpacity="0.16" />
      <rect x="31" y="22" width="11" height="5" rx="1.5" fill={ACCENT} />
      <line x1="31" y1="30" x2="49" y2="30" stroke={INK} strokeWidth="2" />
    </Frame>
  );
}

function MobileArt() {
  // Phone with status notch, content lines, and an accent bottom bar.
  return (
    <Frame>
      <rect x="22" y="4" width="16" height="34" rx="3.5" stroke={INK} strokeWidth="2" />
      <line x1="27.5" y1="7.5" x2="32.5" y2="7.5" stroke={INK} strokeWidth="1.6" />
      <line x1="26" y1="14" x2="34" y2="14" stroke={INK} strokeWidth="2" />
      <line x1="26" y1="19" x2="34" y2="19" stroke={INK} strokeWidth="2" />
      <line x1="26" y1="24" x2="31" y2="24" stroke={INK} strokeWidth="2" />
      <rect x="26" y="29" width="8" height="4" rx="1.5" fill={ACCENT} />
    </Frame>
  );
}

function DeckArt() {
  // Slide deck: a peeking back slide plus a front slide with accent title.
  return (
    <Frame>
      <rect x="15" y="6" width="38" height="24" rx="3" stroke={INK} strokeWidth="2" strokeOpacity="0.45" />
      <rect x="7" y="11" width="38" height="24" rx="3" fill={SURFACE} stroke={INK} strokeWidth="2" />
      <rect x="11" y="15" width="14" height="5" rx="1.5" fill={ACCENT} />
      <line x1="11" y1="25" x2="41" y2="25" stroke={INK} strokeWidth="2" />
      <line x1="11" y1="30" x2="34" y2="30" stroke={INK} strokeWidth="2" />
    </Frame>
  );
}

function DocumentArt() {
  // Portrait page with a folded corner, accent title line, body lines.
  return (
    <Frame>
      <path d="M17 5 H37 L43 11 V37 H17 Z" fill={SURFACE} stroke={INK} strokeWidth="2" />
      <path d="M37 5 V11 H43" stroke={INK} strokeWidth="2" />
      <line x1="21" y1="17" x2="38" y2="17" stroke={ACCENT} strokeWidth="2" />
      <line x1="21" y1="22" x2="39" y2="22" stroke={INK} strokeWidth="2" />
      <line x1="21" y1="27" x2="39" y2="27" stroke={INK} strokeWidth="2" />
      <line x1="21" y1="32" x2="33" y2="32" stroke={INK} strokeWidth="2" />
    </Frame>
  );
}

function BrandKitArt() {
  // Style tile: a row of color swatches (one accent) over two type lines.
  return (
    <Frame>
      <rect x="8" y="9" width="13" height="13" rx="2.5" fill={ACCENT} />
      <rect x="24" y="9" width="13" height="13" rx="2.5" fill={INK} fillOpacity="0.18" stroke={INK} strokeWidth="2" />
      <rect x="40" y="9" width="13" height="13" rx="2.5" stroke={INK} strokeWidth="2" />
      <line x1="8" y1="29" x2="42" y2="29" stroke={INK} strokeWidth="2" />
      <line x1="8" y1="34" x2="30" y2="34" stroke={INK} strokeWidth="2" />
    </Frame>
  );
}

function HyperFramesArt() {
  // Motion frames: two stacked frames with an accent play glyph in front.
  return (
    <Frame>
      <rect x="9" y="12" width="33" height="21" rx="3" fill={SURFACE} stroke={INK} strokeWidth="2" strokeOpacity="0.45" />
      <rect x="18" y="8" width="33" height="21" rx="3" fill={SURFACE} stroke={INK} strokeWidth="2" />
      <path d="M31 13 V23 L39 18 Z" fill={ACCENT} />
    </Frame>
  );
}

function LiveArtifactArt() {
  // Dashboard: a panel of bars with the peak in accent.
  return (
    <Frame>
      <rect x="6" y="7" width="48" height="28" rx="4" stroke={INK} strokeWidth="2" />
      <line x1="14" y1="29" x2="14" y2="23" stroke={INK} strokeWidth="3" />
      <line x1="22" y1="29" x2="22" y2="18" stroke={INK} strokeWidth="3" />
      <line x1="30" y1="29" x2="30" y2="25" stroke={INK} strokeWidth="3" />
      <line x1="38" y1="29" x2="38" y2="14" stroke={ACCENT} strokeWidth="3" />
      <line x1="46" y1="29" x2="46" y2="21" stroke={INK} strokeWidth="3" />
    </Frame>
  );
}

function ImageArt() {
  // Picture frame with an accent sun and a mountain ridge.
  return (
    <Frame>
      <rect x="8" y="8" width="44" height="26" rx="4" stroke={INK} strokeWidth="2" />
      <circle cx="19" cy="16" r="3" fill={ACCENT} />
      <path d="M11 31 L22 20 L29 26 L37 17 L49 31" stroke={INK} strokeWidth="2" />
    </Frame>
  );
}

function VideoArt() {
  // Media player: accent play glyph over a timeline scrubber.
  return (
    <Frame>
      <rect x="6" y="7" width="48" height="28" rx="4" stroke={INK} strokeWidth="2" />
      <path d="M26 15 V25 L35 20 Z" fill={ACCENT} />
      <line x1="11" y1="30" x2="49" y2="30" stroke={INK} strokeWidth="2" />
      <circle cx="22" cy="30" r="2" fill={INK} />
    </Frame>
  );
}

function AudioArt() {
  // Waveform: vertical bars rising to an accent peak at center.
  return (
    <Frame>
      <line x1="12" y1="17" x2="12" y2="25" stroke={INK} strokeWidth="3" />
      <line x1="18" y1="13" x2="18" y2="29" stroke={INK} strokeWidth="3" />
      <line x1="24" y1="9" x2="24" y2="33" stroke={INK} strokeWidth="3" />
      <line x1="30" y1="6" x2="30" y2="36" stroke={ACCENT} strokeWidth="3" />
      <line x1="36" y1="11" x2="36" y2="31" stroke={INK} strokeWidth="3" />
      <line x1="42" y1="14" x2="42" y2="28" stroke={INK} strokeWidth="3" />
      <line x1="48" y1="17" x2="48" y2="25" stroke={INK} strokeWidth="3" />
    </Frame>
  );
}

const ART_BY_CHIP: Record<string, () => ReactElement> = {
  prototype: PrototypeArt,
  wireframe: WireframeArt,
  mobile: MobileArt,
  deck: DeckArt,
  document: DocumentArt,
  'create-brand-kit': BrandKitArt,
  hyperframes: HyperFramesArt,
  'live-artifact': LiveArtifactArt,
  image: ImageArt,
  video: VideoArt,
  audio: AudioArt,
};

interface ScenarioArtProps {
  chipId: string;
  // Rendered when a chip has no bespoke illustration yet, so new chips keep a
  // sensible glyph instead of an empty art slot.
  fallbackIcon: IconName;
}

export function ScenarioArt({ chipId, fallbackIcon }: ScenarioArtProps) {
  const Art = ART_BY_CHIP[chipId];
  if (Art) return <Art />;
  return <Icon name={fallbackIcon} size={24} aria-hidden />;
}
