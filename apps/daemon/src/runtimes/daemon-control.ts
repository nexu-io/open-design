export interface DaemonControlResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type DaemonControlFetch = (
  input: string,
  init?: RequestInit,
) => Promise<DaemonControlResponse>;

export function requestDaemonStatus(
  baseUrl: string,
  fetchImpl: DaemonControlFetch = fetch,
): Promise<DaemonControlResponse> {
  return fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/daemon/status`);
}

export function requestDaemonShutdown(
  baseUrl: string,
  fetchImpl: DaemonControlFetch = fetch,
): Promise<DaemonControlResponse> {
  return fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/daemon/shutdown`, {
    method: 'POST',
  });
}
