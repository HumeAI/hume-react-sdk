import { renderHook } from '@testing-library/react-hooks';
import { describe, expect, it, vi } from 'vitest';

import { useMicrophoneStream } from './useMicrophoneStream';

vi.mock('hume', () => ({
  checkForAudioTracks: vi.fn(),
}));

const getUserMediaMock = vi.fn(() => Promise.resolve({}));

Object.defineProperty(window.navigator, 'mediaDevices', {
  value: {
    getUserMedia: getUserMediaMock,
  },
  configurable: true,
});

describe('useGetMicrophoneStream', () => {
  it('is defined', () => {
    expect(useMicrophoneStream).toBeDefined();
  });

  it('getStream function works correctly', async () => {
    const { result } = renderHook(() => useMicrophoneStream());

    await result.current.getStream({
      deviceId: 'test-device-id',
    });

    expect(result.current.permission).toBe('granted');

    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: 'test-device-id',
        },
        video: false,
      }),
    );
  });
});
