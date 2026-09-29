import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoice, VoiceProvider } from './VoiceProvider';

type FakeTrack = { stop: ReturnType<typeof vi.fn>; enabled: boolean };

const createFakeStream = () => {
  const track: FakeTrack = { stop: vi.fn(), enabled: true };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
};

describe('VoiceProvider disconnect while the microphone prompt is pending', () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalMediaDevices = navigator.mediaDevices;
  let audioContexts: Array<{ close: ReturnType<typeof vi.fn> }>;

  beforeEach(() => {
    audioContexts = [];
    globalThis.AudioContext = vi.fn().mockImplementation(() => {
      const context = {
        close: vi.fn(() => Promise.resolve()),
        state: 'running',
        sampleRate: 48000,
      };
      audioContexts.push(context);
      return context;
    }) as unknown as typeof AudioContext;
  });

  afterEach(() => {
    globalThis.AudioContext = originalAudioContext;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it('releases the microphone and audio context when disconnect() runs before getUserMedia resolves', async () => {
    const { stream, track } = createFakeStream();
    let resolveStream: (s: MediaStream) => void = () => {};
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(
          () =>
            new Promise<MediaStream>((resolve) => {
              resolveStream = resolve;
            }),
        ),
      },
      configurable: true,
    });

    const { result } = renderHook(() => useVoice(), {
      wrapper: ({ children }) => <VoiceProvider>{children}</VoiceProvider>,
    });

    let connectPromise: Promise<void> = Promise.resolve();
    act(() => {
      connectPromise = result.current.connect({
        auth: { type: 'accessToken', value: 'token' },
      });
    });

    await act(async () => {
      await result.current.disconnect();
    });

    await act(async () => {
      resolveStream(stream);
      await connectPromise;
    });

    expect(track.stop).toHaveBeenCalled();
    expect(audioContexts).toHaveLength(0);
  });
});
