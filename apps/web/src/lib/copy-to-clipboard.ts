// Copies text to the clipboard using the canonical Clipboard API,
// falling back to a hidden textarea + execCommand('copy') for older
// browsers, locked-clipboard contexts, or insecure (HTTP) origins where
// navigator.clipboard.writeText rejects.
//
// Mirrors the pattern from apps/web/src/components/FileViewer.tsx
// (`copyTextToClipboard`) so behavior across the app stays consistent;
// extracted here so the new Continue in CLI button (#451) and any future
// caller can share the same fallback path without duplicating it.

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const priorFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
      if (priorFocus?.isConnected) {
        try {
          priorFocus.focus({ preventScroll: true });
        } catch {
          priorFocus.focus();
        }
      }
    }
  }
}
