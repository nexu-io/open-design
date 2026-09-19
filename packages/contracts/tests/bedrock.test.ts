import { describe, expect, it } from 'vitest';
import {
  BEDROCK_DEFAULT_REGION,
  bedrockInferenceModelId,
  bedrockRegionFromBaseUrl,
  bedrockRuntimeEndpoint,
  isBedrockRuntimeBaseUrl,
  resolveBedrockRegion,
} from '../src/api/bedrock';

describe('bedrock region helpers', () => {
  it('reads the region out of regional, FIPS, dual-stack and VPC endpoint hosts', () => {
    expect(bedrockRegionFromBaseUrl('https://bedrock-runtime.us-east-1.amazonaws.com')).toBe('us-east-1');
    expect(bedrockRegionFromBaseUrl('https://bedrock-runtime-fips.us-gov-west-1.amazonaws.com')).toBe('us-gov-west-1');
    expect(bedrockRegionFromBaseUrl('https://bedrock-runtime.eu-west-3.api.aws/')).toBe('eu-west-3');
    expect(bedrockRegionFromBaseUrl('https://bedrock-runtime.cn-north-1.amazonaws.com.cn')).toBe('cn-north-1');
    expect(
      bedrockRegionFromBaseUrl('https://bedrock-runtime.eu-west-1.vpce-0a1b2c3d.amazonaws.com'),
    ).toBe('eu-west-1');
  });

  it('returns null for hosts that are not Bedrock runtime endpoints', () => {
    expect(bedrockRegionFromBaseUrl('https://proxy.example.com/bedrock-runtime/v1')).toBeNull();
    expect(bedrockRegionFromBaseUrl('https://bedrock.us-east-1.amazonaws.com')).toBeNull();
    expect(bedrockRegionFromBaseUrl('not a url')).toBeNull();
    expect(bedrockRegionFromBaseUrl('')).toBeNull();
    expect(isBedrockRuntimeBaseUrl('https://api.anthropic.com')).toBe(false);
  });

  it('falls back to the default region when the endpoint carries none', () => {
    expect(resolveBedrockRegion('https://proxy.example.com')).toBe(BEDROCK_DEFAULT_REGION);
    expect(resolveBedrockRegion(undefined)).toBe(BEDROCK_DEFAULT_REGION);
    expect(resolveBedrockRegion('https://bedrock-runtime.ap-northeast-1.amazonaws.com')).toBe('ap-northeast-1');
  });

  it('builds the regional runtime endpoint', () => {
    expect(bedrockRuntimeEndpoint('eu-central-1')).toBe('https://bedrock-runtime.eu-central-1.amazonaws.com');
  });
});

describe('bedrockInferenceModelId', () => {
  it('leaves ARNs and already-prefixed ids untouched', () => {
    const arn = 'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc';
    expect(bedrockInferenceModelId(arn, 'us-east-1')).toBe(arn);
    expect(bedrockInferenceModelId('global.anthropic.claude-sonnet-5', 'eu-west-1')).toBe(
      'global.anthropic.claude-sonnet-5',
    );
    expect(bedrockInferenceModelId('us.amazon.nova-lite-v1:0', 'us-east-1')).toBe('us.amazon.nova-lite-v1:0');
  });

  it('prefixes Claude and Nova ids with the regional cross-region profile', () => {
    expect(bedrockInferenceModelId('anthropic.claude-sonnet-5', 'us-east-1')).toBe('us.anthropic.claude-sonnet-5');
    expect(bedrockInferenceModelId('amazon.nova-lite-v1:0', 'eu-west-1')).toBe('eu.amazon.nova-lite-v1:0');
    expect(bedrockInferenceModelId('anthropic.claude-sonnet-5', 'ap-northeast-1')).toBe('jp.anthropic.claude-sonnet-5');
    expect(bedrockInferenceModelId('anthropic.claude-sonnet-5', 'ap-southeast-1')).toBe('apac.anthropic.claude-sonnet-5');
    // No APAC profile is served from Hong Kong or New Zealand: the bare id stays.
    expect(bedrockInferenceModelId('anthropic.claude-sonnet-5', 'ap-east-1')).toBe('anthropic.claude-sonnet-5');
    expect(bedrockInferenceModelId('anthropic.claude-sonnet-5', 'ap-southeast-6')).toBe('anthropic.claude-sonnet-5');
  });

  it('does not prefix models served on demand or GovCloud regions', () => {
    expect(bedrockInferenceModelId('mistral.mistral-large-2402-v1:0', 'us-east-1')).toBe(
      'mistral.mistral-large-2402-v1:0',
    );
    expect(bedrockInferenceModelId('anthropic.claude-sonnet-5', 'us-gov-west-1')).toBe('anthropic.claude-sonnet-5');
  });
});
