

export type JsonRecord = Record<string, unknown>;
export type SendAgentEvent = (channel: string, payload: JsonRecord) => void;
export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cached_read_tokens?: number;
  cached_write_tokens?: number;
  total_tokens?: number;
};
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
export function errorCode(err: unknown): string | undefined {
  return isRecord(err) && typeof err.code === 'string' ? err.code : undefined;
}
export function getRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}
