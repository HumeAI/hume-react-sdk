import { Channels } from '@humeai/assistant';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RecorderInstance = {
  emitData: (buffer: ArrayBuffer) => void;
  emitDataPromise: (buffer: Promise<ArrayBuffer>) => void;
  startTimeslice?: number;
  state: string;
  stopCalls: number;
};

const recorderMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  instances: [] as RecorderInstance[],
  isTypeSupported: vi.fn((_mimeType: string) => true),
  register: vi.fn(),
}));

vi.mock('extendable-media-recorder', () => ({
  MediaRecorder: class extends EventTarget {
    static isTypeSupported(mimeType: string) {
      return recorderMocks.isTypeSupported(mimeType);
    }

    startTimeslice?: number;

    state = 'inactive';

    stopCalls = 0;

    constructor(_stream: MediaStream, _options: MediaRecorderOptions) {
      super();
      recorderMocks.instances.push(this);
    }

    emitData(buffer: ArrayBuffer) {
      this.emitDataPromise(Promise.resolve(buffer));
    }

    emitDataPromise(buffer: Promise<ArrayBuffer>) {
      const event = new Event('dataavailable');
      Object.defineProperty(event, 'data', {
        value: {
          arrayBuffer: () => buffer,
        },
      });
      this.dispatchEvent(event);
    }

    start(timeslice?: number) {
      this.startTimeslice = timeslice;
      this.state = 'recording';
    }

    stop() {
      this.stopCalls += 1;
      this.state = 'inactive';
    }
  },
  register: recorderMocks.register,
}));

vi.mock('extendable-media-recorder-wav-encoder', () => ({
  connect: recorderMocks.connect,
}));

import { useMicrophone } from './useMicrophone';

const toErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const createDeferred = <T>() => {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
};

const writeChunkId = (view: DataView, offset: number, id: string) => {
  Array.from(id).forEach((character, index) => {
    view.setUint8(offset + index, character.charCodeAt(0));
  });
};

const createWav = (pcm: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);

  writeChunkId(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeChunkId(view, 8, 'WAVE');
  writeChunkId(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, Channels.MONO, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 88200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeChunkId(view, 36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(pcm);

  return buffer;
};

const createStream = (sampleRate = 44100) => {
  const stopTrack = vi.fn();
  const track = {
    getSettings: vi.fn(() => ({
      channelCount: Channels.MONO,
      sampleRate,
    })),
    stop: stopTrack,
  } as unknown as MediaStreamTrack;
  const stream = {
    getAudioTracks: vi.fn(() => [track]),
    getTracks: vi.fn(() => [track]),
  } as unknown as MediaStream;

  return { stopTrack, stream };
};

describe('useMicrophone', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    recorderMocks.connect.mockReset();
    recorderMocks.connect.mockResolvedValue({});
    recorderMocks.instances.length = 0;
    recorderMocks.isTypeSupported.mockReset();
    recorderMocks.isTypeSupported.mockReturnValue(true);
    recorderMocks.register.mockReset();
    recorderMocks.register.mockResolvedValue(undefined);
    getUserMedia.mockReset();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
  });

  it('registers once, emits headerless PCM, and releases every stream', async () => {
    const first = createStream(44100);
    const second = createStream(48000);
    getUserMedia
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    let capturedBuffer: ArrayBuffer | undefined;
    const onAudioCaptured = vi.fn((buffer: ArrayBuffer) => {
      capturedBuffer = buffer;
    });
    const onStartRecording = vi.fn();
    const onStopRecording = vi.fn();
    const onMicPermissionChange = vi.fn();
    const { result } = renderHook(() =>
      useMicrophone({
        encodingConstraints: { channelCount: Channels.MONO },
        onAudioCaptured,
        onMicPermissionChange,
        onStartRecording,
        onStopRecording,
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(recorderMocks.connect).toHaveBeenCalledTimes(1);
    expect(recorderMocks.register).toHaveBeenCalledTimes(1);
    expect(recorderMocks.instances[0]?.startTimeslice).toBe(250);
    expect(onStartRecording).toHaveBeenCalledTimes(1);
    expect(onMicPermissionChange).toHaveBeenCalledWith('granted');

    const pcm = new Uint8Array([1, 2, 3, 4]);
    await act(async () => {
      recorderMocks.instances[0]?.emitData(createWav(pcm));
      await Promise.resolve();
    });
    if (!capturedBuffer) {
      throw new Error('Expected the microphone to emit captured audio.');
    }
    expect(new Uint8Array(capturedBuffer)).toEqual(pcm);

    act(() => {
      result.current.stop();
    });
    expect(first.stopTrack).toHaveBeenCalledTimes(1);
    expect(recorderMocks.instances[0]?.stopCalls).toBe(1);

    await act(async () => {
      await result.current.start();
    });
    expect(recorderMocks.connect).toHaveBeenCalledTimes(1);
    expect(recorderMocks.register).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.stop();
    });
    expect(second.stopTrack).toHaveBeenCalledTimes(1);
    expect(onStopRecording).toHaveBeenCalledTimes(2);
  });

  it('reports permission failures instead of swallowing them', async () => {
    const permissionError = new DOMException(
      'Permission denied',
      'NotAllowedError',
    );
    getUserMedia.mockRejectedValue(permissionError);
    const onError = vi.fn();
    const onMicPermissionChange = vi.fn();
    const { result } = renderHook(() =>
      useMicrophone({
        encodingConstraints: {},
        onAudioCaptured: vi.fn(),
        onError,
        onMicPermissionChange,
      }),
    );

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.start();
      } catch (error) {
        thrownError = error;
      }
    });
    expect(thrownError).toBeInstanceOf(Error);
    expect(toErrorMessage(thrownError)).toContain('Permission denied');
    expect(onMicPermissionChange).toHaveBeenCalledWith('denied');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      'Microphone permission denied.',
      expect.any(Error),
    );
  });

  it('ignores an audio chunk that resolves after its recording stops', async () => {
    const first = createStream();
    const second = createStream();
    const staleChunk = createDeferred<ArrayBuffer>();
    getUserMedia
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    const onAudioCaptured = vi.fn();
    const { result } = renderHook(() =>
      useMicrophone({
        encodingConstraints: {},
        onAudioCaptured,
        onMicPermissionChange: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    recorderMocks.instances[0]?.emitDataPromise(staleChunk.promise);

    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await result.current.start();
      staleChunk.resolve(createWav(new Uint8Array([1, 2])));
      await Promise.resolve();
    });
    expect(onAudioCaptured).not.toHaveBeenCalled();

    await act(async () => {
      recorderMocks.instances[1]?.emitData(createWav(new Uint8Array([3, 4])));
      await Promise.resolve();
    });
    expect(onAudioCaptured).toHaveBeenCalledOnce();
  });

  it('cancels and releases an older overlapping preparation', async () => {
    const first = createStream(44100);
    const second = createStream(48000);
    const firstStream = createDeferred<MediaStream>();
    const secondStream = createDeferred<MediaStream>();
    getUserMedia
      .mockReturnValueOnce(firstStream.promise)
      .mockReturnValueOnce(secondStream.promise);
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useMicrophone({
        encodingConstraints: {},
        onAudioCaptured: vi.fn(),
        onError,
        onMicPermissionChange: vi.fn(),
      }),
    );

    let firstPreparation: Promise<unknown> | undefined;
    let secondPreparation: Promise<unknown> | undefined;
    act(() => {
      firstPreparation = result.current.prepare();
      secondPreparation = result.current.prepare();
    });

    let firstError: unknown;
    await act(async () => {
      firstStream.resolve(first.stream);
      try {
        await firstPreparation;
      } catch (error) {
        firstError = error;
      }
    });
    expect(toErrorMessage(firstError)).toBe(
      'Microphone preparation was cancelled.',
    );
    expect(first.stopTrack).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      secondStream.resolve(second.stream);
      await secondPreparation;
    });
    expect(second.stopTrack).not.toHaveBeenCalled();

    act(() => {
      result.current.stop();
    });
    expect(second.stopTrack).toHaveBeenCalledOnce();
  });

  it('stops the stream when encoder setup fails', async () => {
    const { stopTrack, stream } = createStream();
    getUserMedia.mockResolvedValue(stream);
    recorderMocks.isTypeSupported.mockReturnValue(false);
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useMicrophone({
        encodingConstraints: {},
        onAudioCaptured: vi.fn(),
        onError,
        onMicPermissionChange: vi.fn(),
      }),
    );

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.prepare();
      } catch (error) {
        thrownError = error;
      }
    });
    expect(toErrorMessage(thrownError)).toContain(
      'This browser cannot record LINEAR16 microphone audio.',
    );
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledOnce();
  });
});
