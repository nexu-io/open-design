export function formatOrbitCompletionSummary({
  status,
  artifactTitle,
  assistantMessage,
}: {
  status: string;
  artifactTitle?: string | null;
  assistantMessage?: string | null;
}): string {
  if (artifactTitle) {
    return `Agent ${status} and registered live artifact ${artifactTitle}.`;
  }

  const detail = compactSummaryText(assistantMessage);
  return detail
    ? `Agent ${status} but did not register a live artifact for this Orbit run: ${detail}`
    : `Agent ${status} but did not register a live artifact for this Orbit run.`;
}

function compactSummaryText(text: string | null | undefined, maxLength = 220): string {
  const firstBlock = typeof text === 'string' ? text.trim().split(/\n\s*\n/, 1)[0]?.trim() ?? '' : '';
  const singleLine = firstBlock.replace(/\s+/g, ' ');
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}
