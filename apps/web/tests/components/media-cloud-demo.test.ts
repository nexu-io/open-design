import { describe, expect, it } from 'vitest';
import {
  defaultMediaCloudDemoValue,
  formatMediaCloudDemoUnitPrice,
  formatMediaCloudDemoUsd,
  mediaCloudDemoPriceUsd,
} from '../../src/components/home-hero/media-cloud-demo';

describe('media cloud review pricing', () => {
  it('uses a deterministic image price for the selected resolution', () => {
    const value = defaultMediaCloudDemoValue('image');

    expect(mediaCloudDemoPriceUsd({
      surface: 'image',
      mode: value.mode,
      modelId: value.modelId,
      resolution: '2k',
    })).toBe(0.035);
    expect(mediaCloudDemoPriceUsd({
      surface: 'image',
      mode: value.mode,
      modelId: value.modelId,
      resolution: '4k',
    })).toBe(0.035);
  });

  it('scales a deterministic video quote with duration and audio', () => {
    const value = defaultMediaCloudDemoValue('video');

    expect(mediaCloudDemoPriceUsd({
      surface: 'video',
      mode: value.mode,
      modelId: 'cloud/kling-3-standard',
      resolution: '1080p',
      duration: 5,
    })).toBe(0.42);
    expect(mediaCloudDemoPriceUsd({
      surface: 'video',
      mode: value.mode,
      modelId: 'cloud/kling-3-standard',
      resolution: '1080p',
      duration: 10,
      generateAudio: true,
    })).toBe(1.26);
  });

  it('scales image and video prices by output quantity', () => {
    expect(mediaCloudDemoPriceUsd({
      surface: 'image',
      mode: 'cloud',
      modelId: 'cloud/seedream-5-lite',
      resolution: '2k',
      quantity: 4,
    })).toBe(0.14);
    expect(mediaCloudDemoPriceUsd({
      surface: 'video',
      mode: 'cloud',
      modelId: 'cloud/kling-3-standard',
      resolution: '1080p',
      duration: 10,
      quantity: 3,
    })).toBeCloseTo(2.52);
  });

  it('shows no OpenDesign quote in BYOK mode', () => {
    const value = defaultMediaCloudDemoValue('image');

    expect(mediaCloudDemoPriceUsd({
      surface: 'image',
      mode: 'byok',
      modelId: value.modelId,
      resolution: value.resolution,
    })).toBeNull();
    expect(formatMediaCloudDemoUsd(1.2)).toBe('$1.20');
  });

  it('labels image quotes by image and video quotes by priced duration', () => {
    expect(formatMediaCloudDemoUnitPrice('image', 0.035)).toBe('$0.04 / image');
    expect(formatMediaCloudDemoUnitPrice('video', 0.42, 5)).toBe('$0.42 / 5 sec');
  });
});
