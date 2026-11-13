// Pure helpers shared by the web Settings form and the daemon for the Amazon
// Bedrock BYOK protocol. No I/O: everything here derives from the endpoint
// URL and the model id the user typed.
//
// Bedrock is regional, and the BYOK form has exactly one URL field, so the
// region is read from the `bedrock-runtime` hostname instead of a second
// field the two surfaces would have to keep in sync. Custom endpoints that
// do not carry a region in their hostname fall back to
// `BEDROCK_DEFAULT_REGION`, which the Settings form calls out.

export const BEDROCK_DEFAULT_REGION = 'us-east-1';

/** Regional Bedrock runtime endpoint for the given region. */
export function bedrockRuntimeEndpoint(region: string): string {
  return `https://bedrock-runtime.${region}.amazonaws.com`;
}

// `bedrock-runtime.<region>.amazonaws.com`, the FIPS variant, the China
// partition, the `*.api.aws` dual-stack hosts and VPC interface endpoints
// (`bedrock-runtime.<region>.vpce-<id>.amazonaws.com`) all carry the region
// as the label right after the service name.
const BEDROCK_RUNTIME_HOST_RE =
  /^bedrock-runtime(?:-fips)?\.([a-z]{2}(?:-gov|-iso[a-z]?)?-[a-z]+-\d)(?:\.vpce-[a-z0-9-]+)?\.(?:amazonaws\.com(?:\.cn)?|api\.aws)$/;

/**
 * Region encoded in a Bedrock runtime endpoint hostname, or `null` when the
 * URL is not a recognizable Bedrock runtime host (custom domain, proxy,
 * empty value).
 */
export function bedrockRegionFromBaseUrl(baseUrl: string): string | null {
  const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!trimmed) return null;
  try {
    const hostname = new URL(trimmed).hostname.toLowerCase();
    const match = BEDROCK_RUNTIME_HOST_RE.exec(hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isBedrockRuntimeBaseUrl(baseUrl: string): boolean {
  return bedrockRegionFromBaseUrl(baseUrl) !== null;
}

/**
 * Region the daemon should use for a Bedrock BYOK config: the one encoded in
 * the endpoint, or the default when the endpoint does not carry one.
 */
export function resolveBedrockRegion(baseUrl: string | null | undefined): string {
  return bedrockRegionFromBaseUrl(baseUrl ?? '') ?? BEDROCK_DEFAULT_REGION;
}

const CROSS_REGION_PREFIXES = ['global.', 'us.', 'eu.', 'jp.', 'apac.', 'au.'];

/**
 * Inference identifier Bedrock actually accepts for a model in a region.
 *
 * Newer foundation models are only served through cross-region inference
 * profiles (`us.anthropic...`, `eu.amazon.nova-...`), so a bare foundation
 * model id fails with "on-demand throughput isn't supported" outside the
 * few regions that still serve it directly. OpenCode applies this mapping
 * on the run path (its `amazon-bedrock` loader); the daemon mirrors it for
 * the connection smoke test so "Test connection" exercises the same id the
 * run will use. ARNs (application inference profiles) and ids that already
 * carry a cross-region prefix pass through untouched.
 */
export function bedrockInferenceModelId(model: string, region: string): string {
  const modelId = model.trim();
  if (!modelId) return modelId;
  if (modelId.startsWith('arn:')) return modelId;
  if (CROSS_REGION_PREFIXES.some((prefix) => modelId.startsWith(prefix))) return modelId;

  const includesAny = (needles: string[]) => needles.some((needle) => modelId.includes(needle));
  const regionPrefix = region.split('-')[0];
  switch (regionPrefix) {
    case 'us': {
      if (region.startsWith('us-gov')) return modelId;
      if (
        includesAny([
          'nova-micro',
          'nova-lite',
          'nova-pro',
          'nova-premier',
          'nova-2',
          'claude',
          'deepseek.r1',
        ])
      ) {
        return `us.${modelId}`;
      }
      return modelId;
    }
    case 'eu': {
      const regionRequiresPrefix = [
        'eu-west-1',
        'eu-west-2',
        'eu-west-3',
        'eu-north-1',
        'eu-central-1',
        'eu-south-1',
        'eu-south-2',
      ].includes(region);
      if (
        regionRequiresPrefix &&
        includesAny(['claude', 'nova-lite', 'nova-micro', 'llama3', 'pixtral'])
      ) {
        return `eu.${modelId}`;
      }
      return modelId;
    }
    case 'ap': {
      const isAustralia = region === 'ap-southeast-2' || region === 'ap-southeast-4';
      const isTokyo = region === 'ap-northeast-1';
      if (isAustralia) {
        if (includesAny(['anthropic.claude-sonnet-4-5', 'anthropic.claude-haiku'])) {
          return `au.${modelId}`;
        }
        return modelId;
      }
      // Regions served by the APAC geographic profiles (Bedrock cross-region
      // inference docs). Hong Kong (ap-east-1) and New Zealand (ap-southeast-6)
      // are not, so a bare id is the only valid form there.
      const regionRequiresPrefix = [
        'ap-northeast-1',
        'ap-northeast-2',
        'ap-northeast-3',
        'ap-south-1',
        'ap-south-2',
        'ap-southeast-1',
        'ap-southeast-3',
        'ap-southeast-5',
        'ap-southeast-7',
        'ap-east-2',
      ].includes(region);
      if (regionRequiresPrefix && includesAny(['claude', 'nova-lite', 'nova-micro', 'nova-pro'])) {
        return `${isTokyo ? 'jp' : 'apac'}.${modelId}`;
      }
      return modelId;
    }
    default:
      return modelId;
  }
}
