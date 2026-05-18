const MAX_DESIGN_MD_BYTES = 512 * 1024;

/** Patterns stripped from user-provided DESIGN.md before it enters the project tree. */
const STRIP_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /<\s*script\b[\s\S]*?<\/\s*script\s*>/gi, label: 'script elements' },
  { pattern: /<\s*iframe\b[\s\S]*?(?:<\/\s*iframe\s*>|\/>)/gi, label: 'iframe elements' },
  { pattern: /\bon[a-z][a-z0-9_-]*\s*=/gi, label: 'event handler attributes' },
  {
    pattern: /(?:href|src|action|formaction)\s*=\s*['"]?\s*javascript\s*:/gi,
    label: 'javascript: URLs',
  },
  { pattern: /\bsrcdoc\s*=/gi, label: 'srcdoc attributes' },
  { pattern: /\bdata-od-(?:html|raw|bind-html)\b/gi, label: 'raw HTML directives' },
];

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function sanitizeDesignMdImport(source: string): {
  content: string;
  warnings: string[];
} {
  if (source.includes('\0')) {
    throw new Error('Invalid DESIGN.md: binary content is not allowed.');
  }
  if (utf8ByteLength(source) > MAX_DESIGN_MD_BYTES) {
    throw new Error('DESIGN.md is too large (max 512 KB).');
  }

  let content = source;
  const warnings: string[] = [];
  for (const { pattern, label } of STRIP_PATTERNS) {
    if (pattern.test(content)) {
      content = content.replace(pattern, '');
      warnings.push(`Removed ${label} from DESIGN.md.`);
    }
    pattern.lastIndex = 0;
  }

  content = content.trim();
  if (!content) {
    throw new Error('DESIGN.md is empty after removing unsafe content.');
  }
  return { content, warnings };
}

export function isDesignMdFileName(name: string): boolean {
  return /\.md$/i.test(name);
}
