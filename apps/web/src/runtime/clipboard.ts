// Generic clipboard helper. Not memory-specific — any component can reuse it.
// Keeping the DOM/navigator access here lets feature hooks stay browser-free.

/**
 * Copy text to the clipboard, falling back to a transient hidden input for
 * sandboxed contexts that block `navigator.clipboard`. Resolves once the copy
 * (or fallback) completes; rejects only if the fallback itself throws.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Some sandboxed contexts block clipboard writes silently. Fall back to a
    // transient input so the user can still grab the text with select-all + copy.
    const input = document.createElement('input');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }
}
