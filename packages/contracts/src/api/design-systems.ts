import type {
  DesignSystemAdherenceReport,
  DesignSystemAdherenceRequest,
  DesignSystemGenerationResolution,
  DesignSystemLintRules,
} from '../design-systems/runtime-schema.js';

/** Request body for the agent-facing Design System 3.0 intent resolver. */
export interface ResolveDesignSystemIntentRequest {
  intent: string;
  designSystemId?: string;
}

/** Successful structured-runtime resolution returned by the daemon. */
export interface ResolveDesignSystemIntentResponse {
  designSystemId: string;
  runtime: 'structured';
  resolution: DesignSystemGenerationResolution;
  lint: DesignSystemLintRules;
}

export type ResolveDesignSystemIntentErrorCode =
  | 'DESIGN_SYSTEM_NOT_FOUND'
  | 'DESIGN_SYSTEM_DENIED'
  | 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE'
  | 'DESIGN_SYSTEM_RUNTIME_UNAVAILABLE'
  | 'DESIGN_SYSTEM_RUNTIME_INVALID'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';

export type ResolveDesignSystemIntentErrorDetails =
  | {
      requestedDesignSystemId: string;
      activeDesignSystemId: string;
    }
  | {
      workspaceId: string;
      designSystemId: string;
    }
  | {
      errors: string[];
    };

export interface ResolveDesignSystemIntentErrorResponse {
  error: {
    code: ResolveDesignSystemIntentErrorCode;
    message: string;
    details?: ResolveDesignSystemIntentErrorDetails;
  };
}

export type ResolveDesignSystemIntentApiResponse =
  | ResolveDesignSystemIntentResponse
  | ResolveDesignSystemIntentErrorResponse;

/** Request body for validating generated project files against the active DS. */
export interface ValidateDesignSystemAdherenceRequest
  extends DesignSystemAdherenceRequest {
  designSystemId?: string;
}

/** Successful adherence report returned by the daemon. */
export interface ValidateDesignSystemAdherenceResponse {
  designSystemId: string;
  runtime: 'structured';
  report: DesignSystemAdherenceReport;
}

export type ValidateDesignSystemAdherenceErrorCode =
  | ResolveDesignSystemIntentErrorCode
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_FILE_NOT_FOUND'
  | 'ARTIFACT_TOO_LARGE'
  | 'ARTIFACTS_TOO_LARGE'
  | 'UNSUPPORTED_ARTIFACT';

export interface ValidateDesignSystemAdherenceErrorResponse {
  error: {
    code: ValidateDesignSystemAdherenceErrorCode;
    message: string;
    details?: ResolveDesignSystemIntentErrorDetails;
  };
}

export type ValidateDesignSystemAdherenceApiResponse =
  | ValidateDesignSystemAdherenceResponse
  | ValidateDesignSystemAdherenceErrorResponse;
