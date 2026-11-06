const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "ico"];
const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];

function extensionPattern(extensions: readonly string[]): RegExp {
  return new RegExp(`\\.(${extensions.join("|")})$`, "i");
}

export const IMAGE_EXT = extensionPattern(IMAGE_EXTS);
export const VIDEO_EXT = extensionPattern(VIDEO_EXTS);
export const AUDIO_EXT = extensionPattern(AUDIO_EXTS);
export const FONT_EXT = /\.(woff|woff2|ttf|ttc|otf|eot)$/i;
export const LUT_EXT = /\.cube$/i;
export const MEDIA_EXT = extensionPattern([...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS]);

export function isMediaFile(path: string): boolean {
  return MEDIA_EXT.test(path);
}
