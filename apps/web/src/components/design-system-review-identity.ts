interface DesignSystemReviewIdentitySection {
  title: string;
  files: readonly string[];
}

export type DesignSystemReviewPreviewDisplay = 'specimen' | 'ui-kit' | 'asset';

export function designSystemReviewInstanceId(
  groupTitle: string,
  section: DesignSystemReviewIdentitySection,
): string {
  const primaryFile = section.files.find((file) => file.trim())?.trim();
  return primaryFile ? `${groupTitle}:${section.title}:${primaryFile}` : `${groupTitle}:${section.title}`;
}

export function designSystemReviewPreviewHeight(
  viewport: string | undefined,
  display: DesignSystemReviewPreviewDisplay,
): string | undefined {
  const match = viewport?.trim().match(/^\d{2,5}x(\d{2,5})$/i);
  if (!match) return undefined;
  const height = Number(match[1]);
  if (!Number.isFinite(height) || height <= 0) return undefined;
  const [min, max] = display === 'ui-kit'
    ? [360, 920]
    : display === 'asset'
      ? [140, 420]
      : [140, 520];
  return `clamp(${min}px, ${height}px, ${max}px)`;
}
