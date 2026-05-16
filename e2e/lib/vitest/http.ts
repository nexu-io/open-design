export type JsonRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
};

export async function requestJson<T>(baseUrl: string, path: string, options: JsonRequestOptions = {}): Promise<T> {
  const response = await fetch(new URL(path, ensureTrailingSlash(baseUrl)), {
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function requestText(baseUrl: string, path: string): Promise<string> {
  const response = await fetch(new URL(path, ensureTrailingSlash(baseUrl)));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${text.slice(0, 500)}`);
  }
  return text;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
