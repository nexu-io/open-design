let _token = '';

export function setApiToken(token: string): void {
  _token = token;
}

export function getApiToken(): string {
  return _token;
}

export function clearApiToken(): void {
  _token = '';
}
