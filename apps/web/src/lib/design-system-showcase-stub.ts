/**
 * Starter DESIGN.md when Inspect saves showcase.html but the project has no spec yet.
 */

export function buildDefaultDesignMd(projectName: string): string {
  const name = String(projectName || '').trim() || 'Design system';
  return [
    `# ${name}`,
    '',
    '> Starter spec — refine colors and type in showcase.html (Inspect) or chat.',
    '',
    '## Color',
    '',
    '**Background** (`#fafafa`): page canvas',
    '**Text** (`#171717`): body copy and headings',
    '**Accent** (`#2f6feb`): links and primary buttons',
    '**Muted** (`#6b7280`): secondary text',
    '**Border** (`#e5e7eb`): dividers and input outlines',
    '**Surface** (`#ffffff`): cards and panels',
    '',
    '## Typography',
    '',
    '- **Display / headings:** system-ui, -apple-system, "Segoe UI", sans-serif',
    '- **Body:** system-ui, -apple-system, "Segoe UI", sans-serif',
    '- **Mono:** ui-monospace, "JetBrains Mono", monospace',
    '',
    '## Spacing',
    '',
    '- **Section padding:** 64px desktop / 40px tablet / 24px phone',
    '- **Content gutter:** 24px',
    '',
  ].join('\n');
}
