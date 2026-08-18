import { z } from 'zod';

export const DESIGN_SYSTEM_COMPONENTS_SCHEMA_VERSION = 'od-design-system-components/v1' as const;
export const DESIGN_SYSTEM_COMPONENT_SCHEMA_VERSION = 'od-design-system-component/v1' as const;
export const DESIGN_SYSTEM_INTENT_MAP_SCHEMA_VERSION = 'od-design-system-intents/v1' as const;
export const DESIGN_SYSTEM_LINT_SCHEMA_VERSION = 'od-design-system-lint/v1' as const;
export const DESIGN_SYSTEM_FALLBACK_SCHEMA_VERSION = 'od-design-system-fallback/v1' as const;
export const DESIGN_SYSTEM_ADHERENCE_SCHEMA_VERSION = 'od-design-system-adherence/v1' as const;

const NonEmptyStringSchema = z.string().trim().min(1);
const ComponentIdSchema = NonEmptyStringSchema.regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const IntentSchema = NonEmptyStringSchema.regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
const JsonPrimitiveSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const DesignSystemIntentIdSchema = IntentSchema;

export function isSafeDesignSystemRuntimePath(value: string): boolean {
  if (value.length === 0 || value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false;
  if (value.includes('\\')) return false;
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

const SafeRelativePathSchema = NonEmptyStringSchema.refine(isSafeDesignSystemRuntimePath, {
  message: 'must be a safe relative path without empty, ".", or ".." segments',
});

export const DesignSystemRuntimePathsSchema = z.object({
  components: SafeRelativePathSchema,
  intents: SafeRelativePathSchema,
  lint: SafeRelativePathSchema,
  fallback: SafeRelativePathSchema,
}).strict().superRefine((value, ctx) => {
  reportDuplicates(Object.values(value), 'runtime path', ctx);
});

export type DesignSystemRuntimePaths = z.infer<typeof DesignSystemRuntimePathsSchema>;

export const DesignSystemComponentsIndexSchema = z.object({
  schemaVersion: z.literal(DESIGN_SYSTEM_COMPONENTS_SCHEMA_VERSION),
  components: z.array(z.object({
    id: ComponentIdSchema,
    path: SafeRelativePathSchema,
  }).strict()).min(1),
}).strict().superRefine((value, ctx) => {
  reportDuplicates(value.components.map((component) => component.id), 'component id', ctx);
  reportDuplicates(value.components.map((component) => component.path), 'component path', ctx);
});

export type DesignSystemComponentsIndex = z.infer<typeof DesignSystemComponentsIndexSchema>;

export const DesignSystemComponentPropertySchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'enum']),
  description: NonEmptyStringSchema.optional(),
  required: z.boolean().optional(),
  values: z.array(JsonPrimitiveSchema).min(1).optional(),
  default: JsonPrimitiveSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === 'enum' && value.values === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: 'is required when property type is enum',
    });
  }
  if (value.type !== 'enum' && value.values !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: 'is only supported when property type is enum',
    });
  }
  if (value.default !== undefined && !matchesPropertyType(value, value.default)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['default'],
      message: `does not match property type ${value.type}`,
    });
  }
});

export type DesignSystemComponentProperty = z.infer<typeof DesignSystemComponentPropertySchema>;

export const DesignSystemComponentVariantSchema = z.object({
  description: NonEmptyStringSchema.optional(),
  selectors: z.array(NonEmptyStringSchema).min(1),
  properties: z.record(JsonPrimitiveSchema).optional(),
}).strict();

export type DesignSystemComponentVariant = z.infer<typeof DesignSystemComponentVariantSchema>;

export const DesignSystemComponentStateSchema = z.object({
  description: NonEmptyStringSchema.optional(),
  selectors: z.array(NonEmptyStringSchema).min(1),
  required: z.boolean().optional(),
}).strict();

export type DesignSystemComponentState = z.infer<typeof DesignSystemComponentStateSchema>;

export const DesignSystemComponentDefinitionSchema = z.object({
  schemaVersion: z.literal(DESIGN_SYSTEM_COMPONENT_SCHEMA_VERSION),
  id: ComponentIdSchema,
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema.optional(),
  selectors: z.array(NonEmptyStringSchema).min(1),
  variants: z.record(DesignSystemComponentVariantSchema).optional(),
  properties: z.record(DesignSystemComponentPropertySchema).optional(),
  states: z.record(DesignSystemComponentStateSchema).optional(),
  implementation: NonEmptyStringSchema,
  source: SafeRelativePathSchema.optional(),
}).strict().superRefine((value, ctx) => {
  validateNamedRecord(value.variants, 'variants', ctx);
  validateNamedRecord(value.properties, 'properties', ctx);
  validateNamedRecord(value.states, 'states', ctx);
});

export type DesignSystemComponentDefinition = z.infer<typeof DesignSystemComponentDefinitionSchema>;

export const DesignSystemIntentMapSchema = z.object({
  schemaVersion: z.literal(DESIGN_SYSTEM_INTENT_MAP_SCHEMA_VERSION),
  mappings: z.array(z.object({
    intent: IntentSchema,
    component: ComponentIdSchema,
    variant: NonEmptyStringSchema.optional(),
    properties: z.record(JsonPrimitiveSchema).optional(),
    states: z.array(NonEmptyStringSchema).optional(),
    minInstances: z.number().int().positive().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    description: NonEmptyStringSchema.optional(),
  }).strict()).min(1),
}).strict();

export type DesignSystemIntentMap = z.infer<typeof DesignSystemIntentMapSchema>;
export type DesignSystemIntentMapping = DesignSystemIntentMap['mappings'][number];

export const DesignSystemLintRulesSchema = z.object({
  schemaVersion: z.literal(DESIGN_SYSTEM_LINT_SCHEMA_VERSION),
  requireMappedComponentReuse: z.boolean(),
  requireTokenReferences: z.boolean(),
  forbidUnauthorizedColorLiteralsOutsideTokenDefinitions: z.boolean(),
  requireDeclaredStates: z.boolean(),
}).strict();

export type DesignSystemLintRules = z.infer<typeof DesignSystemLintRulesSchema>;

export const DesignSystemFallbackRulesSchema = z.object({
  schemaVersion: z.literal(DESIGN_SYSTEM_FALLBACK_SCHEMA_VERSION),
  noMatch: z.object({
    action: z.enum(['request-human-confirmation', 'use-neutral-placeholder', 'allow-generation']),
    allowInventComponent: z.boolean(),
    outputMarker: NonEmptyStringSchema.optional(),
  }).strict(),
  multipleMatches: z.object({
    action: z.enum(['prefer-highest-priority', 'request-human-confirmation', 'prefer-priority-then-request-human']),
    allowInventComponent: z.boolean(),
  }).strict(),
}).strict();

export type DesignSystemFallbackRules = z.infer<typeof DesignSystemFallbackRulesSchema>;

export type LoadedDesignSystemComponent = {
  path: string;
  definition: DesignSystemComponentDefinition;
};

export type DesignSystemRuntimeBundle = {
  paths: DesignSystemRuntimePaths;
  componentsIndex: DesignSystemComponentsIndex;
  components: LoadedDesignSystemComponent[];
  intentMap: DesignSystemIntentMap;
  lint: DesignSystemLintRules;
  fallback: DesignSystemFallbackRules;
};

export function validateDesignSystemRuntimeReferences(input: {
  componentsIndex: DesignSystemComponentsIndex;
  components: readonly LoadedDesignSystemComponent[];
  intentMap: DesignSystemIntentMap;
}): string[] {
  const errors: string[] = [];
  const indexedById = new Map(input.componentsIndex.components.map((component) => [component.id, component]));
  const loadedById = new Map(input.components.map((component) => [component.definition.id, component]));

  for (const entry of input.componentsIndex.components) {
    const loaded = input.components.find((component) => component.path === entry.path);
    if (loaded === undefined) {
      errors.push(`components index entry ${entry.id} could not load ${entry.path}`);
      continue;
    }
    if (loaded.definition.id !== entry.id) {
      errors.push(`components index entry ${entry.id} points to ${entry.path}, whose component id is ${loaded.definition.id}`);
    }
  }

  for (const loaded of input.components) {
    const indexed = indexedById.get(loaded.definition.id);
    if (indexed === undefined) {
      errors.push(`component ${loaded.definition.id} from ${loaded.path} is not declared in the components index`);
    } else if (indexed.path !== loaded.path) {
      errors.push(`component ${loaded.definition.id} was loaded from ${loaded.path}, but the index declares ${indexed.path}`);
    }
    for (const [variantId, variant] of Object.entries(loaded.definition.variants ?? {})) {
      for (const [property, propertyValue] of Object.entries(variant.properties ?? {})) {
        const propertyDefinition = loaded.definition.properties?.[property];
        if (propertyDefinition === undefined) {
          errors.push(`component ${loaded.definition.id} variant ${variantId} references unknown property ${property}`);
        } else if (!matchesPropertyType(propertyDefinition, propertyValue)) {
          errors.push(`component ${loaded.definition.id} variant ${variantId} property ${property} does not match its ${propertyDefinition.type} definition`);
        }
      }
    }
  }

  input.intentMap.mappings.forEach((mapping, index) => {
    const label = `intent mapping ${mapping.intent} at index ${index}`;
    const loaded = loadedById.get(mapping.component);
    if (loaded === undefined) {
      errors.push(`${label} references unknown component ${mapping.component}`);
      return;
    }
    const definition = loaded.definition;
    if (mapping.variant !== undefined && definition.variants?.[mapping.variant] === undefined) {
      errors.push(`${label} references unknown variant ${mapping.variant} on ${mapping.component}`);
    }
    for (const property of Object.keys(mapping.properties ?? {})) {
      const propertyDefinition = definition.properties?.[property];
      if (propertyDefinition === undefined) {
        errors.push(`${label} references unknown property ${property} on ${mapping.component}`);
      } else if (!matchesPropertyType(propertyDefinition, mapping.properties?.[property])) {
        errors.push(`${label} property ${property} does not match its ${propertyDefinition.type} definition on ${mapping.component}`);
      }
    }
    for (const state of mapping.states ?? []) {
      if (definition.states?.[state] === undefined) {
        errors.push(`${label} references unknown state ${state} on ${mapping.component}`);
      }
    }
  });

  return errors;
}

export type DesignSystemIntentSelection = {
  intent: string;
  component: {
    id: string;
    name: string;
    description?: string;
    selectors: string[];
    implementation: string;
    source?: string;
  };
  variant?: {
    id: string;
    description?: string;
    selectors: string[];
    properties?: Record<string, string | number | boolean | null>;
  };
  properties: Record<string, string | number | boolean | null>;
  propertyDefinitions: Record<string, DesignSystemComponentProperty>;
  states: Array<{
    id: string;
    description?: string;
    selectors: string[];
    required: boolean;
  }>;
  priority: number;
  minInstances: number;
};

export type DesignSystemIntentResolution =
  | { status: 'no-match'; intent: string; matches: [] }
  | { status: 'matched'; intent: string; matches: [DesignSystemIntentSelection] }
  | { status: 'ambiguous'; intent: string; matches: DesignSystemIntentSelection[] };

export type DesignSystemGenerationResolution = {
  intent: string;
  status: 'matched' | 'confirmation-required' | 'fallback';
  reason: 'single-match' | 'highest-priority' | 'no-match' | 'ambiguous';
  action:
    | 'reuse-components'
    | 'request-human-confirmation'
    | 'use-neutral-placeholder'
    | 'allow-generation';
  allowInventComponent: boolean;
  outputMarker?: string;
  matches: DesignSystemIntentSelection[];
};

export const DesignSystemAdherenceRequestSchema = z.object({
  intent: DesignSystemIntentIdSchema,
  artifacts: z.array(SafeRelativePathSchema).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  reportDuplicates(value.artifacts, 'artifact path', ctx);
});

export type DesignSystemAdherenceRequest = z.infer<typeof DesignSystemAdherenceRequestSchema>;

export type DesignSystemAdherenceCheckStatus =
  | 'passed'
  | 'failed'
  | 'needs-confirmation'
  | 'not-applicable';

export type DesignSystemAdherenceCheck = {
  id:
    | 'intent-resolution'
    | 'fallback-marker'
    | 'mapped-component-reuse'
    | 'variant-reuse'
    | 'declared-state'
    | 'token-reference'
    | 'unauthorized-token-reference'
    | 'unauthorized-color-literal';
  status: DesignSystemAdherenceCheckStatus;
  subject?: string;
  message: string;
  remediation?: string;
  evidence?: string[];
};

export type DesignSystemAdherenceReport = {
  schemaVersion: typeof DESIGN_SYSTEM_ADHERENCE_SCHEMA_VERSION;
  intent: string;
  status: 'passed' | 'failed' | 'confirmation-required';
  nextAction: 'complete' | 'fix-and-rerun' | 'request-human-confirmation';
  resolution: DesignSystemGenerationResolution;
  artifacts: Array<{
    path: string;
    size: number;
    mime?: string;
  }>;
  summary: {
    passed: number;
    failed: number;
    needsConfirmation: number;
    notApplicable: number;
  };
  checks: DesignSystemAdherenceCheck[];
};

export function resolveDesignSystemIntent(
  bundle: DesignSystemRuntimeBundle,
  intent: string,
): DesignSystemIntentResolution {
  const components = new Map(bundle.components.map((component) => [component.definition.id, component.definition]));
  const matches = bundle.intentMap.mappings
    .filter((mapping) => mapping.intent === intent)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
    .flatMap((mapping): DesignSystemIntentSelection[] => {
      const component = components.get(mapping.component);
      if (component === undefined) return [];
      const variant = mapping.variant === undefined ? undefined : component.variants?.[mapping.variant];
      const stateIds = new Set([
        ...(mapping.states ?? []),
        ...Object.entries(component.states ?? {})
          .filter(([, state]) => state.required === true)
          .map(([stateId]) => stateId),
      ]);
      const states = [...stateIds].flatMap((stateId) => {
        const state = component.states?.[stateId];
        if (state === undefined) return [];
        return [{
          id: stateId,
          ...(state.description === undefined ? {} : { description: state.description }),
          selectors: state.selectors,
          required: state.required ?? false,
        }];
      });
      return [{
        intent: mapping.intent,
        component: {
          id: component.id,
          name: component.name,
          ...(component.description === undefined ? {} : { description: component.description }),
          selectors: component.selectors,
          implementation: component.implementation,
          ...(component.source === undefined ? {} : { source: component.source }),
        },
        ...(mapping.variant === undefined || variant === undefined ? {} : {
          variant: {
            id: mapping.variant,
            ...(variant.description === undefined ? {} : { description: variant.description }),
            selectors: variant.selectors,
            ...(variant.properties === undefined ? {} : { properties: variant.properties }),
          },
        }),
        properties: mapping.properties ?? {},
        propertyDefinitions: component.properties ?? {},
        states,
        priority: mapping.priority ?? 0,
        minInstances: mapping.minInstances ?? 1,
      }];
    });

  if (matches.length === 0) return { status: 'no-match', intent, matches: [] };
  if (matches.length === 1) return { status: 'matched', intent, matches: [matches[0]!] };
  return { status: 'ambiguous', intent, matches };
}

/**
 * Apply a package's fallback policy to the raw intent matches. This is the
 * generation-facing decision: callers receive either concrete component
 * selections to reuse, an explicit human-confirmation gate, or the declared
 * no-match fallback. No caller has to reinterpret the policy prose.
 */
export function resolveDesignSystemIntentForGeneration(
  bundle: DesignSystemRuntimeBundle,
  intent: string,
): DesignSystemGenerationResolution {
  const resolution = resolveDesignSystemIntent(bundle, intent);
  if (resolution.status === 'matched') {
    return {
      intent,
      status: 'matched',
      reason: 'single-match',
      action: 'reuse-components',
      allowInventComponent: false,
      matches: resolution.matches,
    };
  }

  if (resolution.status === 'no-match') {
    const fallback = bundle.fallback.noMatch;
    return {
      intent,
      status: fallback.action === 'request-human-confirmation'
        ? 'confirmation-required'
        : 'fallback',
      reason: 'no-match',
      action: fallback.action,
      allowInventComponent: fallback.allowInventComponent,
      ...(fallback.outputMarker === undefined ? {} : { outputMarker: fallback.outputMarker }),
      matches: [],
    };
  }

  const multipleMatches = bundle.fallback.multipleMatches;
  if (multipleMatches.action === 'prefer-highest-priority') {
    return {
      intent,
      status: 'matched',
      reason: 'highest-priority',
      action: 'reuse-components',
      allowInventComponent: false,
      matches: [resolution.matches[0]!],
    };
  }

  if (
    multipleMatches.action === 'prefer-priority-then-request-human'
    && resolution.matches[0]!.priority > resolution.matches[1]!.priority
  ) {
    return {
      intent,
      status: 'matched',
      reason: 'highest-priority',
      action: 'reuse-components',
      allowInventComponent: false,
      matches: [resolution.matches[0]!],
    };
  }

  return {
    intent,
    status: 'confirmation-required',
    reason: 'ambiguous',
    action: 'request-human-confirmation',
    allowInventComponent: multipleMatches.allowInventComponent,
    matches: resolution.matches,
  };
}

function reportDuplicates(
  values: readonly string[],
  label: string,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate ${label} ${value}` });
    }
    seen.add(value);
  }
}

function validateNamedRecord(
  value: Record<string, unknown> | undefined,
  path: string,
  ctx: z.RefinementCtx,
): void {
  for (const key of Object.keys(value ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path, key],
        message: 'must be a stable identifier matching /^[A-Za-z][A-Za-z0-9_-]*$/',
      });
    }
  }
}

function matchesPropertyType(
  definition: DesignSystemComponentProperty,
  value: string | number | boolean | null | undefined,
): boolean {
  if (value === undefined) return true;
  if (definition.type === 'string') return typeof value === 'string';
  if (definition.type === 'number') return typeof value === 'number';
  if (definition.type === 'boolean') return typeof value === 'boolean';
  return definition.values?.some((candidate) => Object.is(candidate, value)) ?? false;
}
