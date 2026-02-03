import { act, renderHook, waitFor } from '@testing-library/react';
import type { Hume } from 'hume';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectOptions } from '../models/connect-options';
import type { useVoiceClient as UseVoiceClientHook } from './useVoiceClient';
import { VoiceReadyState } from './useVoiceClient';
import { useVoice, VoiceProvider } from './VoiceProvider';

const mockStream = { getTracks: () => [] } as unknown as MediaStream;

const getStreamMock = vi.fn().mockResolvedValue(mockStream);
const stopStreamMock = vi.fn();

vi.mock('./useMicrophoneStream', () => ({
  useMicrophoneStream: () => ({
    getStream: getStreamMock,
    stopStream: stopStreamMock,
    permission: 'granted' as const,
  }),
}));

const micStartMock = vi.fn();
const micStopMock = vi.fn().mockResolvedValue(undefined);

vi.mock('./useMicrophone', () => ({
  useMicrophone: () => ({
    start: micStartMock,
    stop: micStopMock,
    mute: vi.fn(),
    unmute: vi.fn(),
    isMuted: false,
    fft: [],
  }),
}));

const initPlayerMock = vi.fn().mockResolvedValue(undefined);
const stopAllMock = vi.fn().mockResolvedValue(undefined);

vi.mock('./useSoundPlayer', () => ({
  useSoundPlayer: () => ({
    initPlayer: initPlayerMock,
    addToQueue: vi.fn(),
    isPlaying: false,
    clearQueue: vi.fn(),
    stopAll: stopAllMock,
    muteAudio: vi.fn(),
    unmuteAudio: vi.fn(),
    isAudioMuted: false,
    queueLength: 0,
    fft: [],
    volume: 1,
    setVolume: vi.fn(),
  }),
}));

vi.mock('./useCallDuration', () => ({
  useCallDuration: () => ({
    timestamp: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

type UseVoiceClientProps = Parameters<UseVoiceClientHook>[0];

let latestVoiceClientProps: UseVoiceClientProps | null = null;
const connectMock = vi.fn(async () => {
  latestVoiceClientProps?.onOpen?.();
  return VoiceReadyState.OPEN;
});
const disconnectMock = vi.fn();
const sendAudioMock = vi.fn();
const sendUserInputMock = vi.fn();
const sendAssistantInputMock = vi.fn();
const sendSessionSettingsMock = vi.fn();
const sendToolMessageMock = vi.fn();
const sendPauseMock = vi.fn();
const sendResumeMock = vi.fn();

const voiceClientStub = {
  readyState: VoiceReadyState.IDLE,
  connect: connectMock,
  disconnect: disconnectMock,
  sendAudio: sendAudioMock,
  sendUserInput: sendUserInputMock,
  sendAssistantInput: sendAssistantInputMock,
  sendSessionSettings: sendSessionSettingsMock,
  sendToolMessage: sendToolMessageMock,
  sendPauseAssistantMessage: sendPauseMock,
  sendResumeAssistantMessage: sendResumeMock,
};

vi.mock('./useVoiceClient', async () => {
  const actual = await vi.importActual<typeof import('./useVoiceClient')>(
    './useVoiceClient',
  );
  const useVoiceClientMock = (props: UseVoiceClientProps) => {
    latestVoiceClientProps = props;
    return voiceClientStub;
  };
  return {
    ...actual,
    useVoiceClient: useVoiceClientMock,
  };
});

describe('useVoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestVoiceClientProps = null;
  });

  it('defaults to an idle ready state', () => {
    const hook = renderHook(() => useVoice(), {
      wrapper: ({ children }) => {
        return <VoiceProvider enableAudioWorklet={false}>{children}</VoiceProvider>;
      },
    });

    expect(hook.result.current.readyState).toBe(VoiceReadyState.IDLE);
  });

  it('records locally generated tool responses', async () => {
    const hook = renderHook(() => useVoice(), {
      wrapper: ({ children }) => (
        <VoiceProvider enableAudioWorklet={false}>{children}</VoiceProvider>
      ),
    });

    const options: ConnectOptions = {
      auth: { type: 'accessToken', value: 'token' },
      configId: 'config-id',
    };

    await act(async () => {
      await hook.result.current.connect(options);
    });

    const response: Hume.empathicVoice.ToolResponseMessage = {
      type: 'tool_response',
      toolCallId: 'call-123',
      content: '{"result":"ok"}',
    };

    await act(async () => {
      hook.result.current.sendToolMessage(response);
    });

    await waitFor(() => {
      expect(sendToolMessageMock).toHaveBeenCalledWith(response);
      expect(
        hook.result.current.toolStatusStore[response.toolCallId]?.resolved?.type,
      ).toBe('tool_response');
      const toolResponses = hook.result.current.messages.filter(
        (msg) => msg.type === 'tool_response',
      );
      expect(toolResponses).toHaveLength(1);
      expect(toolResponses[0]).toMatchObject({
        toolCallId: response.toolCallId,
        content: response.content,
      });
      expect(toolResponses[0]).toHaveProperty('receivedAt');
    });
  });
});
