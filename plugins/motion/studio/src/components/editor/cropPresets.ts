import type { ClipPathInsetSides } from "./clipPathHelpers";

export const CROP_ASPECT_PRESETS = [
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
] as const;

/** Insets (element CSS px) that leave the largest centred box of `ratio` (width / height). */
export function centredCropInsets(
  width: number,
  height: number,
  ratio: number,
): ClipPathInsetSides {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  if (width <= 0 || height <= 0 || ratio <= 0) return none;
  if (width / height > ratio) {
    const side = (width - height * ratio) / 2;
    return side > 1e-9 ? { ...none, left: side, right: side } : none;
  }
  const band = (height - width / ratio) / 2;
  return band > 1e-9 ? { ...none, top: band, bottom: band } : none;
}
