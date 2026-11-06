export function releaseAppVersionArgs(releaseVersion: string | null | undefined): string[] {
  const normalized = releaseVersion?.trim();
  return normalized == null || normalized.length === 0 ? [] : ["--app-version", normalized];
}
