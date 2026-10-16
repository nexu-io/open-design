// Real OpenCode error frames from 0.24.x diagnostic bundles (OPEND-3527), response
// headers dropped. The provider's reason lives only in statusCode / isRetryable /
// responseBody; error.data.message is the generic "Provider returned error".
export const OPENCODE_CONTEXT_OVERFLOW_FRAME = {
  "type": "error",
  "timestamp": 1790568788004,
  "sessionID": "ses_f19c8ab96ffeD3JmVRBZkWcAQw",
  "error": {
    "name": "APIError",
    "data": {
      "message": "Provider returned error",
      "statusCode": 400,
      "isRetryable": false,
      "responseBody": "{\"error\":{\"message\":\"Provider returned error\",\"code\":400,\"metadata\":{\"raw\":\"{\\\"code\\\":\\\"500\\\",\\\"message\\\":\\\"{code=400, message=The input (268498 tokens) is longer than the model's context length (262144 tokens)., param=null, type=BadRequestError, integerCode=400} trace_id: acb450258c39260b7560de3f0210a147\\\",\\\"type\\\":\\\"invalid_request_error\\\"}\\n\",\"provider_name\":\"Novita\",\"is_byok\":false}},\"user_id\":\"org_3DeubhFJKl58JLlJVDcgn55o6VL\"}",
      "metadata": {
        "url": "https://openrouter.ai/api/v1/chat/completions"
      }
    }
  }
};
export const OPENCODE_RATE_LIMIT_FRAME = {
  "type": "error",
  "timestamp": 1790415928454,
  "sessionID": "ses_f22e51a08ffeFZ77GAvzSmf7D6",
  "error": {
    "name": "APIError",
    "data": {
      "message": "Provider returned error",
      "statusCode": 429,
      "isRetryable": true,
      "responseBody": "{\"error\":{\"message\":\"Provider returned error\",\"code\":429,\"metadata\":{\"raw\":\"google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations\",\"provider_name\":\"Google AI Studio\",\"is_byok\":false,\"provider_error_code\":\"429\",\"limit_source\":\"upstream_provider_shared_pool\",\"remedy_hint\":\"Retry shortly, add your own provider key (https://openrouter.ai/settings/integrations), or route to another provider with provider routing: https://openrouter.ai/docs/features/provider-routing\"}},\"user_id\":\"user_389XLprOsJBd0oA5jOeQnM6A9jU\"}",
      "metadata": {
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "retryExhausted": "true",
        "retryAttempts": "2",
        "totalAttempts": "3"
      }
    }
  }
};
export const OPENCODE_INSUFFICIENT_FUNDS_FRAME = {
  "type": "error",
  "timestamp": 1790641273685,
  "sessionID": "ses_f15779e86ffeBfTi8XC6ir2Bjk",
  "error": {
    "name": "APIError",
    "data": {
      "message": "Upstream request failed: Insufficient account funds",
      "statusCode": 402,
      "isRetryable": false,
      "responseBody": "{\"error\":{\"type\":\"server_error\",\"message\":\"Upstream request failed: Insufficient account funds\"}}",
      "metadata": {
        "url": "https://opencode.ai/zen/v1/responses"
      }
    }
  }
};
