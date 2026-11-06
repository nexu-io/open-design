export type WebPageState = { url: string; title: string; canGoBack: boolean; canGoForward: boolean; loading: boolean; error?: string };
export type BrowserInput =
  | { type: 'pointer'; event: 'move' | 'down' | 'up'; x: number; y: number; button: 'left' | 'middle' | 'right'; clickCount?: number }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string; modifiers: number };

export function webAddress(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) throw new Error('请输入有效的 HTTP 或 HTTPS 网址');
  const input = value.trim();
  const url = new URL(/^https?:\/\//i.test(input) ? input : /^[a-z][\w+.-]*:/i.test(input) && !/^[\w.-]+:\d+(?:\/|$)/.test(input) ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error('请输入有效的 HTTP 或 HTTPS 网址');
  return url.href;
}
