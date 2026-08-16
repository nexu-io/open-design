import { describe, expectTypeOf, it } from 'vitest';

import type {
  ResolveDesignSystemIntentApiResponse,
  ResolveDesignSystemIntentRequest,
  ResolveDesignSystemIntentResponse,
  ValidateDesignSystemAdherenceApiResponse,
  ValidateDesignSystemAdherenceRequest,
  ValidateDesignSystemAdherenceResponse,
} from '../../src/index.js';

describe('design-system tool API contract', () => {
  it('shares the resolve-intent request and response envelope', () => {
    expectTypeOf<ResolveDesignSystemIntentRequest>().toMatchTypeOf<{
      intent: string;
      designSystemId?: string;
    }>();
    expectTypeOf<ResolveDesignSystemIntentResponse>().toMatchTypeOf<{
      designSystemId: string;
      runtime: 'structured';
    }>();
    expectTypeOf<ResolveDesignSystemIntentApiResponse>().toMatchTypeOf<
      ResolveDesignSystemIntentResponse | { error: { code: string; message: string } }
    >();
  });

  it('shares the validate-adherence request and response envelope', () => {
    expectTypeOf<ValidateDesignSystemAdherenceRequest>().toMatchTypeOf<{
      intent: string;
      artifacts: string[];
      designSystemId?: string;
    }>();
    expectTypeOf<ValidateDesignSystemAdherenceResponse>().toMatchTypeOf<{
      designSystemId: string;
      runtime: 'structured';
      report: { status: 'passed' | 'failed' | 'confirmation-required' };
    }>();
    expectTypeOf<ValidateDesignSystemAdherenceApiResponse>().toMatchTypeOf<
      ValidateDesignSystemAdherenceResponse | { error: { code: string; message: string } }
    >();
  });
});
