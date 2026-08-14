import { ClosureUpdateError } from "./errors.js";

export function closureImmutableMetadataVersion(metadataUrl: URL): string | null {
  const match = metadataUrl.pathname.match(/\/versions\/([^/]+)\/metadata\.json$/u);
  if (match == null) return null;
  try {
    const version = decodeURIComponent(match[1]!).trim();
    if (version.length === 0) throw new Error("empty version");
    return version;
  } catch {
    throw new ClosureUpdateError(
      "Closure release metadata URL contains an invalid immutable version endpoint",
    );
  }
}

/** Resolve first-install launch authority only from an immutable exact metadata endpoint. */
export function resolveClosureImmutableMetadataVersion(metadataUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(metadataUrl);
  } catch {
    throw new ClosureUpdateError("Closure release metadata URL must be an absolute http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ClosureUpdateError("Closure release metadata URL must be an absolute http(s) URL");
  }
  const version = closureImmutableMetadataVersion(parsed);
  if (version == null) {
    throw new ClosureUpdateError(
      "Closure first-install release binding requires an immutable /versions/<version>/metadata.json URL",
    );
  }
  return version;
}
