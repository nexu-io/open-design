import { describe, expect, it } from 'vitest';

import {
  defaultSeed,
  deriveTokens,
  generate,
  presets,
} from '../../../src/brands/engine/index.js';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('brand palette generation', () => {
  it('keeps every Ant preset vector unchanged', () => {
    expect(presets).toEqual({
      red: ['#fff1f0', '#ffcbc7', '#ffa39e', '#ff7775', '#ff4d50', '#f5222d', '#cf1323', '#a8071a', '#820014', '#5c0011'],
      volcano: ['#fff2e8', '#ffd8bf', '#ffbb96', '#ff9c6e', '#ff7a45', '#fa541c', '#d4380d', '#ad2202', '#871500', '#610c00'],
      orange: ['#fff7e6', '#ffe7ba', '#ffd591', '#ffc069', '#ffa940', '#fa8c16', '#d46b08', '#ad4e00', '#873800', '#612500'],
      gold: ['#fffbe6', '#fff1b8', '#ffe58f', '#ffd666', '#ffc53d', '#faad14', '#d48806', '#ad6800', '#874c00', '#613400'],
      yellow: ['#feffe6', '#ffffb8', '#fffb8f', '#fff566', '#ffeb3d', '#fadb14', '#d4b106', '#ad8a00', '#876700', '#614700'],
      lime: ['#fcffe6', '#f4ffb8', '#eaff8f', '#d3f261', '#bae637', '#a0d911', '#7bb305', '#5b8c00', '#3f6600', '#254000'],
      green: ['#f6ffed', '#d9f7be', '#b6eb8f', '#94de64', '#72d13d', '#52c41a', '#389e0d', '#227804', '#135200', '#092b00'],
      cyan: ['#e6fffb', '#b5f5ec', '#87e8de', '#5cdbd3', '#36cfc9', '#13c2c2', '#08979c', '#006d75', '#00474f', '#002329'],
      blue: ['#e6f4ff', '#bae0ff', '#91caff', '#69b1ff', '#4096ff', '#1677ff', '#0958d9', '#003eb3', '#002c8c', '#001d66'],
      geekblue: ['#f0f5ff', '#d6e4ff', '#adc6ff', '#85a5ff', '#597df7', '#2f54eb', '#1d39c4', '#10229e', '#061178', '#030852'],
      purple: ['#f9f0ff', '#efdbff', '#d4adf7', '#b37feb', '#9254de', '#722ed1', '#531dab', '#391085', '#22075e', '#120338'],
      magenta: ['#fff0f6', '#ffd6e7', '#ffadd2', '#ff85bf', '#f759aa', '#eb2f96', '#c41d7e', '#9e1067', '#780650', '#520339'],
      grey: ['#a6a6a6', '#999999', '#8c8c8c', '#808080', '#737373', '#666666', '#404040', '#1a1a1a', '#000000', '#000000'],
    });
  });

  it('lifts a dark chromatic seed into a genuinely light tint', () => {
    const palette = generate('#072c50');

    expect(palette[5]).toBe('#072c50');
    expect(relativeLuminance(palette[0] ?? '#000000')).toBeGreaterThan(0.7);
    expect(relativeLuminance(palette[0] ?? '#000000')).toBeGreaterThan(
      relativeLuminance(palette[2] ?? '#000000'),
    );
    expect(relativeLuminance(palette[2] ?? '#000000')).toBeGreaterThan(
      relativeLuminance(palette[4] ?? '#000000'),
    );
    expect(relativeLuminance(palette[4] ?? '#000000')).toBeGreaterThan(
      relativeLuminance(palette[5] ?? '#000000'),
    );
  });

  it('maps the corrected dark-primary ladder into derived interaction tokens', () => {
    const seed = { ...defaultSeed, colorPrimary: '#072c50' };
    const palette = generate(seed.colorPrimary);
    const tokens = deriveTokens(seed);

    expect(tokens.colorPrimaryBg).toBe(palette[0]);
    expect(tokens.colorPrimaryBorder).toBe(palette[2]);
    expect(tokens.colorPrimaryHover).toBe(palette[4]);
    expect(relativeLuminance(tokens.colorPrimaryBg)).toBeGreaterThan(0.7);
  });
});
