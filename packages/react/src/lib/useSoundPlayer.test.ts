import { act, renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSoundPlayer } from './useSoundPlayer';
import type { AudioOutputMessage } from '../models/messages';

vi.mock('./generateEmptyFft', () => ({
  generateEmptyFft: () => new Uint8Array(32).fill(0),
}));

vi.mock('./convertFrequencyScale', () => ({
  convertLinearFrequenciesToBark: (data: Uint8Array) => Array.from(data),
  convertLinearFrequenciesToBarkInto: (
    data: Uint8Array,
    _sampleRate: number,
    out: number[],
  ) => {
    for (let i = 0; i < out.length; i++) {
      out[i] = data[i] ?? 0;
    }
    return out;
  },
}));

vi.mock('hume', () => ({
  convertBase64ToBlob: (base64: string) => ({
    arrayBuffer: () =>
      Promise.resolve(Uint8Array.from([base64.charCodeAt(0)]).buffer),
  }),
}));

vi.mock('../utils/loadAudioWorklet', () => ({
  loadAudioWorklet: vi.fn(() => Promise.resolve(true)),
}));

const createFakeAudioBuffer = (index: number): AudioBuffer =>
  ({
    getChannelData: () => new Float32Array([index]),
    sampleRate: 48000,
  }) as unknown as AudioBuffer;

const fakePort: MessagePort & { postMessage: Mock } = {
  postMessage: vi.fn(),
  close: vi.fn(),
  onmessage: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
} as unknown as MessagePort & { postMessage: Mock };

describe('useSoundPlayer', () => {
  let originalAudioContext: typeof globalThis.AudioContext;
  let originalAudioWorkletNode: typeof globalThis.AudioWorkletNode;

  beforeEach(() => {
    originalAudioContext = globalThis.AudioContext;
    originalAudioWorkletNode = globalThis.AudioWorkletNode;

    globalThis.AudioContext = vi.fn().mockImplementation(() => ({
      createAnalyser: () => ({
        fftSize: 2048,
        frequencyBinCount: 1024,
        connect: vi.fn(),
        getByteFrequencyData: vi.fn(),
      }),
      createGain: () => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn() },
      }),
      createBufferSource: () => ({
        connect: vi.fn(),
        start: vi.fn(),
        disconnect: vi.fn(),
      }),
      destination: {},
      decodeAudioData: vi.fn((buffer: ArrayBuffer) =>
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Promise.resolve(createFakeAudioBuffer(new Uint8Array(buffer)[0]!)),
      ),
      close: vi.fn(),
      sampleRate: 48000,
    }));

    globalThis.AudioWorkletNode = vi.fn().mockImplementation(() => ({
      port: fakePort,
      connect: vi.fn(),
      disconnect: vi.fn(),
    }));
  });

  afterEach(() => {
    globalThis.AudioContext = originalAudioContext;
    globalThis.AudioWorkletNode = originalAudioWorkletNode;
    vi.restoreAllMocks();
  });

  it('plays chunks in correct order when received in order', async () => {
    const onError = vi.fn();
    const onPlayAudio = vi.fn();
    const onStopAudio = vi.fn();

    const { result } = renderHook(() =>
      useSoundPlayer({
        enableAudioWorklet: true,
        onError,
        onPlayAudio,
        onStopAudio,
      }),
    );

    await act(() => result.current.initPlayer());

    const messages: AudioOutputMessage[] = [
      {
        id: 'abc',
        index: 0,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 1,
        data: '\x00',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 2,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 3,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
    ];

    await act(async () => {
      for (const msg of messages) {
        await result.current.addToQueue(msg);
      }
    });

    expect(fakePort.postMessage).toHaveBeenCalledTimes(4);
    expect(fakePort.postMessage.mock.calls[0]?.[0]).toMatchObject({
      id: 'abc',
      index: 0,
    });
    expect(fakePort.postMessage.mock.calls[1]?.[0]).toMatchObject({
      id: 'abc',
      index: 1,
    });
    expect(fakePort.postMessage.mock.calls[2]?.[0]).toMatchObject({
      id: 'abc',
      index: 2,
    });
    expect(fakePort.postMessage.mock.calls[3]?.[0]).toMatchObject({
      id: 'abc',
      index: 3,
    });
  });

  it('plays chunks in correct order when received out of order', async () => {
    const onError = vi.fn();
    const onPlayAudio = vi.fn();
    const onStopAudio = vi.fn();

    const { result } = renderHook(() =>
      useSoundPlayer({
        enableAudioWorklet: true,
        onError,
        onPlayAudio,
        onStopAudio,
      }),
    );

    await act(() => result.current.initPlayer());

    const messages: AudioOutputMessage[] = [
      {
        id: 'abc',
        index: 2,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 1,
        data: '\x01',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 0,
        data: '\x00',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
    ];

    await act(async () => {
      for (const msg of messages) {
        await result.current.addToQueue(msg);
      }
    });

    expect(fakePort.postMessage).toHaveBeenCalledTimes(3);
    expect(fakePort.postMessage.mock.calls[0]?.[0]).toMatchObject({
      id: 'abc',
      index: 0,
    });
    expect(fakePort.postMessage.mock.calls[1]?.[0]).toMatchObject({
      id: 'abc',
      index: 1,
    });
    expect(fakePort.postMessage.mock.calls[2]?.[0]).toMatchObject({
      id: 'abc',
      index: 2,
    });
  });

  it('plays chunks in correct order when received out of order after the chunk at index 0 is received in order', async () => {
    const onError = vi.fn();
    const onPlayAudio = vi.fn();
    const onStopAudio = vi.fn();

    const { result } = renderHook(() =>
      useSoundPlayer({
        enableAudioWorklet: true,
        onError,
        onPlayAudio,
        onStopAudio,
      }),
    );

    await act(() => result.current.initPlayer());

    const messages: AudioOutputMessage[] = [
      {
        id: 'abc',
        index: 0,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 3,
        data: '\x00',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 2,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 1,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 4,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
    ];

    await act(async () => {
      for (const msg of messages) {
        await result.current.addToQueue(msg);
      }
    });

    expect(fakePort.postMessage).toHaveBeenCalledTimes(5);
    expect(fakePort.postMessage.mock.calls[0]?.[0]).toMatchObject({
      id: 'abc',
      index: 0,
    });
    expect(fakePort.postMessage.mock.calls[1]?.[0]).toMatchObject({
      id: 'abc',
      index: 1,
    });
    expect(fakePort.postMessage.mock.calls[2]?.[0]).toMatchObject({
      id: 'abc',
      index: 2,
    });
    expect(fakePort.postMessage.mock.calls[3]?.[0]).toMatchObject({
      id: 'abc',
      index: 3,
    });
    expect(fakePort.postMessage.mock.calls[4]?.[0]).toMatchObject({
      id: 'abc',
      index: 4,
    });
  });

  it('handles chunks from different message ids', async () => {
    const onError = vi.fn();
    const onPlayAudio = vi.fn();
    const onStopAudio = vi.fn();

    const { result } = renderHook(() =>
      useSoundPlayer({
        enableAudioWorklet: true,
        onError,
        onPlayAudio,
        onStopAudio,
      }),
    );

    await act(() => result.current.initPlayer());

    const messages: AudioOutputMessage[] = [
      {
        id: 'abc',
        index: 0,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 2,
        data: '\x00',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'abc',
        index: 1,
        data: '\x00',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'def',
        index: 1,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'def',
        index: 2,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
      {
        id: 'def',
        index: 0,
        data: '\x02',
        type: 'audio_output',
        receivedAt: new Date(0),
      },
    ];

    await act(async () => {
      for (const msg of messages) {
        await result.current.addToQueue(msg);
      }
    });

    expect(fakePort.postMessage).toHaveBeenCalledTimes(6);
    expect(fakePort.postMessage.mock.calls[0]?.[0]).toMatchObject({
      id: 'abc',
      index: 0,
    });
    expect(fakePort.postMessage.mock.calls[1]?.[0]).toMatchObject({
      id: 'abc',
      index: 1,
    });
    expect(fakePort.postMessage.mock.calls[2]?.[0]).toMatchObject({
      id: 'abc',
      index: 2,
    });
    expect(fakePort.postMessage.mock.calls[3]?.[0]).toMatchObject({
      id: 'def',
      index: 0,
    });
    expect(fakePort.postMessage.mock.calls[4]?.[0]).toMatchObject({
      id: 'def',
      index: 1,
    });
    expect(fakePort.postMessage.mock.calls[5]?.[0]).toMatchObject({
      id: 'def',
      index: 2,
    });
  });
});
