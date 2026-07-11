// @vitest-environment jsdom
//
// The BYOK model/voice overrides hook: seeding from the project's
// creation-time media picks (gated to the active protocol) falling back to
// the Settings config default, and independent setters thereafter. Pure
// state, no port.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectMetadata } from '../../../src/types';

import { useByokModelOverrides } from '../../../src/features/project-view/hooks/useByokModelOverrides.hooks';

const baseConfig = {
  apiProtocol: 'aihubmix' as const,
  byokImageModel: 'settings-image',
  byokVideoModel: 'settings-video',
  byokSpeechModel: 'settings-speech',
  byokSpeechVoice: 'settings-voice',
};

describe('useByokModelOverrides', () => {
  it('seeds from a matching-protocol project pick over the Settings default', () => {
    const metadata = {
      kind: 'image',
      imageModel: 'aihubmix-image',
    } as ProjectMetadata;
    const { result } = renderHook(() => useByokModelOverrides(metadata, baseConfig));
    expect(result.current.byokImageModelOverride).toBe('aihubmix-image');
    // No video/speech pick on this metadata — falls back to Settings.
    expect(result.current.byokVideoModelOverride).toBe('settings-video');
    expect(result.current.byokSpeechModelOverride).toBe('settings-speech');
    expect(result.current.byokSpeechVoiceOverride).toBe('settings-voice');
  });

  it('falls back to the Settings default when the pick belongs to a different protocol', () => {
    const metadata = {
      kind: 'image',
      imageModel: 'aihubmix-image',
    } as ProjectMetadata;
    const { result } = renderHook(() =>
      useByokModelOverrides(metadata, { ...baseConfig, apiProtocol: 'openai' }),
    );
    expect(result.current.byokImageModelOverride).toBe('settings-image');
  });

  it('carries the speech voice only when the speech model itself is carried', () => {
    const withVoice = {
      kind: 'audio',
      audioKind: 'speech',
      audioModel: 'aihubmix-speech',
      voice: 'picked-voice',
    } as ProjectMetadata;
    const { result: withVoiceResult } = renderHook(() => useByokModelOverrides(withVoice, baseConfig));
    expect(withVoiceResult.current.byokSpeechModelOverride).toBe('aihubmix-speech');
    expect(withVoiceResult.current.byokSpeechVoiceOverride).toBe('picked-voice');

    const crossProtocol = { ...withVoice };
    const { result: crossResult } = renderHook(() =>
      useByokModelOverrides(crossProtocol, { ...baseConfig, apiProtocol: 'openai' }),
    );
    expect(crossResult.current.byokSpeechModelOverride).toBe('settings-speech');
    // Voice does not leak across a cross-provider fallback.
    expect(crossResult.current.byokSpeechVoiceOverride).toBe('settings-voice');
  });

  it('falls back to an empty string when metadata and Settings both carry nothing', () => {
    const { result } = renderHook(() =>
      useByokModelOverrides(null, {
        apiProtocol: 'openai',
        byokImageModel: undefined,
        byokVideoModel: undefined,
        byokSpeechModel: undefined,
        byokSpeechVoice: undefined,
      }),
    );
    expect(result.current.byokImageModelOverride).toBe('');
    expect(result.current.byokVideoModelOverride).toBe('');
    expect(result.current.byokSpeechModelOverride).toBe('');
    expect(result.current.byokSpeechVoiceOverride).toBe('');
  });

  it('each setter updates its own override independently', () => {
    const { result } = renderHook(() => useByokModelOverrides(null, baseConfig));
    act(() => result.current.setByokImageModelOverride('new-image'));
    expect(result.current.byokImageModelOverride).toBe('new-image');
    expect(result.current.byokVideoModelOverride).toBe('settings-video');

    act(() => result.current.setByokVideoModelOverride('new-video'));
    act(() => result.current.setByokSpeechModelOverride('new-speech'));
    act(() => result.current.setByokSpeechVoiceOverride('new-voice'));
    expect(result.current.byokVideoModelOverride).toBe('new-video');
    expect(result.current.byokSpeechModelOverride).toBe('new-speech');
    expect(result.current.byokSpeechVoiceOverride).toBe('new-voice');
    // The image override set earlier is untouched by the later setter calls.
    expect(result.current.byokImageModelOverride).toBe('new-image');
  });
});
