export function googleGenerativeLanguageBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  const pathname = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/v\d+(?:beta)?$/i, '');
  url.pathname = pathname || '/';
  return url.toString().replace(/\/+$/, '');
}

export function normalizeGoogleModelId(model: string): string {
  const trimmed = model.trim();
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

export function googleModelPathSegment(model: string): string {
  return encodeURIComponent(normalizeGoogleModelId(model));
}

export function googleGenerateContentUrl(baseUrl: string, model: string): string {
  return `${googleGenerativeLanguageBaseUrl(baseUrl)}/v1beta/models/${googleModelPathSegment(model)}:generateContent`;
}

export function googleStreamGenerateContentUrl(baseUrl: string, model: string): string {
  return `${googleGenerativeLanguageBaseUrl(baseUrl)}/v1beta/models/${googleModelPathSegment(model)}:streamGenerateContent?alt=sse`;
}

export function googleProviderModelsUrl(baseUrl: string, apiKey: string): string {
  const url = new URL(`${googleGenerativeLanguageBaseUrl(baseUrl)}/v1beta/models`);
  url.searchParams.set('key', apiKey);
  return url.toString();
}
