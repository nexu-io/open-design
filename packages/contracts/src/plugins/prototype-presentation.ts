import { z } from 'zod';

/** First prototype profile that freezes presentation separately from viewport. */
export const OD_NEXT_PROTOTYPE_PRESENTATION_PROFILE_VERSION = '2.3.0' as const;

export const PrototypePresentationV1Schema = z.object({
  productSurface: z.enum(['website', 'web-app', 'mobile-app', 'desktop-app', 'tablet-app']),
  viewport: z.enum(['responsive', 'phone', 'desktop', 'tablet']),
  deviceFrame: z.enum(['none', 'ios', 'android', 'mobile-neutral']),
  frameSource: z.enum(['none', 'mobile-app-default', 'user-request', 'existing-artifact']),
}).strict().superRefine((value, context) => {
  if (value.deviceFrame === 'none' && value.frameSource !== 'none') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['frameSource'],
      message: 'A presentation without a device frame must use frameSource "none".',
    });
  } else if (value.deviceFrame !== 'none' && value.frameSource === 'none') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['frameSource'],
      message: 'A device frame requires an explicit frameSource.',
    });
  }
  if (value.frameSource === 'mobile-app-default' && value.productSurface !== 'mobile-app') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['frameSource'],
      message: 'Only a mobile-app presentation may use the mobile-app-default frame source; other surfaces require user-request or existing-artifact.',
    });
  }
});
export type PrototypePresentationV1 = z.infer<typeof PrototypePresentationV1Schema>;

/** Unknown historical version labels retain the existing permissive contract. */
export function prototypeProfileRequiresPresentation(taskProfileVersion: string): boolean {
  const parts = /^(\d+)\.(\d+)\.(\d+)(?:[-+][\w.-]+)?$/.exec(taskProfileVersion);
  if (!parts) return false;
  const minimum = OD_NEXT_PROTOTYPE_PRESENTATION_PROFILE_VERSION.split('.').map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    const current = Number(parts[index + 1]);
    const required = minimum[index]!;
    if (current !== required) return current > required;
  }
  return true;
}

export function parsePrototypePresentation(value: unknown): PrototypePresentationV1 | null {
  const result = PrototypePresentationV1Schema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Read a presentation from an accepted Plan Contract. This is not plan
 * validation: new profiles must pass OpenDesignPlanContractV2Schema first.
 * Missing or unrecognized legacy presentation data has no inferred default.
 */
export function readPrototypePresentationFromPlan(plan: unknown): PrototypePresentationV1 | null {
  if (!isRecord(plan) || !isRecord(plan['taskProfile'])) return null;
  const profile = plan['taskProfile'];
  if (profile['taskType'] !== 'prototype' || !isRecord(profile['taskSpecific'])) return null;
  return parsePrototypePresentation(profile['taskSpecific']['presentation']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
