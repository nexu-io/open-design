/**
 * Utilitários para vídeos do YouTube usados nos tutoriais de heróis.
 * Aceitamos qualquer formato de URL e guardamos apenas o ID do vídeo.
 */

const YT_PATTERNS: RegExp[] = [
  /youtube\.com\/watch\?v=([\w-]{11})/,
  /youtu\.be\/([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
];

/** Extrai o ID de 11 caracteres de uma URL (ou retorna o próprio ID se já vier limpo). */
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  for (const re of YT_PATTERNS) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeThumbnail(
  id: string,
  quality: "default" | "hq" | "max" = "hq",
): string {
  const file =
    quality === "max"
      ? "maxresdefault"
      : quality === "hq"
        ? "hqdefault"
        : "default";
  return `https://i.ytimg.com/vi/${id}/${file}.jpg`;
}
