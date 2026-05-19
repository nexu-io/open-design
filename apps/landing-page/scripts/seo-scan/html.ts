export function attr(tag: string, name: string): string | null {
  const single = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag)?.[1];
  if (single !== undefined) return decode(single);
  const dbl = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1];
  return dbl !== undefined ? decode(dbl) : null;
}

export function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function stripTags(value: string): string {
  return decode(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function title(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? stripTags(match[1]) : null;
}

export function metaContent(
  html: string,
  key: 'name' | 'property',
  value: string,
): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (attr(tag, key)?.toLowerCase() === value.toLowerCase()) {
      return attr(tag, 'content');
    }
  }
  return null;
}

export function linkHref(html: string, rel: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const relValue = attr(tag, 'rel')?.toLowerCase();
    if (relValue?.split(/\s+/).includes(rel.toLowerCase())) return attr(tag, 'href');
  }
  return null;
}

export function h1Texts(html: string): string[] {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    stripTags(m[1] ?? ''),
  );
}

export function jsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1]) blocks.push(decode(match[1].trim()));
  }
  return blocks;
}

export function tags(html: string, tagName: string): string[] {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
}

export function anchors(html: string): Array<{ href: string; text: string }> {
  const values: Array<{ href: string; text: string }> = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[0], 'href');
    if (href) values.push({ href, text: stripTags(match[2] ?? '') });
  }
  return values;
}
