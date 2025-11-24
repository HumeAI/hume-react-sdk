import { renderHook } from '@testing-library/react-hooks';
import { describe, expect, it, vi } from 'vitest';

import { useMicrophoneStream } from './useMicrophoneStream';

vi.mock('hume', () => ({
  getAudioStream: vi.fn(),
  checkForAudioTracks: vi.fn(),
}));

describe('useGetMicrophoneStream', () => {
  it('is defined', () => {
    expect(useMicrophoneStream).toBeDefined();
  });

  it('getStream function works correctly', async () => {
    const { result } = renderHook(() => useMicrophoneStream());
    await result.current.getStream({});
    expect(result.current.permission).toBe('granted');
  });
});
