const FIRST_PARTY_HOSTS = new Set(['open-design.ai', 'www.open-design.ai', 'staging.open-design.ai']);

export function openFirstPartyExternalLinkFromClick(event: MouseEvent, openExternal: (url: string) => void): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return;
  let url: URL;
  try { url = new URL(anchor.href); } catch { return; }
  if (!FIRST_PARTY_HOSTS.has(url.hostname)) return;
  event.preventDefault();
  openExternal(url.toString());
}
