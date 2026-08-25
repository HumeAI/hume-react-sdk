import { AudioEncoding, createConfig } from '@humeai/assistant';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ReadyState, useAssistantClient } from './useAssistantClient';
import { type EncodingValues, useMicrophone } from './useMicrophone';
import { useSoundPlayer } from './useSoundPlayer';

type AssistantStatus =
  | {
      value: 'disconnected' | 'connecting' | 'connected';
      reason?: never;
    }
  | {
      value: 'error';
      reason: string;
    };

const toError = (error: unknown): Error => {
  return error instanceof Error ? error : new Error(String(error));
};

export const useAssistant = (props: Parameters<typeof createConfig>[0]) => {
  const [status, setStatus] = useState<AssistantStatus>({
    value: 'disconnected',
  });
  const connectionAttemptRef = useRef(0);
  const config = createConfig(props);
  const configRef = useRef(config);
  configRef.current = config;

  const {
    addToQueue,
    fft,
    initPlayer,
    isPlaying,
    stopAll: stopAllAudio,
  } = useSoundPlayer();

  const handleError = useCallback((message: string, error: Error) => {
    setStatus({ value: 'error', reason: `${message} ${error.message}` });
  }, []);

  const {
    connect: connectClient,
    disconnect: disconnectClient,
    messages,
    readyState,
    sendAudio,
  } = useAssistantClient({
    config: {
      ...config,
      encoding: AudioEncoding.LINEAR16,
    },
    onAudioMessage: addToQueue,
    onError: (error) => {
      handleError('Assistant connection error.', error);
    },
  });

  const encodingConstraints = useMemo(
    () => ({
      sampleRate: config.sampleRate,
      channelCount: config.channels,
    }),
    [config.channels, config.sampleRate],
  );

  const {
    isMuted,
    mute,
    prepare: prepareMicrophone,
    startPreparedRecording,
    stop: stopMicrophone,
    unmute,
  } = useMicrophone({
    encodingConstraints,
    onAudioCaptured: sendAudio,
    onError: handleError,
    onMicPermissionChange: (permission) => {
      if (permission === 'denied') {
        setStatus({
          value: 'error',
          reason: 'Microphone permission denied.',
        });
      }
    },
  });

  const connect = useCallback(async () => {
    const connectionAttempt = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = connectionAttempt;
    disconnectClient();
    stopAllAudio();
    setStatus({ value: 'connecting' });

    let encodingValues: EncodingValues;

    try {
      encodingValues = await prepareMicrophone();
    } catch {
      if (connectionAttempt === connectionAttemptRef.current) {
        disconnectClient();
        stopMicrophone();
      }
      return;
    }

    if (connectionAttempt !== connectionAttemptRef.current) {
      return;
    }

    try {
      connectClient({
        ...configRef.current,
        channels: encodingValues.channelCount,
        encoding: AudioEncoding.LINEAR16,
        sampleRate: encodingValues.sampleRate,
      });
    } catch (error) {
      const normalizedError = toError(error);
      handleError('Error connecting assistant.', normalizedError);
      stopMicrophone();
    }
  }, [
    connectClient,
    disconnectClient,
    handleError,
    prepareMicrophone,
    stopAllAudio,
    stopMicrophone,
  ]);

  const disconnect = useCallback(() => {
    connectionAttemptRef.current += 1;
    disconnectClient();
    stopAllAudio();
    stopMicrophone();
    setStatus({ value: 'disconnected' });
  }, [disconnectClient, stopAllAudio, stopMicrophone]);

  useEffect(() => {
    if (readyState !== ReadyState.OPEN || status.value !== 'connecting') {
      return;
    }

    try {
      initPlayer();
      startPreparedRecording();
      setStatus({ value: 'connected' });
    } catch (error) {
      const normalizedError = toError(error);
      handleError('Error starting assistant audio.', normalizedError);
      disconnectClient();
      stopMicrophone();
    }
  }, [
    disconnectClient,
    handleError,
    initPlayer,
    readyState,
    startPreparedRecording,
    status.value,
    stopMicrophone,
  ]);

  return {
    connect,
    disconnect,
    fft,
    isMuted,
    isPlaying,
    messages,
    mute,
    readyState,
    status,
    unmute,
  };
};
