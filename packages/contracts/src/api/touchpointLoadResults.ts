import { z } from "zod";
// Controlled mirror of the CMS placement registry; keep the ingest DTO identical.
const placementKeySchema = z.enum(["opend.home.campaign-modal", "opend.home.account-badge", "opend.home.hover-layer", "opend.home.hover-entry", "vela.web.console-overlay"]);
const placementRegistry = Object.fromEntries(placementKeySchema.options.map(key => [key, { hostFamily: key.startsWith("opend.") ? "open-design-desktop" : "vela-web" }])) as Record<z.infer<typeof placementKeySchema>, { hostFamily: string }>;

export const TOUCHPOINT_LOAD_BATCH_LIMIT = 100;
export const TOUCHPOINT_LOAD_BODY_BYTES = 256 * 1024;
const token = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]*$/);
const nullableToken = token.nullable().default(null);
const duration = z
  .number()
  .finite()
  .nonnegative()
  .max(86_400_000)
  .nullable()
  .default(null);
const bytes = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable()
  .default(null);
export const touchpointLoadTimingFields = [
  "decision_request_ms",
  "resource_read_ms",
  "public_transfer_ms",
  "local_transfer_ms",
  "decode_validate_ms",
  "import_ms",
  "mount_ms",
  "visibility_wait_ms",
  "total_duration_ms",
] as const;
export const touchpointLoadResultSchema = z.enum([
  "visible",
  "failed",
  "cancelled",
]);
export const touchpointLoadOutcomeSchema = z.enum([
  "eligible",
  "no_activity",
  "capability_unsupported",
]);
export const touchpointLoadCacheSchema = z.enum([
  "server",
  "daemon",
  "browser",
  "module",
  "offline_fallback",
]);
export const touchpointLoadTriggerSchema = z.enum([
  "immediate",
  "hover",
  "click",
]);
export const touchpointLoadRecordSchema = z
  .object({
    event_id: z.string().uuid(),
    load_attempt_id: z.string().uuid(),
    session_id: z.string().uuid(),
    occurred_at: z.string().datetime({ offset: true }),
    kind: z.enum(["start", "terminal", "renewal", "report"]),
    decision_id: nullableToken,
    activity_id: nullableToken,
    deployment_id: nullableToken,
    content_version_id: nullableToken,
    placement_key: placementKeySchema,
    host_product: z.enum(["opend", "vela"]),
    host_family: z.enum(["open-design-desktop", "vela-web"]),
    locale: z
      .string()
      .min(2)
      .max(35)
      .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/),
    client_version: nullableToken,
    daemon_version: nullableToken,
    server_version: nullableToken,
    decision_outcome: touchpointLoadOutcomeSchema.nullable().default(null),
    reason_code: z
      .enum(["no_activity", "capability_unsupported", "unknown"])
      .nullable()
      .default(null),
    missing_capability: z
      .enum(["close", "hover", "static-action", "unknown"])
      .nullable()
      .default(null),
    result: touchpointLoadResultSchema.nullable().default(null),
    failure_stage: z
      .enum([
        "decision",
        "resource_read",
        "transfer",
        "decode_validate",
        "import",
        "mount",
        "visibility",
      ])
      .nullable()
      .default(null),
    error_code: z
      .enum([
        "network_error",
        "http_error",
        "timeout",
        "resource_missing",
        "integrity_error",
        "decode_error",
        "import_error",
        "mount_error",
        "visibility_error",
        "unknown",
      ])
      .nullable()
      .default(null),
    http_status: z.number().int().min(100).max(599).nullable().default(null),
    cancel_reason: z
      .enum([
        "not_triggered",
        "page_left",
        "identity_changed",
        "locale_changed",
        "revoked",
        "decision_changed",
        "no_activity",
        "capability_unsupported",
        "unknown",
      ])
      .nullable()
      .default(null),
    report_result: z
      .enum(["success", "failed", "unknown"])
      .nullable()
      .default(null),
    cache_hit: z.boolean().nullable().default(null),
    cache_source: touchpointLoadCacheSchema.nullable().default(null),
    held_content_id: nullableToken,
    held_content_locale: z
      .string()
      .min(2)
      .max(35)
      .regex(/^[A-Za-z0-9-]+$/)
      .nullable()
      .default(null),
    content_omitted: z.boolean().nullable().default(null),
    visibility_trigger: touchpointLoadTriggerSchema.nullable().default(null),
    decision_request_ms: duration,
    resource_read_ms: duration,
    public_transfer_ms: duration,
    local_transfer_ms: duration,
    decode_validate_ms: duration,
    import_ms: duration,
    mount_ms: duration,
    visibility_wait_ms: duration,
    total_duration_ms: duration,
    public_response_bytes: bytes,
    local_response_bytes: bytes,
    public_base64_bytes: bytes,
    local_base64_bytes: bytes,
    decoded_resource_bytes: bytes,
  })
  .strict()
  .superRefine((record, ctx) => {
    const invalid = (field: string) =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "invalid_record_kind_fields",
      });
    if ((record.kind === "terminal") !== (record.result !== null))
      invalid("result");
    if (record.kind !== "report" && record.report_result !== null)
      invalid("report_result");
    if (record.kind === "report" && record.report_result === null)
      invalid("report_result");
    if (
      record.result === "failed" &&
      (record.failure_stage === null || record.error_code === null)
    )
      invalid("failure_stage");
    if (
      record.result !== "failed" &&
      (record.failure_stage !== null || record.error_code !== null)
    )
      invalid("error_code");
    if (record.result === "cancelled" && record.cancel_reason === null)
      invalid("cancel_reason");
    if (record.result !== "cancelled" && record.cancel_reason !== null)
      invalid("cancel_reason");
    if (record.result === "visible" && record.decision_outcome !== "eligible")
      invalid("decision_outcome");
    if (
      (record.host_product === "opend" ? "open-design-desktop" : "vela-web") !==
        record.host_family ||
      placementRegistry[record.placement_key].hostFamily !== record.host_family
    )
      invalid("host_family");
  });
export const touchpointLoadBatchSchema = z
  .object({
    contractVersion: z.literal(1),
    records: z
      .array(touchpointLoadRecordSchema)
      .min(1)
      .max(TOUCHPOINT_LOAD_BATCH_LIMIT),
  })
  .strict();
export const touchpointLoadQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    cursor: z.string().min(1).max(4096).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    host_product: z.enum(["opend", "vela"]).optional(),
    host_family: z.enum(["open-design-desktop", "vela-web"]).optional(),
    placement_key: placementKeySchema.optional(),
    client_version: token.optional(),
    daemon_version: token.optional(),
    server_version: token.optional(),
    content_version_id: token.optional(),
    cache_source: touchpointLoadCacheSchema.optional(),
    visibility_trigger: touchpointLoadTriggerSchema.optional(),
    result: z
      .enum(["visible", "failed", "cancelled", "lost", "pending", "orphan"])
      .optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict();
export type TouchpointLoadRecord = z.infer<typeof touchpointLoadRecordSchema>;
export type TouchpointLoadBatch = z.infer<typeof touchpointLoadBatchSchema>;
export type TouchpointLoadQuery = z.infer<typeof touchpointLoadQuerySchema>;

/** Output identity/session strings are HMAC pseudonyms, never input UUIDs. */
export const touchpointLoadDetailSchema = touchpointLoadRecordSchema
  .innerType()
  .extend({
    session_id: z.string().regex(/^[0-9a-f]{64}$/),
    attempt_key: z.string().regex(/^[0-9a-f]{64}$/),
    subject: z.string().regex(/^[0-9a-f]{64}$/),
    authority_source: z.enum(["authenticated_host", "server_bound_decision"]),
    measurement_source: z.literal("host_reported"),
    result_state: z.enum([
      "visible",
      "failed",
      "cancelled",
      "pending",
      "lost",
      "orphan",
    ]),
    start_event_id: z.string().uuid().nullable(),
    terminal_event_id: z.string().uuid().nullable(),
    start_received_at: z.string().datetime().nullable(),
    terminal_received_at: z.string().datetime().nullable(),
    first_received_at: z.string().datetime(),
    late_terminal: z.boolean(),
    renewal_count: z.number().int().nonnegative(),
    report_count: z.number().int().nonnegative(),
  })
  .strict();
export const touchpointLoadDetailResponseSchema = z
  .object({
    asOf: z.string().datetime(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    total: z.number().int().nonnegative(),
    records: z.array(touchpointLoadDetailSchema).max(200),
    nextCursor: z.string().nullable(),
    snapshotCursor: z.string(),
  })
  .strict();
export type TouchpointLoadDetail = z.infer<typeof touchpointLoadDetailSchema>;

/** UTF-8 byte count without runtime-specific APIs (unpaired surrogates become U+FFFD). */
export function touchpointUtf8Bytes(value: string): number {
  let count = 0;
  for (const char of value) {
    const point = char.codePointAt(0)!;
    count += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return count;
}

export const TOUCHPOINT_LOAD_METRICS_HEADER = "x-touchpoint-load-metrics";
export const TOUCHPOINT_LOAD_METRICS_MAX_BYTES = 2048;
// Informational only: never consumed by authorization or lease calculation.
export const touchpointLoadMetricsSchema = z.object({
  version: z.literal(1),
  daemon_version: nullableToken,
  server_version: nullableToken,
  resource_read_ms: duration,
  public_transfer_ms: duration,
  local_transfer_ms: duration,
  public_response_bytes: bytes,
  local_response_bytes: bytes,
  public_base64_bytes: bytes,
  local_base64_bytes: bytes,
  decoded_resource_bytes: bytes,
  cache_hit: z.boolean().nullable().default(null),
  cache_source: touchpointLoadCacheSchema.nullable().default(null),
  held_content_id: nullableToken,
  held_content_locale: z.string().max(35).regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/).nullable().default(null),
  content_omitted: z.boolean().nullable().default(null),
}).strict();
export type TouchpointLoadMetrics = z.infer<typeof touchpointLoadMetricsSchema>;
export function parseTouchpointLoadMetrics(value: string | null | undefined): TouchpointLoadMetrics | null {
  if (!value || touchpointUtf8Bytes(value) > TOUCHPOINT_LOAD_METRICS_MAX_BYTES) return null;
  try {
    const parsed = touchpointLoadMetricsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
