// Pure helpers for preview-comment image attachments and visual annotation
// styling/positioning. Extracted verbatim from server.ts as the first slice of
// the server.ts breakup (R6/W5): these functions have no daemon-closure
// dependencies (no db/app/req), so they move out cleanly and get real types.

export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface PreviewCommentImageAttachment {
  path: string;
  name: string;
}

export function normalizePreviewCommentImageAttachments(
  input: unknown,
): PreviewCommentImageAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: PreviewCommentImageAttachment[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const path = cleanString(record.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = cleanString(record.name) || path.split('/').pop() || path;
    out.push({ path, name });
    if (out.length >= 20) break;
  }
  return out;
}

export function imageOnlyCommentFallback(count: number): string {
  if (count <= 0) return '';
  return count > 1
    ? `Use the ${count} attached images as the comment reference.`
    : 'Use the attached image as the comment reference.';
}

export type VisualMarkKind = 'click' | 'click+stroke' | 'stroke';

export function normalizeVisualMarkKind(value: unknown): VisualMarkKind {
  return value === 'click' || value === 'click+stroke' || value === 'stroke'
    ? value
    : 'stroke';
}

export function visualAnnotationIntent(markKind: string): string {
  if (markKind === 'click') {
    return 'The screenshot has a blue focus box around the picked element; modify that picked part first.';
  }
  if (markKind === 'click+stroke') {
    return 'The screenshot has a blue focus box and red strokes; together they identify the part the user wants changed.';
  }
  return 'The screenshot has red strokes that identify the visual region the user wants changed.';
}

export function compactString(value: unknown, max: number): string {
  const text = cleanString(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;

export type AnnotationStyleKey = (typeof ANNOTATION_STYLE_KEYS)[number];
export type AnnotationStyle = Partial<Record<AnnotationStyleKey, string>>;

export function finiteAttachmentNumber(value: unknown): number {
  return Number.isFinite(value) ? Math.round(value as number) : 0;
}

export interface AttachmentPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeAttachmentPosition(input: unknown): AttachmentPosition {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    x: finiteAttachmentNumber(value.x),
    y: finiteAttachmentNumber(value.y),
    width: finiteAttachmentNumber(value.width),
    height: finiteAttachmentNumber(value.height),
  };
}

export function normalizeAnnotationStyle(input: unknown): AnnotationStyle | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const style: AnnotationStyle = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

export function formatAnnotationStyle(style: AnnotationStyle | null | undefined): string {
  if (!style || typeof style !== 'object') return '';
  return ANNOTATION_STYLE_KEYS
    .map((key) => {
      const value = style[key];
      return value ? `${key}: ${value}` : null;
    })
    .filter(Boolean)
    .join('; ');
}

export interface AttachmentPodMember {
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: AttachmentPosition;
  htmlHint: string;
  style: AnnotationStyle | undefined;
}

export function normalizeAttachmentPodMembers(input: unknown): AttachmentPodMember[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((member): AttachmentPodMember | null => {
      if (!member || typeof member !== 'object') return null;
      const record = member as Record<string, unknown>;
      const elementId = cleanString(record.elementId);
      const selector = cleanString(record.selector);
      const label = cleanString(record.label);
      if (!elementId || !selector) return null;
      return {
        elementId,
        selector,
        label,
        text: compactString(record.text, 160),
        position: normalizeAttachmentPosition(record.position),
        htmlHint: compactString(record.htmlHint, 180),
        style: normalizeAnnotationStyle(record.style),
      };
    })
    .filter((member): member is AttachmentPodMember => member !== null);
}

export function formatAttachmentPosition(position: AttachmentPosition): string {
  return `x=${position.x}, y=${position.y}, width=${position.width}, height=${position.height}`;
}
