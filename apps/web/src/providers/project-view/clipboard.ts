// Transport home for the Continue-in-CLI toolbar's clipboard write. Delegates
// to the shared clipboard helper (Clipboard API, falling back to a hidden
// textarea + execCommand('copy') for locked-clipboard / insecure contexts) so
// the project-view slice never touches `navigator`/`document` directly.
import { copyToClipboard } from '../../lib/copy-to-clipboard';

/** Copy text to the clipboard. Resolves `false` if every fallback path fails. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  return copyToClipboard(text);
}
