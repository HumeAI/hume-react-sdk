import { Channels } from '@humeai/assistant';
import { describe, expect, it, vi } from 'vitest';

import { getStreamSettings } from './getMicrophoneDefaults';

const createTrack = (settings: MediaTrackSettings): MediaStreamTrack => {
  return {
    getSettings: vi.fn(() => settings),
  } as unknown as MediaStreamTrack;
};

const createStream = (tracks: MediaStreamTrack[]): MediaStream => {
  return {
    getAudioTracks: vi.fn(() => tracks),
  } as unknown as MediaStream;
};

describe('getStreamSettings', () => {
  it('reports the actual track settings instead of the requested ideals', () => {
    const stream = createStream([
      createTrack({ channelCount: Channels.STEREO, sampleRate: 44100 }),
    ]);

    expect(
      getStreamSettings(stream, {
        channelCount: Channels.MONO,
        sampleRate: 16000,
      }),
    ).toEqual({
      channelCount: Channels.STEREO,
      sampleRate: 44100,
    });
  });

  it('falls back to requested values when a browser omits track settings', () => {
    const stream = createStream([createTrack({})]);

    expect(
      getStreamSettings(stream, {
        channelCount: Channels.STEREO,
        sampleRate: 32000,
      }),
    ).toEqual({
      channelCount: Channels.STEREO,
      sampleRate: 32000,
    });
  });

  it('uses encoding defaults when neither settings nor requests are available', () => {
    const stream = createStream([createTrack({})]);

    expect(getStreamSettings(stream)).toEqual({
      channelCount: Channels.MONO,
      sampleRate: 48000,
    });
  });

  it('uses the first audio track when a stream contains multiple tracks', () => {
    const stream = createStream([
      createTrack({ channelCount: Channels.MONO, sampleRate: 16000 }),
      createTrack({ channelCount: Channels.STEREO, sampleRate: 48000 }),
    ]);

    expect(getStreamSettings(stream)).toEqual({
      channelCount: Channels.MONO,
      sampleRate: 16000,
    });
  });

  it('rejects a stream without an audio track', () => {
    expect(() => getStreamSettings(createStream([]))).toThrow(
      'The microphone stream has no audio track.',
    );
  });

  it('rejects channel counts the backend cannot describe', () => {
    const stream = createStream([
      createTrack({ channelCount: 6, sampleRate: 48000 }),
    ]);

    expect(() => getStreamSettings(stream)).toThrow(
      'Unsupported microphone channel count: 6',
    );
  });
});
