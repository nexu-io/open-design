import { describe, expect, it } from 'vitest';

import {
  DESIGN_SYSTEM_COMPONENTS_SCHEMA_VERSION,
  DESIGN_SYSTEM_COMPONENT_SCHEMA_VERSION,
  DESIGN_SYSTEM_INTENT_MAP_SCHEMA_VERSION,
  DesignSystemAdherenceRequestSchema,
  DesignSystemComponentDefinitionSchema,
  DesignSystemRuntimePathsSchema,
  resolveDesignSystemIntentForGeneration,
  validateDesignSystemRuntimeReferences,
  type DesignSystemComponentsIndex,
  type DesignSystemIntentMap,
  type DesignSystemRuntimeBundle,
} from '../../src/design-systems/runtime-schema.js';

const button = DesignSystemComponentDefinitionSchema.parse({
  schemaVersion: DESIGN_SYSTEM_COMPONENT_SCHEMA_VERSION,
  id: 'Button',
  name: 'Button',
  selectors: ['.button'],
  variants: {
    primary: { selectors: ['.button--primary'] },
  },
  properties: {
    label: { type: 'string', required: true },
  },
  states: {
    focus: { selectors: ['.button:focus-visible'], required: true },
  },
  implementation: '<button class="button">{{label}}</button>',
});

const componentsIndex: DesignSystemComponentsIndex = {
  schemaVersion: DESIGN_SYSTEM_COMPONENTS_SCHEMA_VERSION,
  components: [{ id: 'Button', path: 'components/Button/component.json' }],
};

function runtimeBundle(mappings: DesignSystemIntentMap['mappings']): DesignSystemRuntimeBundle {
  return {
    paths: {
      components: 'manifests/components.json',
      intents: 'manifests/intent-map.json',
      lint: 'rules/lint.json',
      fallback: 'rules/fallback.json',
    },
    componentsIndex,
    components: [{ path: 'components/Button/component.json', definition: button }],
    intentMap: {
      schemaVersion: DESIGN_SYSTEM_INTENT_MAP_SCHEMA_VERSION,
      mappings,
    },
    lint: {
      schemaVersion: 'od-design-system-lint/v1',
      requireMappedComponentReuse: true,
      requireTokenReferences: true,
      forbidUnauthorizedColorLiteralsOutsideTokenDefinitions: true,
      requireDeclaredStates: true,
    },
    fallback: {
      schemaVersion: 'od-design-system-fallback/v1',
      noMatch: {
        action: 'request-human-confirmation',
        allowInventComponent: false,
        outputMarker: 'data-ds-fallback="no-match"',
      },
      multipleMatches: {
        action: 'prefer-priority-then-request-human',
        allowInventComponent: false,
      },
    },
  };
}

describe('design-system runtime schema', () => {
  it('accepts a complete set of safe manifest paths', () => {
    expect(DesignSystemRuntimePathsSchema.parse({
      components: 'manifests/components.json',
      intents: 'manifests/intent-map.json',
      lint: 'rules/lint.json',
      fallback: 'rules/fallback.json',
    })).toEqual({
      components: 'manifests/components.json',
      intents: 'manifests/intent-map.json',
      lint: 'rules/lint.json',
      fallback: 'rules/fallback.json',
    });
  });

  it('rejects traversal, duplicate paths, and partial runtime declarations', () => {
    const unsafeResult = DesignSystemRuntimePathsSchema.safeParse({
      components: '../components.json',
      intents: 'rules/shared.json',
      lint: 'rules/shared.json',
      fallback: 'rules/fallback.json',
    });

    expect(unsafeResult.success).toBe(false);
    if (unsafeResult.success) return;
    expect(unsafeResult.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('safe relative path'),
      expect.stringContaining('duplicate runtime path'),
    ]));

    const partialResult = DesignSystemRuntimePathsSchema.safeParse({
      components: 'manifests/components.json',
      intents: 'manifests/intent-map.json',
      lint: 'rules/lint.json',
    });
    expect(partialResult.success).toBe(false);
    if (!partialResult.success) {
      expect(partialResult.error.issues.map((issue) => issue.message)).toContain('Required');
    }
  });

  it('accepts bounded project-relative adherence inputs and rejects traversal', () => {
    expect(DesignSystemAdherenceRequestSchema.parse({
      intent: 'account.settings.save',
      artifacts: ['account-settings.html', 'styles/account-settings.css'],
    })).toEqual({
      intent: 'account.settings.save',
      artifacts: ['account-settings.html', 'styles/account-settings.css'],
    });
    expect(DesignSystemAdherenceRequestSchema.safeParse({
      intent: 'account.settings.save',
      artifacts: ['../outside.html'],
    }).success).toBe(false);
    expect(DesignSystemAdherenceRequestSchema.safeParse({
      intent: 'account.settings.save',
      artifacts: ['account-settings.html', 'account-settings.html'],
    }).success).toBe(false);
  });

  it('validates component, variant, property, and state references across files', () => {
    const validIntentMap: DesignSystemIntentMap = {
      schemaVersion: DESIGN_SYSTEM_INTENT_MAP_SCHEMA_VERSION,
      mappings: [{
        intent: 'account.settings.save',
        component: 'Button',
        variant: 'primary',
        properties: { label: 'Save' },
        states: ['focus'],
      }],
    };
    expect(validateDesignSystemRuntimeReferences({
      componentsIndex,
      components: [{ path: 'components/Button/component.json', definition: button }],
      intentMap: validIntentMap,
    })).toEqual([]);

    const invalidIntentMap: DesignSystemIntentMap = {
      ...validIntentMap,
      mappings: [{
        ...validIntentMap.mappings[0]!,
        variant: 'danger',
        properties: { icon: 'trash' },
        states: ['loading'],
      }],
    };
    expect(validateDesignSystemRuntimeReferences({
      componentsIndex,
      components: [{ path: 'components/Button/component.json', definition: button }],
      intentMap: invalidIntentMap,
    })).toEqual([
      'intent mapping account.settings.save at index 0 references unknown variant danger on Button',
      'intent mapping account.settings.save at index 0 references unknown property icon on Button',
      'intent mapping account.settings.save at index 0 references unknown state loading on Button',
    ]);
  });

  it('turns an intent match into a concrete component reuse decision', () => {
    const result = resolveDesignSystemIntentForGeneration(runtimeBundle([{
      intent: 'account.settings.save',
      component: 'Button',
      variant: 'primary',
      properties: { label: 'Save' },
      priority: 100,
    }]), 'account.settings.save');

    expect(result).toMatchObject({
      status: 'matched',
      reason: 'single-match',
      action: 'reuse-components',
      allowInventComponent: false,
      matches: [{
        component: { id: 'Button', implementation: expect.stringContaining('<button') },
        variant: { id: 'primary' },
        properties: { label: 'Save' },
        states: [{ id: 'focus', required: true }],
      }],
    });
  });

  it('returns the declared no-match fallback instead of silently inventing a component', () => {
    const result = resolveDesignSystemIntentForGeneration(runtimeBundle([{
      intent: 'account.settings.save',
      component: 'Button',
    }]), 'workspace.delete.confirm');

    expect(result).toEqual({
      intent: 'workspace.delete.confirm',
      status: 'confirmation-required',
      reason: 'no-match',
      action: 'request-human-confirmation',
      allowInventComponent: false,
      outputMarker: 'data-ds-fallback="no-match"',
      matches: [],
    });
  });

  it('uses a unique highest-priority mapping and asks for confirmation on a tie', () => {
    const preferred = runtimeBundle([
      { intent: 'account.settings.save', component: 'Button', priority: 100 },
      { intent: 'account.settings.save', component: 'Button', priority: 10 },
    ]);
    expect(resolveDesignSystemIntentForGeneration(preferred, 'account.settings.save')).toMatchObject({
      status: 'matched',
      reason: 'highest-priority',
      matches: [{ priority: 100 }],
    });

    const tied = runtimeBundle([
      { intent: 'account.settings.save', component: 'Button', priority: 100 },
      { intent: 'account.settings.save', component: 'Button', priority: 100 },
    ]);
    expect(resolveDesignSystemIntentForGeneration(tied, 'account.settings.save')).toMatchObject({
      status: 'confirmation-required',
      reason: 'ambiguous',
      matches: [{ priority: 100 }, { priority: 100 }],
    });
  });
});
