export const OPEN_DESIGN_PRODUCT_RUNTIME_SCHEMA_VERSION = 1 as const;
export const OPEN_DESIGN_PRODUCT_RUNTIME_COMMAND = "open-design.product-runtime.read.v1" as const;

export type OpenDesignProductRuntimeReadRequest = Readonly<{
  schemaVersion: typeof OPEN_DESIGN_PRODUCT_RUNTIME_SCHEMA_VERSION;
  operation: "read";
}>;

export type OpenDesignProductRuntimeProjection = Readonly<{
  schemaVersion: typeof OPEN_DESIGN_PRODUCT_RUNTIME_SCHEMA_VERSION;
  web: Readonly<{ url: string }>;
  daemon: Readonly<{ url: string }>;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields must be exactly ${wanted.join(",")}`);
  }
}

function loopbackHttpUrl(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a URL`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a URL`);
  }
  if (parsed.protocol !== "http:"
    || !new Set(["127.0.0.1", "localhost", "[::1]"]).has(parsed.hostname)
    || parsed.username.length > 0
    || parsed.password.length > 0
    || parsed.hash.length > 0) {
    throw new Error(`${label} must be an uncredentialed loopback HTTP URL`);
  }
  return parsed.href;
}

export function validateOpenDesignProductRuntimeReadRequest(
  input: unknown,
): OpenDesignProductRuntimeReadRequest {
  const value = record(input, "OpenDesign product runtime request");
  exactKeys(value, ["operation", "schemaVersion"], "OpenDesign product runtime request");
  if (value.schemaVersion !== OPEN_DESIGN_PRODUCT_RUNTIME_SCHEMA_VERSION || value.operation !== "read") {
    throw new Error("unsupported OpenDesign product runtime request");
  }
  return Object.freeze({ schemaVersion: 1, operation: "read" });
}

function endpoint(input: unknown, label: string): Readonly<{ url: string }> {
  const value = record(input, label);
  exactKeys(value, ["url"], label);
  return Object.freeze({ url: loopbackHttpUrl(value.url, `${label} URL`) });
}

export function validateOpenDesignProductRuntimeProjection(
  input: unknown,
): OpenDesignProductRuntimeProjection {
  const value = record(input, "OpenDesign product runtime projection");
  exactKeys(value, ["daemon", "schemaVersion", "web"], "OpenDesign product runtime projection");
  if (value.schemaVersion !== OPEN_DESIGN_PRODUCT_RUNTIME_SCHEMA_VERSION) {
    throw new Error("unsupported OpenDesign product runtime projection");
  }
  return Object.freeze({
    schemaVersion: 1,
    web: endpoint(value.web, "OpenDesign Web endpoint"),
    daemon: endpoint(value.daemon, "OpenDesign daemon endpoint"),
  });
}
