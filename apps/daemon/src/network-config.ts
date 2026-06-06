export function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isNetworkExposed(bindHost: string): boolean {
  return bindHost !== "127.0.0.1" && bindHost !== "::1" && bindHost !== "localhost";
}
