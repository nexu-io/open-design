export function parseStoredVolume(text: string | null): number | undefined {
  const volume = Number.parseFloat(text ?? "");
  return Number.isFinite(volume) ? volume : undefined;
}

export const elementVolume = (el: Element, media: Element) =>
  parseStoredVolume(el.getAttribute("data-volume") ?? media.getAttribute("data-volume"));
