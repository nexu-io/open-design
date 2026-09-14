import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AMR_RECHARGE_URL,
  amrAccountFailureDetails,
  classifyAmrAccountFailure,
  classifyAmrAccountFailureDetails,
  classifyAmrAccountFailureSignal,
} from '../../src/integrations/vela-errors.js';

describe('AMR account failure classification', () => {
  // The recharge link the daemon hands to the client is a real destination a
  // user clicks. Product retired the console's wallet page — balance and manual
  // top-up report on its dashboard now (vela #1055) — so pin the literal here:
  // every other assertion in this file references the constant symbolically and
  // would keep passing while pointing users at a surface the product no longer
  // navigates to.
  it('points the recharge link at the console dashboard, not a wallet page', () => {
    expect(DEFAULT_AMR_RECHARGE_URL).toBe(
      'https://open-design.ai/amr/dashboard?source=open_design',
    );
  });

  it('classifies insufficient_balance JSON-RPC failures as rechargeable AMR balance errors', () => {
    const failure = classifyAmrAccountFailure(
      'JSON-RPC error -32000: {"code":"insufficient_balance","message":"insufficient balance"}',
    );

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
    expect(failure?.message).toContain(DEFAULT_AMR_RECHARGE_URL);
    expect(amrAccountFailureDetails(failure!)).toEqual({
      kind: 'amr_account',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
  });

  it('classifies structured Vela ACP insufficient-balance details without relying on message text', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      runtime: 'opencode',
      phase: 'event_stream',
      code: 'insufficient_balance',
      accountAction: 'recharge',
      openCodeSessionId: 'ses_test',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
  });

  it('classifies structured Vela ACP recharge actions even when code is absent', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      accountAction: 'recharge',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('classifies structured tier_model_not_entitled details as an upgrade-required AMR error', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      code: 'tier_model_not_entitled',
    });

    expect(failure).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });
    expect(failure?.message).toContain('does not include this model');
  });

  it('classifies structured tier_request_kind_not_entitled details as an upgrade-required AMR error', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      code: 'tier_request_kind_not_entitled',
    });

    expect(failure).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });
    expect(failure?.message).toContain('request type');
  });

  it('classifies structured Vela ACP auth-required details without relying on message text', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      runtime: 'opencode',
      phase: 'event_stream',
      code: 'auth_required',
      accountAction: 'relogin',
      openCodeSessionId: 'ses_test',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('classifies structured Vela ACP relogin actions even when code is absent', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      accountAction: 'relogin',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('classifies structured auth-required details through the signal path when the protocol message is generic', () => {
    const failure = classifyAmrAccountFailureSignal({
      details: {
        kind: 'opencode_prompt_error',
        code: 'auth_required',
        accountAction: 'relogin',
      },
      message: 'json-rpc id 3: Internal error',
      stderrTail: '',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('does not classify unrelated structured ACP details as AMR balance errors', () => {
    expect(classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      code: 'model_unavailable',
      accountAction: 'choose_model',
    })).toBeNull();
    expect(classifyAmrAccountFailureDetails(null)).toBeNull();
  });

  it('classifies AMR account failures through the unified structured-first signal path', () => {
    const failure = classifyAmrAccountFailureSignal({
      details: {
        kind: 'opencode_prompt_error',
        code: 'insufficient_balance',
        accountAction: 'recharge',
      },
      message: 'json-rpc id 4: request failed',
      stderrTail: '',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('uses stderr only as the final AMR account failure fallback', () => {
    const failure = classifyAmrAccountFailureSignal({
      message: 'json-rpc id 4: request failed',
      errorMessage: 'request failed',
      errorCode: 'AGENT_EXECUTION_FAILED',
      stdoutTail: '',
      stderrTail: 'opencode_event_stream_failure: [code=insufficient_balance] insufficient wallet balance',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('does not use stderr when structured or protocol text already classifies the failure', () => {
    const failure = classifyAmrAccountFailureSignal({
      message: 'invalid session for AMR profile',
      stderrTail: 'opencode_event_stream_failure: [code=insufficient_balance] insufficient wallet balance',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('classifies raw tier entitlement error codes into user-friendly upgrade copy', () => {
    expect(
      classifyAmrAccountFailure(
        'HTTP 403 [code=tier_model_not_entitled] model access denied for current tier',
      ),
    ).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });

    expect(
      classifyAmrAccountFailure(
        'HTTP 403 [code=tier_request_kind_not_entitled] image generation is not allowed for current tier',
      ),
    ).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });
  });

  it('classifies 429 wallet balance payloads as AMR balance errors', () => {
    const failure = classifyAmrAccountFailure(
      'HTTP 429 Too Many Requests: quota exceeded because wallet balance is empty',
    );

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('classifies common AMR billing text variants as rechargeable balance errors', () => {
    for (const text of [
      'not enough credits to run this model',
      'not enough balance for the selected model',
      'insufficient funds in AMR wallet',
      'balance too low for this request',
      'billing balance is below the minimum required amount',
    ]) {
      expect(classifyAmrAccountFailure(text)).toMatchObject({
        code: 'AMR_INSUFFICIENT_BALANCE',
        action: 'recharge',
        actionUrl: DEFAULT_AMR_RECHARGE_URL,
      });
    }
  });

  it('classifies the Chinese vela pre-charge (额度预扣) failure as a rechargeable balance error', () => {
    // Real production text sampled from Langfuse (#3408 P1): vela reports the
    // wallet pre-charge failure in Chinese, which previously leaked into the
    // opaque execution_failed bucket instead of insufficient_balance.
    const failure = classifyAmrAccountFailure(
      '预扣费额度失败, 用户[141283]剩余额度: 💰0.040000, 需要预扣费额度: 💰0.060000 (request id: Babc)',
    );
    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
  });

  it('classifies Chinese balance/quota shortfall variants as AMR balance errors', () => {
    for (const text of ['余额不足，请充值后重试', '账户额度不足']) {
      expect(classifyAmrAccountFailure(text)).toMatchObject({
        code: 'AMR_INSUFFICIENT_BALANCE',
        action: 'recharge',
      });
    }
  });

  it('does not classify non-billing throttling as AMR balance errors', () => {
    expect(classifyAmrAccountFailure('HTTP 429 rate limit reached')).toBeNull();
    expect(classifyAmrAccountFailure('quota exceeded')).toBeNull();
    expect(classifyAmrAccountFailure('temporary wallet balance lookup outage')).toBeNull();
  });

  // The surviving members of the old synonym list — each one is a shape vela
  // actually emits. The synonyms that had no upstream origin were removed; see
  // `does not invent AMR sign-in synonyms upstream never sends` below.
  it('classifies vela auth codes and vela sign-in reports as AMR auth errors', () => {
    for (const text of [
      // vela apps/cli/internal/agent — the account-action code OD's own
      // structured branch (`classifyAmrAccountFailureDetails`) accepts.
      'auth_required: please reconnect AMR Cloud',
      // vela services/api/src/app.ts:723 answers 401 with `{"error":"unauthenticated"}`.
      'unauthenticated request to link',
      // vela apps/cli/internal/commands/control.go:92.
      'not logged in to Vela runtime',
      // vela console copy for a sign-in that aged out.
      'invalid session for AMR profile',
    ]) {
      expect(classifyAmrAccountFailure(text)).toMatchObject({
        code: 'AMR_AUTH_REQUIRED',
        action: 'relogin',
      });
    }
  });

  // R-053 (`specs/current/run-error-catalog.md:215`). vela's link gateway turns
  // an upstream 401/403 into its OWN code on an HTTP 500 —
  // `services/link/internal/handlers/openai.go:2074` `normalizeUpstreamAuthFailure`
  // returns `upstream_provider_unauthenticated` / `upstream_provider_forbidden`
  // with the message "Upstream provider credentials are missing or invalid."
  // The credentials it names are the PLATFORM's, configured in the gateway. A
  // bare `includes('unauthenticated')` read that as the caller's, so a
  // misconfigured gateway told the user "Sign-in required" — and no amount of
  // signing in changes a credential the user does not hold.
  it('does not read the gateway own broken provider credentials as an AMR sign-in failure', () => {
    for (const text of [
      'API request failed with status 500: upstream_provider_unauthenticated',
      '[code=upstream_provider_unauthenticated] Upstream provider credentials are missing or invalid.',
      'json-rpc id 4: opencode event stream: {"properties":{"error":{"data":{"message":"\\"[code=upstream_provider_unauthenticated] Upstream provider credentials are missing or invalid.\\""}}}}',
      '[code=upstream_provider_forbidden] Upstream provider rejected access for the configured credentials.',
    ]) {
      expect(classifyAmrAccountFailure(text)).toBeNull();
    }
  });

  // A run's failure text is not a clean channel: `collectFailureText`
  // (`run-failure-classification.ts:177`) folds `stderr` events into the corpus
  // (:188), so whatever `gh`, `npm` or `curl` printed from a bash tool call is
  // read alongside the agent's own report. Every line below is ordinary tool
  // output about SOMEONE ELSE'S credential; classified as an AMR account
  // failure each one produces "Sign in to AMR Cloud again".
  it('does not read another service sign-in report as an AMR sign-in failure', () => {
    for (const text of [
      // vela's own per-user MCP OAuth code (bifrost `mcp/agent.go:333`) — it
      // means "this MCP tool needs ITS own OAuth", not "your AMR login expired".
      'json-rpc id 4: opencode event stream: tool error: {"extra_fields":{"mcp_auth_required":{"kind":"oauth","authorize_url":"https://figma.com/oauth"}}}',
      // bifrost `mcp/credstore/per_user_oauth.go:76` composes this per tool.
      'Authentication required for Figma. Visit https://example.com/oauth to connect your account.',
      'npm ERR! code ENEEDAUTH\nnpm ERR! you are not logged in to this registry',
      'gh: not authenticated. run gh auth login',
      'curl: (22) The requested URL returned error: 401 authentication required',
      'your OAuth token has expired for the Figma MCP server',
      'aws sts: the security token included in the request is an expired token',
      // The agent writing prose to the user, not a failure report at all.
      'I tried the API but it says you need to sign in again to the dashboard.',
      'The docs note that signin required for this endpoint.',
      'The config has login missing from the yaml block.',
    ]) {
      expect(classifyAmrAccountFailure(text)).toBeNull();
    }
  });

  it('does not classify unrelated ACP failures as AMR account failures', () => {
    expect(classifyAmrAccountFailure('session/prompt failed: model returned malformed output')).toBeNull();
  });

  it('does not tell env-auth users to relogin for bad API key failures', () => {
    expect(classifyAmrAccountFailure('OpenRouter returned invalid api key')).toBeNull();
    expect(classifyAmrAccountFailure('provider error: forbidden_api_key')).toBeNull();
  });

  // The word `session` heads two unrelated nouns in this product: the account's
  // sign-in session, and the ACP method/field family (`session/new`,
  // `session/load`, `sessionId`). Only the first is something a relogin fixes.
  //
  // `apps/daemon/src/agent-protocol/acp/session.ts` composes the line below
  // verbatim when an agent answers `session/new` without a session id — a pure
  // protocol violation by the agent's own build. Classified as an account
  // failure it becomes `auth / auth_required / user_action: login`, so the chat
  // card tells the user to sign in again for a defect no sign-in can touch.
  it('does not read an ACP protocol violation as an AMR sign-in failure', () => {
    for (const text of [
      // session.ts:`fail(\`invalid session/new response: ${rawLine}\`)`
      'invalid session/new response: {"jsonrpc":"2.0","id":2,"result":{}}',
      'invalid session/new response: {"error":"HTTP 503 Service Unavailable"}',
      // Same collision, other ACP methods and fields — the class, not the one
      // string that was reported.
      'invalid session/load response: {}',
      'invalid session/prompt payload from agent',
      'invalid sessionId returned by session/new',
      'expired session_token_ttl config value',
    ]) {
      expect(classifyAmrAccountFailure(text)).toBeNull();
    }
  });

  // The reverse guard for the test above. Tightening a sign-in predicate fails
  // by dropping the real thing, so pin the shapes that are actually evidenced
  // upstream — each entry names where it comes from.
  it('still recognises real AMR sign-in failures reported by vela', () => {
    for (const text of [
      // vela apps/cli/internal/commands/control.go:92 — the CLI refuses to run
      // when the selected profile carries no stored login.
      'profile "default" is not logged in; run `vela login`',
      // vela services/api answers 401 with this body (app.ts:723, :792, :863…;
      // runtime-keys.ts:51; workspaces/routes.ts:119). `apps/cli` surfaces it
      // through `client.ParseAPIError` (client.go:47), whose `Error()`
      // (client.go:40) renders `API request failed with status 401:
      // unauthenticated` — the code, standing on its own, is the signal.
      '{"error":"unauthenticated"}',
      'API request failed with status 401: unauthenticated',
      // vela console copy for a sign-in that aged out
      // (apps/web/src/routes/workspace-invite-preview.tsx:117,
      // apps/web/tests/browser/auth-guard.spec.ts:1054).
      'Session expired. Please sign in again.',
      'Your session expired before the request could be authorized.',
      'auth_required: please reconnect AMR Cloud',
      // Sign-in session named as the subject, in both English word orders.
      'invalid session for AMR profile',
      'expired session; run `vela login` again',
      'your sign-in session is no longer valid',
    ]) {
      expect(classifyAmrAccountFailure(text)).toMatchObject({
        code: 'AMR_AUTH_REQUIRED',
        action: 'relogin',
      });
    }
  });

  // The `invalid session` lesson, applied to the rest of the list. Each string
  // below was a member of the auth branch, and a search of the vela repository
  // (`/Users/elian/Documents/nexu/vela`, both `apps/cli` and `services/`) plus
  // this repository's own message sources found no upstream that emits it: they
  // are synonyms someone supplied for shapes upstream never sends. They are not
  // free — every one of them is live against arbitrary tool output.
  //
  // Dropping them does not drop coverage of a real signed-out agent: the
  // agent-agnostic `classifyAgentServiceFailure` (`runtimes/auth.ts:323`) still
  // reads generic auth prose, and for an AMR run the web resolves its
  // `AGENT_AUTH_REQUIRED` to the same "Sign-in required" card
  // (`apps/web/src/runtime/amr-guidance.ts:1505`). What stops is this
  // classifier's stronger, AMR-specific claim being made on evidence that never
  // named AMR.
  it('does not invent AMR sign-in synonyms upstream never sends', () => {
    for (const text of [
      'not authenticated',
      'login missing for runtime account',
      'sign-in-again',
      'sign-in required',
      'signin required before calling session/prompt',
      'Your token has expired. Please sign in again.',
      'expired token',
      // `authentication required` is not unevidenced — but its only evidenced
      // producer is bifrost's per-user MCP credential store
      // (`mcp/credstore/per_user_headers.go:106`, `per_user_oauth.go:76`),
      // which is a different principal's credential.
      'authentication required',
    ]) {
      expect(classifyAmrAccountFailure(text)).toBeNull();
    }
  });
});
