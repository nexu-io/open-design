// DOM-touching clipboard-copy adapter for the text viewer. Kept out of the
// slice (guard forbids `document`/`window` in features/**): tries the
// Clipboard API first, falling back to a hidden textarea + execCommand for
// contexts where `navigator.clipboard` rejects.
export async function copyTextFileToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
  }
}
