import { describe, expect, it } from 'vitest';
import {
  OD_NEXT_DEVICE_FRAME_ROOT,
  detectOdNextDevicePlatformFromText,
  hasOdNextDeviceShell,
  odNextDeviceFramePath,
  resolveOdNextDevicePlatform,
  selectOdNextDeviceFrameContextV2,
} from '../src/prompts/od-next-device-frame.js';

// The handheld shell is resolved from the user's own words and the project's
// platform metadata only. These specs pin the vocabulary boundary that the
// rule card's "no shell" row depends on: an explicit platform always wins, a
// platform-less phone app maps to the neutral shell, and a responsive site or
// a company name never counts as a phone.

describe('detectOdNextDevicePlatformFromText', () => {
  it.each([
    ['做一个 iPhone 记账 app', 'ios'],
    ['Build an iOS onboarding flow in SwiftUI', 'ios'],
    ['苹果手机上的打卡应用', 'ios'],
    ['iphone15 上跑的外卖 app', 'ios'],
    ['做一个安卓端的阅读器', 'android'],
    ['Material Design 3 settings screen for Android', 'android'],
    ['鸿蒙系统的天气应用', 'android'],
    ['Pixel 8 camera app redesign', 'android'],
    ['宠物美容店线上预约 App，手机端', 'mobile-neutral'],
    ['做一个移动端的记账应用', 'mobile-neutral'],
    ['A mobile app for booking grooming appointments', 'mobile-neutral'],
    ['native app for field technicians', 'mobile-neutral'],
  ])('classifies %s as %s', (text, expected) => {
    expect(detectOdNextDevicePlatformFromText(text)).toBe(expected);
  });

  it.each([
    '做一个响应式官网，移动端也要好看',
    'Responsive marketing site with a mobile app download section',
    '桌面端的数据看板，移动端自适应',
    '苹果公司历史介绍的落地页',
    'pixel-perfect landing page clone',
    'A SaaS admin dashboard',
    '做一个 web app 管理后台',
    '',
  ])('does not classify %s as a phone app', (text) => {
    expect(detectOdNextDevicePlatformFromText(text)).toBeNull();
  });

  it('lets an explicit platform win over a responsive mention', () => {
    expect(detectOdNextDevicePlatformFromText('iOS app，同时要有响应式官网')).toBe('ios');
    expect(detectOdNextDevicePlatformFromText(null, undefined, 'Android app + desktop site')).toBe('android');
  });
});

describe('resolveOdNextDevicePlatform', () => {
  it('prefers the user\'s explicit platform over project metadata', () => {
    expect(resolveOdNextDevicePlatform({
      metadata: { platform: 'auto', platformTargets: ['mobile-android'] },
      textPlatform: 'ios',
    })).toEqual({ platform: 'ios', resolvedFrom: 'request-text' });
  });

  it('reads single-platform metadata as that platform and the Mobile chip as neutral', () => {
    expect(resolveOdNextDevicePlatform({
      metadata: { platform: 'mobile-ios' },
      textPlatform: null,
    })).toEqual({ platform: 'ios', resolvedFrom: 'project-metadata' });
    expect(resolveOdNextDevicePlatform({
      metadata: { platformTargets: ['mobile-android'] },
    })).toEqual({ platform: 'android', resolvedFrom: 'project-metadata' });
    // Home "Mobile app" chip: both targets, no platform named.
    expect(resolveOdNextDevicePlatform({
      metadata: { platform: 'auto', platformTargets: ['mobile-ios', 'mobile-android'] },
      textPlatform: 'mobile-neutral',
    })).toEqual({ platform: 'mobile-neutral', resolvedFrom: 'project-metadata' });
  });

  it('maps a platform-less phone brief to neutral unless the project targets a non-phone surface', () => {
    expect(resolveOdNextDevicePlatform({
      metadata: { platform: 'auto' },
      textPlatform: 'mobile-neutral',
    })).toEqual({ platform: 'mobile-neutral', resolvedFrom: 'request-text' });
    expect(resolveOdNextDevicePlatform({
      metadata: undefined,
      textPlatform: 'mobile-neutral',
    })).toEqual({ platform: 'mobile-neutral', resolvedFrom: 'request-text' });
    for (const platform of ['responsive', 'web-desktop', 'tablet', 'desktop-app']) {
      expect(resolveOdNextDevicePlatform({
        metadata: { platform },
        textPlatform: 'mobile-neutral',
      })).toBeNull();
    }
  });

  it('resolves nothing for a web prototype with no phone signal', () => {
    expect(resolveOdNextDevicePlatform({ metadata: { kind: 'prototype' } as never })).toBeNull();
    expect(resolveOdNextDevicePlatform({ metadata: { platform: 'responsive' }, textPlatform: null })).toBeNull();
  });
});

describe('selectOdNextDeviceFrameContextV2', () => {
  const resources = [
    { path: './assets/task-profiles/prototype/device-frames/iphone.html', text: '<div data-phone-shell data-platform="iphone"></div>' },
    { path: './assets/task-profiles/prototype/device-frames/android.html', text: '<div data-phone-shell data-platform="android"></div>' },
    { path: './assets/task-profiles/prototype/device-frames/neutral.html', text: '<div data-phone-shell data-platform="neutral"></div>' },
    { path: './assets/task-profiles/prototype/other.md', text: 'not a shell' },
  ];

  it('quotes the selected shell and lists every staged shell by project-relative path', () => {
    const context = selectOdNextDeviceFrameContextV2({
      resolution: { platform: 'android', resolvedFrom: 'request-text' },
      taskResources: resources,
    });
    expect(context).toEqual({
      platform: 'android',
      resolvedFrom: 'request-text',
      shell: `${OD_NEXT_DEVICE_FRAME_ROOT}/android.html`,
      availableShells: [
        `${OD_NEXT_DEVICE_FRAME_ROOT}/android.html`,
        `${OD_NEXT_DEVICE_FRAME_ROOT}/iphone.html`,
        `${OD_NEXT_DEVICE_FRAME_ROOT}/neutral.html`,
      ],
      shellHtml: '<div data-phone-shell data-platform="android"></div>',
    });
    expect(odNextDeviceFramePath('ios')).toBe('.od-frames/iphone.html');
  });

  it('omits the fact when nothing was resolved or the package ships no shell for the platform', () => {
    expect(selectOdNextDeviceFrameContextV2({ resolution: null, taskResources: resources })).toBeNull();
    expect(selectOdNextDeviceFrameContextV2({
      resolution: { platform: 'ios', resolvedFrom: 'request-text' },
      taskResources: resources.filter((resource) => !resource.path.endsWith('iphone.html')),
    })).toBeNull();
    expect(selectOdNextDeviceFrameContextV2({
      resolution: { platform: 'ios', resolvedFrom: 'request-text' },
      taskResources: undefined,
    })).toBeNull();
  });
});

describe('hasOdNextDeviceShell', () => {
  it('requires both the handset marker and the content slot', () => {
    expect(hasOdNextDeviceShell(
      '<div class="phone-frame" data-phone-shell data-platform="iphone"><main class="phone-content"></main></div>',
    )).toBe(true);
    expect(hasOdNextDeviceShell('<div class="phone-frame" data-phone-shell="true"><div class="x phone-content y"></div></div>')).toBe(true);
    expect(hasOdNextDeviceShell('<div class="phone-frame" data-phone-shell></div>')).toBe(false);
    expect(hasOdNextDeviceShell('<main class="phone-content"></main>')).toBe(false);
    expect(hasOdNextDeviceShell('<div class="card" style="border-radius:24px"></div>')).toBe(false);
    expect(hasOdNextDeviceShell('')).toBe(false);
    expect(hasOdNextDeviceShell(null)).toBe(false);
  });
});
