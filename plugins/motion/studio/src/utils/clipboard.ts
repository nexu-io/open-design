function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined" || !document.body || !document.execCommand) {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function shouldCopyWithSelectionFirst(): boolean {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent;
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR/i.test(userAgent);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const useSelectionFirst = shouldCopyWithSelectionFirst();
  if (useSelectionFirst && copyWithSelection(text)) {
    return true;
  }

  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall back below when the browser still allows synchronous copy.
    }
  }

  return !useSelectionFirst && copyWithSelection(text);
}
