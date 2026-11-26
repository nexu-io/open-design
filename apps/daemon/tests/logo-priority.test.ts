import { describe, expect, it } from 'vitest';

import {
  compareLogoFileNames,
  compareLogoFileNamesByExtension,
  isLikelyLogoAssetFileName,
  isLogoFileName,
} from '../src/brands/logo-priority.js';

describe('logo priority helpers', () => {
  it('prefers vector files before name heuristics across extensions', () => {
    expect(['Wordmark.png', 'Symbol.svg'].sort(compareLogoFileNames)).toEqual(['Symbol.svg', 'Wordmark.png']);
  });

  it('prefers wordmarks over symbols when extensions tie', () => {
    expect(['Symbol.png', 'Wordmark.png'].sort(compareLogoFileNames)).toEqual(['Wordmark.png', 'Symbol.png']);
  });

  it('prefers wordmarks over broad header asset names when extensions tie', () => {
    expect(['header.png', 'wordmark.png'].sort(compareLogoFileNames)).toEqual(['wordmark.png', 'header.png']);
  });

  it('keeps extension-only sorting separate from name heuristics', () => {
    expect(['wordmark.png', 'symbol.svg'].sort(compareLogoFileNamesByExtension)).toEqual(['symbol.svg', 'wordmark.png']);
    expect(['wordmark.png', 'symbol.png'].sort(compareLogoFileNamesByExtension)).toEqual(['symbol.png', 'wordmark.png']);
  });

  it('matches logo file extensions case-insensitively', () => {
    expect(isLogoFileName('LOGO.PNG')).toBe(true);
    expect(isLogoFileName('logo.txt')).toBe(false);
  });

  it('only accepts logo-like asset names', () => {
    expect(isLikelyLogoAssetFileName('Brand Mark.PNG')).toBe(true);
    expect(isLikelyLogoAssetFileName('favicon.ico')).toBe(true);
    expect(isLikelyLogoAssetFileName('site-header.png')).toBe(false);
    expect(isLikelyLogoAssetFileName('icon.png')).toBe(false);
    expect(isLikelyLogoAssetFileName('photo.png')).toBe(false);
    expect(isLikelyLogoAssetFileName('screenshot.jpg')).toBe(false);
    expect(isLikelyLogoAssetFileName('wordmark.pdf')).toBe(false);
    expect(isLikelyLogoAssetFileName('logo.pdf')).toBe(false);
  });
});
