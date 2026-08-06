// Under the packaged od:// custom protocol, Chromium's font loader cannot
// load ANY url()-sourced font: the request dies inside the renderer before
// it even reaches resource timing (plain fetch() of the same URL returns
// 200 with byte-identical content). Every CSS-declared FontFace therefore
// settles in the terminal `error` state — which Chromium never retries —
// and icon glyphs render as tofu squares.
//
// Recovery bypasses the font loader entirely: fetch the bytes over the
// (working) fetch path and register an in-memory FontFace built from the
// ArrayBuffer. A successfully loaded JS FontFace joins font matching
// alongside the errored CSS one and the glyphs repaint immediately. The
// same sweep also self-heals dev/HTTP sessions where a font fetch lost a
// startup race.
//
// Cyrillic-range Noto faces (#6478) often stay unloaded until the first
// Russian glyph request. On od:// that late load then errors *after* the
// timed startup sweeps have finished. Subscribe to FontFaceSet
// `loadingerror` so a later locale switch still recovers those faces.
type RecoverableFont = {
  family: string;
  url: string;
  descriptors?: FontFaceDescriptors;
};

const RECOVERABLE_FONTS: RecoverableFont[] = [
  { family: 'remixicon', url: '/remixicon.ttf' },
  {
    family: 'Albert Sans',
    url: '/fonts/AlbertSans-VariableFont_wght.ttf',
    descriptors: { weight: '100 900' },
  },
  {
    family: 'Albert Sans',
    url: '/fonts/AlbertSans-Italic-VariableFont_wght.ttf',
    descriptors: { weight: '100 900', style: 'italic' },
  },
  // Cyrillic-only fallback faces (#6478). Same od:// recovery path as Albert.
  {
    family: 'Noto Sans',
    url: '/fonts/noto-sans-cyrillic-wght-normal.woff2',
    descriptors: {
      weight: '100 900',
      unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    },
  },
  {
    family: 'Noto Sans',
    url: '/fonts/noto-sans-cyrillic-ext-wght-normal.woff2',
    descriptors: {
      weight: '100 900',
      unicodeRange: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
    },
  },
  {
    family: 'Noto Sans',
    url: '/fonts/noto-sans-cyrillic-wght-italic.woff2',
    descriptors: {
      weight: '100 900',
      style: 'italic',
      unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    },
  },
  {
    family: 'Noto Sans',
    url: '/fonts/noto-sans-cyrillic-ext-wght-italic.woff2',
    descriptors: {
      weight: '100 900',
      style: 'italic',
      unicodeRange: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
    },
  },
];

// Packaged builds fail 100% of url() font loads, so sweep immediately on
// mount; later sweeps catch fonts whose fetch failed while startup was
// still congested.
const RETRY_DELAYS_MS = [0, 4_000, 15_000, 45_000];

function normalizeFamily(family: string): string {
  return family.replace(/^["']|["']$/g, '');
}

function erroredFamilies(doc: Document): Set<string> {
  const errored = new Set<string>();
  if (!doc.fonts || typeof doc.fonts.forEach !== 'function') return errored;
  doc.fonts.forEach((face) => {
    if (face.status === 'error') {
      errored.add(normalizeFamily(face.family));
    }
  });
  return errored;
}

async function recoverFont(doc: Document, font: RecoverableFont): Promise<boolean> {
  try {
    const resp = await fetch(font.url);
    if (!resp.ok) return false;
    const bytes = await resp.arrayBuffer();
    const face = new FontFace(font.family, bytes, font.descriptors);
    await face.load();
    doc.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}

/**
 * Schedules post-startup sweeps that re-load any recoverable font whose
 * CSS-declared FontFace settled in the terminal `error` state. Also listens
 * for FontFaceSet `loadingerror` so late range-limited loads (e.g. Cyrillic
 * Noto after an English → ru locale switch) are recovered after the timed
 * sweeps have finished. Idempotent per call; returns a cancel function for
 * unmount/tests.
 */
export function installFontRecovery(doc: Document = document): () => void {
  const recovered = new Set<RecoverableFont>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  const sweep = async () => {
    if (cancelled) return;
    const errored = erroredFamilies(doc);
    for (const font of RECOVERABLE_FONTS) {
      if (recovered.has(font) || !errored.has(font.family)) continue;
      if (await recoverFont(doc, font)) recovered.add(font);
    }
  };

  const onLoadingError = () => {
    void sweep();
  };

  const fonts = doc.fonts as FontFaceSet | undefined;
  if (fonts && typeof fonts.addEventListener === 'function') {
    fonts.addEventListener('loadingerror', onLoadingError);
  }

  for (const delay of RETRY_DELAYS_MS) {
    timers.push(setTimeout(() => void sweep(), delay));
  }

  return () => {
    cancelled = true;
    for (const timer of timers) clearTimeout(timer);
    if (fonts && typeof fonts.removeEventListener === 'function') {
      fonts.removeEventListener('loadingerror', onLoadingError);
    }
  };
}
