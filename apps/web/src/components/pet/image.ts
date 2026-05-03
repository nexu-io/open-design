// Helpers for turning a user-picked image file into a self-contained
// pet sprite payload that is safe to drop into localStorage. We do
// three things:
//
// 1. Reject anything that is not an image.
// 2. For animated GIFs (and SVGs), pass the original bytes through as a
//    data URL — re-encoding through a canvas would freeze a GIF on its
//    first frame and rasterize an SVG, which we explicitly want to
//    avoid for spritesheet uploads modeled on codex-pets-react sheets.
// 3. For everything else (PNG / JPG / WebP), draw to a canvas at a
//    capped longest-side and re-export as PNG so the resulting data
//    URL stays bounded even when the source is a 4K screenshot.
//
// All of this happens client-side; nothing is uploaded to the daemon.

export interface PetImageResult {
  // Ready-to-render data URL (data:image/...;base64,…) or a passthrough
  // for animated formats.
  dataUrl: string;
  // Pixel size of the resulting image — useful for the settings preview
  // when guessing a sensible default frame count for spritesheets.
  width: number;
  height: number;
  // True when we re-encoded through a canvas (PNG output). False when
  // we kept the original bytes (GIF, SVG) so the caller can warn the
  // user about size limits before saving.
  reencoded: boolean;
}

// Hard cap on the data URL we are willing to stash in localStorage.
// localStorage typically has a 5 MB budget per origin and we already
// share that bucket with the rest of `open-design:config`. 800 KB
// keeps room for a beefy spritesheet without blowing the budget.
const MAX_DATA_URL_BYTES = 800 * 1024;

// Capped longest-side for re-encoded sprites. 384 px gives a 4-frame
// strip plenty of resolution at the 56 px overlay size while keeping
// the data URL short.
const MAX_REENCODED_PX = 384;

const PASSTHROUGH_TYPES = new Set(['image/gif', 'image/svg+xml', 'image/webp']);

export async function loadPetImageFromFile(
  file: File,
): Promise<PetImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported.');
  }
  if (PASSTHROUGH_TYPES.has(file.type)) {
    const dataUrl = await fileToDataUrl(file);
    if (approxDataUrlBytes(dataUrl) > MAX_DATA_URL_BYTES) {
      throw new Error(
        'That image is too large after encoding. Try one under ~800 KB.',
      );
    }
    const dims = await measureImage(dataUrl);
    return { dataUrl, width: dims.width, height: dims.height, reencoded: false };
  }
  // PNG / JPG / etc — re-encode through a canvas so the data URL stays
  // small even when the source is high-resolution.
  const dataUrl = await fileToDataUrl(file);
  const original = await measureImage(dataUrl);
  const scale = Math.min(
    1,
    MAX_REENCODED_PX / Math.max(original.width, original.height),
  );
  const targetW = Math.max(1, Math.round(original.width * scale));
  const targetH = Math.max(1, Math.round(original.height * scale));
  const reencoded = await drawToPng(dataUrl, targetW, targetH);
  if (approxDataUrlBytes(reencoded) > MAX_DATA_URL_BYTES) {
    throw new Error(
      'That image is too large after encoding. Try a smaller source.',
    );
  }
  return {
    dataUrl: reencoded,
    width: targetW,
    height: targetH,
    reencoded: true,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not decode the image.'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not load that image.'));
    img.src = dataUrl;
  });
}

function drawToPng(dataUrl: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas is unavailable in this browser.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Encode failed'));
      }
    };
    img.onerror = () => reject(new Error('Could not load that image.'));
    img.src = dataUrl;
  });
}

function approxDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return dataUrl.length;
  // base64 is ~4 chars per 3 bytes; this estimate is good enough to
  // guard the localStorage budget without parsing.
  const base64 = dataUrl.slice(comma + 1);
  return Math.floor((base64.length * 3) / 4);
}
