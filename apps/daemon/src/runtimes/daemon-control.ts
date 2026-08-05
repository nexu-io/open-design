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

export function requestDaemonDbStatus(
  baseUrl: string,
  fetchImpl: DaemonControlFetch = fetch,
): Promise<DaemonControlResponse> {
  return fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/daemon/db`);
}

export function requestDaemonDbVerify(
  baseUrl: string,
  quick: boolean,
  fetchImpl: DaemonControlFetch = fetch,
): Promise<DaemonControlResponse> {
  const suffix = quick ? '?quick=1' : '';
  return fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/daemon/db/verify${suffix}`, {
    method: 'POST',
  });
}

export function requestDaemonDbVacuum(
  baseUrl: string,
  fetchImpl: DaemonControlFetch = fetch,
): Promise<DaemonControlResponse> {
  return fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/daemon/db/vacuum`, {
    method: 'POST',
  });
}
