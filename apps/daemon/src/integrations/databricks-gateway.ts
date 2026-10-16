function isDatabricksGateway(baseUrl: string, apiPath: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:'
      && /\.(?:cloud\.databricks\.com|azuredatabricks\.net|gcp\.databricks\.com)$/.test(url.hostname)
      && url.pathname.replace(/\/+$/, '') === apiPath;
  } catch {
    return false;
  }
}

export function isDatabricksAnthropicGateway(baseUrl: string): boolean {
  return isDatabricksGateway(baseUrl, '/ai-gateway/anthropic/v1');
}

export function isDatabricksOpenAIGateway(baseUrl: string): boolean {
  return isDatabricksGateway(baseUrl, '/ai-gateway/mlflow/v1');
}

export function anthropicGatewayAuthHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  return isDatabricksAnthropicGateway(baseUrl)
    ? { authorization: `Bearer ${apiKey}` }
    : { 'x-api-key': apiKey };
}
