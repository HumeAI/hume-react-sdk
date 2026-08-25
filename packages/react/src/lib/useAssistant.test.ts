import { AudioEncoding, Channels } from '@humeai/assistant';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssistant } from './useAssistant';
import type { EncodingValues } from './useMicrophone';

const assistantMocks = vi.hoisted(() => ({
  addToQueue: vi.fn(),
  connectClient: vi.fn(),
  disconnectClient: vi.fn(),
  initPlayer: vi.fn(),
  prepareMicrophone: vi.fn(),
  sendAudio: vi.fn(),
  startPreparedRecording: vi.fn(),
  stopAllAudio: vi.fn(),
  stopMicrophone: vi.fn(),
}));

vi.mock('./useAssistantClient', () => ({
  ReadyState: {
    CLOSED: 'closed',
    CONNECTING: 'connecting',
    IDLE: 'idle',
    OPEN: 'open',
  },
  useAssistantClient: () => ({
    connect: assistantMocks.connectClient,
    disconnect: assistantMocks.disconnectClient,
    messages: [],
    readyState: 'idle',
    sendAudio: assistantMocks.sendAudio,
  }),
}));

vi.mock('./useMicrophone', () => ({
  useMicrophone: () => ({
    isMuted: false,
    mute: vi.fn(),
    prepare: assistantMocks.prepareMicrophone,
    startPreparedRecording: assistantMocks.startPreparedRecording,
    stop: assistantMocks.stopMicrophone,
    unmute: vi.fn(),
  }),
}));

vi.mock('./useSoundPlayer', () => ({
  useSoundPlayer: () => ({
    addToQueue: assistantMocks.addToQueue,
    fft: [],
    initPlayer: assistantMocks.initPlayer,
    isPlaying: false,
    stopAll: assistantMocks.stopAllAudio,
  }),
}));

const createDeferred = <T>() => {
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });

  return { promise, reject: rejectPromise, resolve: resolvePromise };
};

describe('useAssistant', () => {
  beforeEach(() => {
    Object.values(assistantMocks).forEach((mock) => mock.mockReset());
  });

  it('waits for fresh microphone settings before every socket connection', async () => {
    const firstSettings = createDeferred<EncodingValues>();
    const secondSettings = createDeferred<EncodingValues>();
    assistantMocks.prepareMicrophone
      .mockReturnValueOnce(firstSettings.promise)
      .mockReturnValueOnce(secondSettings.promise);
    const { result } = renderHook(() =>
      useAssistant({ apiKey: 'test-api-key' }),
    );

    let firstConnection: Promise<void> | undefined;
    act(() => {
      firstConnection = result.current.connect();
    });
    expect(assistantMocks.connectClient).not.toHaveBeenCalled();

    await act(async () => {
      firstSettings.resolve({
        channelCount: Channels.STEREO,
        sampleRate: 44100,
      });
      await firstConnection;
    });
    expect(assistantMocks.connectClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channels: Channels.STEREO,
        encoding: AudioEncoding.LINEAR16,
        sampleRate: 44100,
      }),
    );

    let secondConnection: Promise<void> | undefined;
    act(() => {
      secondConnection = result.current.connect();
    });
    expect(assistantMocks.connectClient).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondSettings.resolve({
        channelCount: Channels.MONO,
        sampleRate: 16000,
      });
      await secondConnection;
    });
    expect(assistantMocks.connectClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channels: Channels.MONO,
        encoding: AudioEncoding.LINEAR16,
        sampleRate: 16000,
      }),
    );
  });

  it('does not let an obsolete connection failure stop a newer attempt', async () => {
    const obsoleteSettings = createDeferred<EncodingValues>();
    const currentSettings = createDeferred<EncodingValues>();
    assistantMocks.prepareMicrophone
      .mockReturnValueOnce(obsoleteSettings.promise)
      .mockReturnValueOnce(currentSettings.promise);
    const { result } = renderHook(() =>
      useAssistant({ apiKey: 'test-api-key' }),
    );

    let obsoleteConnection: Promise<void> | undefined;
    let currentConnection: Promise<void> | undefined;
    act(() => {
      obsoleteConnection = result.current.connect();
      currentConnection = result.current.connect();
    });

    await act(async () => {
      obsoleteSettings.reject(new Error('cancelled'));
      await obsoleteConnection;
    });
    expect(assistantMocks.stopMicrophone).not.toHaveBeenCalled();
    expect(assistantMocks.connectClient).not.toHaveBeenCalled();

    await act(async () => {
      currentSettings.resolve({
        channelCount: Channels.MONO,
        sampleRate: 24000,
      });
      await currentConnection;
    });
    expect(assistantMocks.connectClient).toHaveBeenCalledTimes(1);
  });
});
