type JsonObject = Record<string, unknown>;

export interface DeploymentLike {
  providerId?: string | null;
  url?: string | null;
  providerMetadata?: JsonObject | null;
  cloudflarePages?: JsonObject | null;
  [key: string]: unknown;
}

type PublicDeploymentOptions = {
  includeDisplayDevRecipients?: boolean;
  includeDisplayDevClaimUrl?: boolean;
};

export function publicDeployment<T extends DeploymentLike>(
  deployment: T,
  options?: PublicDeploymentOptions,
): Omit<T, 'providerMetadata'>;
export function publicDeployment<T>(deployment: T, options?: PublicDeploymentOptions): T;
export function publicDeployment(
  deployment: unknown,
  options: PublicDeploymentOptions = {},
): unknown {
  if (!deployment || typeof deployment !== 'object') return deployment;
  const { providerMetadata: _providerMetadata, ...publicShape } = deployment as DeploymentLike;
  const displayDev = asRecord((deployment as DeploymentLike).providerMetadata?.displayDev);
  if (displayDev) {
    if (displayDev.mode === 'authenticated') {
      const shortId = typeof displayDev.shortId === 'string' ? displayDev.shortId.trim() : '';
      const visibility = isDisplayDevVisibility(displayDev.visibility) ? displayDev.visibility : null;
      const sharedWith = isStringArray(displayDev.sharedWith)
        ? displayDev.sharedWith.map((item) => item.trim()).filter(Boolean)
        : null;
      if (options.includeDisplayDevRecipients && shortId && visibility && sharedWith) {
        (publicShape as DeploymentLike).displayDev = {
          mode: 'authenticated',
          shortId,
          visibility,
          sharedWith,
        };
      } else if (shortId) {
        (publicShape as DeploymentLike).displayDev = {
          mode: 'authenticated',
          shortId,
          accessSettingsMissing: true,
        };
      }
    } else {
      const shortId = typeof displayDev.shortId === 'string' ? displayDev.shortId.trim() : '';
      const claimUrl = typeof displayDev.claimUrl === 'string' ? displayDev.claimUrl.trim() : '';
      if (shortId && (claimUrl || !options.includeDisplayDevClaimUrl)) {
        (publicShape as DeploymentLike).displayDev = {
          shortId,
          mode: 'anonymous',
          ...(options.includeDisplayDevClaimUrl
            ? { claimUrl }
            : { claimUrlRedacted: true }),
          ...(typeof displayDev.expiresAt === 'string' ? { expiresAt: displayDev.expiresAt } : {}),
        };
      }
    }
  }
  return publicShape;
}

export function publicDeployments<T extends DeploymentLike>(
  deployments: readonly T[] | null | undefined,
): Array<Omit<T, 'providerMetadata'>> {
  return (deployments || []).map((deployment) => publicDeployment(deployment));
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): JsonObject | null {
  return isRecord(value) ? value : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isDisplayDevVisibility(value: unknown): value is 'public' | 'company' | 'private' {
  return value === 'public' || value === 'company' || value === 'private';
}
