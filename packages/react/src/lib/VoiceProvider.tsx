import { type Hume } from 'hume';
import React, {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { ConnectionMessage } from './connection-message';
import type { FftSnapshot } from './fftStore';
import { FftStore, useFftSubscription } from './fftStore';
import type { CallDurationStore } from './useCallDuration';
import { useLatestRef } from './useLatestRef';
import { noop } from './noop';
import { useCallDuration } from './useCallDuration';
import { useMessages } from './useMessages';
import { useMicrophone } from './useMicrophone';
import { useMicrophoneStream } from './useMicrophoneStream';
import { useSoundPlayer } from './useSoundPlayer';
import { useToolStatus } from './useToolStatus';
import {
  ToolCallHandler,
  useVoiceClient,
  VoiceReadyState,
} from './useVoiceClient';
import { ConnectOptions } from '../models/connect-options';
import {
  AssistantProsodyMessage,
  AssistantTranscriptMessage,
  AudioOutputMessage,
  ChatMetadataMessage,
  JSONMessage,
  UserInterruptionMessage,
  UserTranscriptMessage,
} from '../models/messages';

export type SocketErrorReason =
  | 'socket_connection_failure'
  | 'failed_to_send_audio'
  | 'failed_to_send_message'
  | 'received_assistant_error_message'
  | 'received_tool_call_error';

export type AudioPlayerErrorReason =
  | 'audio_player_initialization_failure'
  | 'audio_worklet_load_failure'
  | 'audio_player_not_initialized'
  | 'malformed_audio'
  | 'audio_player_closure_failure';

export type MicErrorReason =
  | 'mic_permission_denied'
  | 'mic_initialization_failure'
  | 'mic_closure_failure'
  | 'mime_types_not_supported';

type VoiceError =
  | {
      type: 'socket_error';
      reason: SocketErrorReason;
      message: string;
      error?: Error;
    }
  | {
      type: 'audio_error';
      reason: AudioPlayerErrorReason;
      message: string;
      error?: Error;
    }
  | {
      type: 'mic_error';
      reason: MicErrorReason;
      message: string;
      error?: Error;
    };

type VoiceStatus =
  | {
      value: 'disconnected' | 'connecting' | 'connected';
      reason?: never;
    }
  | {
      value: 'error';
      reason: string;
    };

type ResourceStatus =
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected';

export type VoiceContextType = {
  connect: (options: ConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
  /** @deprecated Use `usePlayerFft()` for real-time FFT data instead. This value is stale and only updates when other context values change. */
  fft: number[];
  isMuted: boolean;
  isAudioMuted: boolean;
  isPlaying: boolean;
  messages: (JSONMessage | ConnectionMessage)[];
  lastVoiceMessage: AssistantTranscriptMessage | null;
  lastUserMessage: UserTranscriptMessage | null;
  lastAssistantProsodyMessage: AssistantProsodyMessage | null;
  clearMessages: () => void;
  mute: () => void;
  unmute: () => void;
  muteAudio: () => void;
  unmuteAudio: () => void;
  readyState: VoiceReadyState;
  sendUserInput: (text: string) => void;
  sendAssistantInput: (text: string) => void;
  sendSessionSettings: Hume.empathicVoice.chat.ChatSocket['sendSessionSettings'];
  sendToolMessage: (
    type:
      | Hume.empathicVoice.ToolResponseMessage
      | Hume.empathicVoice.ToolErrorMessage,
  ) => void;
  pauseAssistant: () => void;
  resumeAssistant: () => void;
  status: VoiceStatus;
  /** @deprecated Use `useMicFft()` for real-time FFT data instead. This value is stale and only updates when other context values change. */
  micFft: number[];
  error: VoiceError | null;
  isAudioError: boolean;
  isError: boolean;
  isMicrophoneError: boolean;
  isSocketError: boolean;
  /** @deprecated Use `useCallDurationTimestamp` for real-time call duration instead. This value is stale and only updates when other context values change. */
  callDurationTimestamp: string | null;
  toolStatusStore: ReturnType<typeof useToolStatus>['store'];
  chatMetadata: ChatMetadataMessage | null;
  playerQueueLength: number;
  isPaused: boolean;
  volume: number;
  setVolume: (level: number) => void;
};

const VoiceContext = createContext<VoiceContextType | null>(null);

export type VoiceProviderProps = PropsWithChildren<{
  onMessage?: (message: JSONMessage) => void;
  onError?: (err: VoiceError) => void;
  onOpen?: () => void;
  onClose?: Hume.empathicVoice.chat.ChatSocket.EventHandlers['close'];
  onToolCall?: ToolCallHandler;
  onAudioReceived?: (audioOutputMessage: AudioOutputMessage) => void;
  onAudioStart?: (clipId: string) => void;
  onAudioEnd?: (clipId: string) => void;
  onInterruption?: (
    message: UserTranscriptMessage | UserInterruptionMessage,
  ) => void;
  /**
   * @default true
   * @description Clear messages when the voice is disconnected.
   */
  clearMessagesOnDisconnect?: boolean;
  /**
   * @default 100
   * @description The maximum number of messages to keep in memory.
   */
  messageHistoryLimit?: number;
  enableAudioWorklet?: boolean;
}>;

export const useVoice = () => {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice must be used within an VoiceProvider');
  }
  return ctx;
};

const StoresContext = createContext<{
  playerFftStore: FftStore;
  micFftStore: FftStore;
  callDurationStore: CallDurationStore;
} | null>(null);

export const usePlayerFft = (): FftSnapshot => {
  const ctx = useContext(StoresContext);
  if (!ctx) {
    throw new Error('usePlayerFft must be used within a VoiceProvider');
  }
  return useFftSubscription(ctx.playerFftStore);
};

export const useMicFft = (): FftSnapshot => {
  const ctx = useContext(StoresContext);
  if (!ctx) {
    throw new Error('useMicFft must be used within a VoiceProvider');
  }
  return useFftSubscription(ctx.micFftStore);
};

export const useCallDurationTimestamp = (): string | null => {
  const ctx = useContext(StoresContext);
  if (!ctx) {
    throw new Error('useCallDurationTimestamp must be used within a VoiceProvider');
  }
  return useSyncExternalStore(
    ctx.callDurationStore.subscribe,
    ctx.callDurationStore.getSnapshot,
    ctx.callDurationStore.getServerSnapshot,
  );
};

export const VoiceProvider: FC<VoiceProviderProps> = ({
  children,
  clearMessagesOnDisconnect = true,
  messageHistoryLimit = 100,
  enableAudioWorklet = true,
  ...props
}) => {
  const {
    store: callDurationStore,
    start: startTimer,
    stop: stopTimer,
  } = useCallDuration();

  const [status, setStatus] = useState<VoiceStatus>({
    value: 'disconnected',
  });
  const isConnectingRef = useRef(false);
  const sharedAudioContextRef = useRef<AudioContext | null>(null);

  // stores information about whether certain resources are being disconnected
  const resourceStatusRef = useRef<{
    mic: ResourceStatus;
    audioPlayer: ResourceStatus;
    socket: ResourceStatus;
  }>({
    mic: 'disconnected',
    audioPlayer: 'disconnected',
    socket: 'disconnected',
  });

  const [isPaused, setIsPaused] = useState(false);

  // error handling
  const [error, setError] = useState<VoiceError | null>(null);
  const isError = error !== null;
  const isMicrophoneError = error?.type === 'mic_error';
  const isSocketError = error?.type === 'socket_error';
  const isAudioError = error?.type === 'audio_error';

  const onError = useLatestRef(props.onError ?? noop);
  const onOpen = useLatestRef(props.onOpen ?? noop);
  const onClose = useLatestRef(props.onClose ?? noop);
  const onMessage = useLatestRef(props.onMessage ?? noop);
  const onAudioReceived = useLatestRef(props.onAudioReceived ?? noop);
  const onAudioStart = useLatestRef(props.onAudioStart ?? noop);
  const onAudioEnd = useLatestRef(props.onAudioEnd ?? noop);
  const onInterruption = useLatestRef(props.onInterruption ?? noop);

  const toolStatus = useToolStatus();

  const messageStore = useMessages({
    sendMessageToParent: onMessage.current,
    messageHistoryLimit,
  });

  const checkIsDisconnected = useCallback(() => {
    return (
      resourceStatusRef.current.mic === 'disconnected' ||
      resourceStatusRef.current.audioPlayer === 'disconnected' ||
      resourceStatusRef.current.socket === 'disconnected'
    );
  }, []);

  const checkIsDisconnecting = useCallback(() => {
    return (
      resourceStatusRef.current.mic === 'disconnecting' ||
      resourceStatusRef.current.audioPlayer === 'disconnecting' ||
      resourceStatusRef.current.socket === 'disconnecting'
    );
  }, []);

  const updateError = useCallback((err: VoiceError | null) => {
    setError(err);
    if (err !== null) {
      onError.current?.(err);
    }
  }, []);

  const onClientError: NonNullable<
    Parameters<typeof useVoiceClient>[0]['onClientError']
  > = useCallback(
    (msg, err) => {
      stopTimer();
      const message = `A websocket connection could not be established. Error message: ${msg ?? 'unknown'}`;
      updateError({
        type: 'socket_error',
        reason: 'socket_connection_failure',
        message,
        error: err,
      });
    },
    [stopTimer, updateError],
  );

  const config = props;

  const micStopFnRef = useRef<null | (() => Promise<void>)>(null);

  const player = useSoundPlayer({
    enableAudioWorklet,
    onError: (message, reason) => {
      if (checkIsDisconnecting() || checkIsDisconnected()) {
        return;
      }
      updateError({ type: 'audio_error', reason, message });
    },
    onPlayAudio: (id: string) => {
      messageStore.onPlayAudio(id);
      onAudioStart.current(id);
    },
    onStopAudio: (id: string) => {
      onAudioEnd.current(id);
    },
  });

  const {
    onMessage: messageStoreOnMessage,
    createConnectMessage,
    createDisconnectMessage,
    createSessionSettingsMessage,
    clearMessages: clearMessageStore,
  } = messageStore;
  const { addToQueue: playerAddToQueue, clearQueue: playerClearQueue, stopAll: playerStopAll } = player;
  const { addToStore: toolStatusAddToStore, clearStore: toolStatusClearStore } = toolStatus;
  const playerIsPlayingRef = useLatestRef(player.isPlaying);

  const { getStream, stopStream } = useMicrophoneStream();

  const client = useVoiceClient({
    onAudioMessage: useCallback(
      (message: AudioOutputMessage) => {
        if (checkIsDisconnecting() || checkIsDisconnected()) {
          return;
        }
        void playerAddToQueue(message);
        onAudioReceived.current(message);
      },
      [checkIsDisconnected, checkIsDisconnecting, playerAddToQueue],
    ),
    onMessage: useCallback(
      (message: JSONMessage) => {
        if (checkIsDisconnecting() || checkIsDisconnected()) {
          return;
        }

        messageStoreOnMessage(message);

        if (
          message.type === 'user_interruption' ||
          message.type === 'user_message'
        ) {
          if (playerIsPlayingRef.current) {
            onInterruption.current(message);
          }
          playerClearQueue();
        }

        if (
          message.type === 'tool_call' ||
          message.type === 'tool_response' ||
          message.type === 'tool_error'
        ) {
          toolStatusAddToStore(message);
        }

        if (message.type === 'error') {
          const error: VoiceError = {
            type: 'socket_error',
            reason: 'received_assistant_error_message',
            message: message.message,
          };
          onError.current?.(error);
        }
      },
      [
        checkIsDisconnected,
        checkIsDisconnecting,
        messageStoreOnMessage,
        playerClearQueue,
        toolStatusAddToStore,
      ],
    ),
    onSessionSettings: useCallback(
      (sessionSettings: Hume.empathicVoice.SessionSettings) => {
        if (checkIsDisconnecting() || checkIsDisconnected()) {
          return;
        }
        createSessionSettingsMessage(sessionSettings);
      },
      [checkIsDisconnected, checkIsDisconnecting, createSessionSettingsMessage],
    ),
    onClientError,
    onToolCallError: useCallback(
      (message: string, err?: Error) => {
        const error: VoiceError = {
          type: 'socket_error',
          reason: 'received_tool_call_error',
          message,
          error: err,
        };
        updateError(error);
      },
      [updateError],
    ),
    onOpen: useCallback(() => {
      startTimer();
      createConnectMessage();
      onOpen.current?.();
    }, [startTimer, createConnectMessage]),
    onClose: useCallback<
      NonNullable<Hume.empathicVoice.chat.ChatSocket.EventHandlers['close']>
    >(
      (event) => {
        // onClose handler needs to handle resource cleanup in the event that the
        // websocket connection is closed by the server and not the user/client
        stopTimer();
        isConnectingRef.current = false;
        resourceStatusRef.current.socket = 'disconnected';

        createDisconnectMessage(event);
        if (clearMessagesOnDisconnect) {
          clearMessageStore();
        }
        toolStatusClearStore();
        setIsPaused(false);

        const resourceShutdownFns = [];
        if (resourceStatusRef.current.audioPlayer === 'connected') {
          resourceShutdownFns.push(playerStopAll());
        }
        if (resourceStatusRef.current.mic === 'connected') {
          resourceShutdownFns.push(micStopFnRef.current?.());
        }

        if (resourceShutdownFns.length > 0) {
          void Promise.all(resourceShutdownFns).then(() => {
            resourceStatusRef.current.audioPlayer = 'disconnected';
            resourceStatusRef.current.mic = 'disconnected';
            setStatus({ value: 'disconnected' });
            onClose.current?.(event);
          });
        } else {
          onClose.current?.(event);
        }
      },
      [clearMessagesOnDisconnect, createDisconnectMessage, clearMessageStore, playerStopAll, stopTimer, toolStatusClearStore],
    ),
    onToolCall: props.onToolCall,
  });

  const {
    sendAudio: clientSendAudio,
    sendUserInput: clientSendUserInput,
    sendAssistantInput: clientSendAssistantInput,
    sendSessionSettings: clientSendSessionSettings,
    sendToolMessage: clientSendToolMessage,
    sendPauseAssistantMessage,
    sendResumeAssistantMessage,
    connect: clientConnect,
    disconnect: clientDisconnect,
  } = client;
  const clientReadyStateRef = useLatestRef(client.readyState);

  const mic = useMicrophone({
    onAudioCaptured: useCallback(
      (arrayBuffer) => {
        if (
          resourceStatusRef.current.socket === 'disconnecting' ||
          resourceStatusRef.current.socket === 'disconnected'
        ) {
          // if socket is being disconnected, don't try to send audio
          return;
        }
        try {
          clientSendAudio(arrayBuffer);
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          updateError({
            type: 'socket_error',
            reason: 'failed_to_send_audio',
            message,
          });
        }
      },
      [clientSendAudio, updateError],
    ),
    onError: useCallback(
      (message, reason) => {
        updateError({ type: 'mic_error', reason, message });
      },
      [updateError],
    ),
  });

  const { start: micStart, stop: micStop } = mic;

  useEffect(() => {
    micStopFnRef.current = micStop;
  }, [micStop]);

  const pauseAssistant = useCallback(() => {
    try {
      sendPauseAssistantMessage();
      setIsPaused(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      updateError({
        type: 'socket_error',
        reason: 'failed_to_send_message',
        message,
      });
    }
    playerClearQueue();
  }, [sendPauseAssistantMessage, playerClearQueue, updateError]);

  const resumeAssistant = useCallback(() => {
    try {
      sendResumeAssistantMessage();
      setIsPaused(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      updateError({
        type: 'socket_error',
        reason: 'failed_to_send_message',
        message,
      });
    }
  }, [sendResumeAssistantMessage, updateError]);

  const checkShouldContinueConnecting = useCallback(() => {
    // This check exists because if the user disconnects while the
    // connection is in progress, we need to stop the connection
    // attempt and prevent audio resources from being initialized.
    return isConnectingRef.current !== false;
  }, []);

  const connect = useCallback(
    async (options: ConnectOptions) => {
      const {
        audioConstraints = {},
        sessionSettings,
        devices,
        ...socketConfig
      } = options;
      if (isConnectingRef.current || status.value === 'connected') {
        console.warn(
          'Already connected or connecting to a chat. Ignoring duplicate connection attempt.',
        );
        return;
      }

      updateError(null);
      setStatus({ value: 'connecting' });
      resourceStatusRef.current.socket = 'connecting';
      resourceStatusRef.current.audioPlayer = 'connecting';
      resourceStatusRef.current.mic = 'connecting';
      isConnectingRef.current = true;

      // Microphone permissions check - happens first
      let stream: MediaStream | null = null;

      const micConstraints: MediaTrackConstraints = {
        ...audioConstraints,
        deviceId: devices?.microphoneDeviceId,
      };

      try {
        stream = await getStream(micConstraints);
      } catch (e) {
        const isPermissionDeniedError =
          e instanceof DOMException && e.name === 'NotAllowedError';
        const error: VoiceError = {
          type: 'mic_error',
          reason: isPermissionDeniedError
            ? 'mic_permission_denied'
            : 'mic_initialization_failure',
          message:
            e instanceof Error
              ? e.message
              : 'The microphone could not be initialized.',
        };
        updateError(error);
        return;
      }

      const sharedCtx = new AudioContext();
      sharedAudioContextRef.current = sharedCtx;

      // Audio Player - must initialize before connecting to the socket
      // because it needs to exist by the time the socket is ready to send audio data
      if (!checkShouldContinueConnecting()) {
        console.warn('Connection attempt was canceled. Stopping connection.');
        return;
      }
      try {
        await player.initPlayer(devices?.speakerDeviceId, sharedCtx);
      } catch (e) {
        resourceStatusRef.current.audioPlayer = 'disconnected';
        updateError({
          type: 'audio_error',
          reason: 'audio_player_initialization_failure',
          message:
            e instanceof Error
              ? e.message
              : 'We could not connect to the audio player. Please try again.',
        });
        return;
      }
      resourceStatusRef.current.audioPlayer = 'connected';

      // WEBSOCKET - needs to be connected before the microphone is initialized
      // because a connection needs to be established before the microphone can start sending
      // the audio stream
      if (!checkShouldContinueConnecting()) {
        console.warn('Connection attempt was canceled. Stopping connection.');
        return;
      }
      try {
        await clientConnect(
          {
            ...socketConfig,
            verboseTranscription: socketConfig.verboseTranscription ?? true,
          },
          sessionSettings,
        );
      } catch (e) {
        // catching the thrown error here so we can return early from the connect function.
        // Any errors themselves are handled in the `onClientError` callback on the client,
        // except for the AbortController case, which we don't need to call onClientError for
        // because cancellations are intentional, and not network errors.
        return;
      }
      // we can set resourceStatusRef.current.socket here because `client.connect` resolves
      // at the same time as when the onOpen callback is called
      resourceStatusRef.current.socket = 'connected';

      // MICROPHONE - initialized last
      if (!checkShouldContinueConnecting()) {
        console.warn('Connection attempt was canceled. Stopping connection.');
        return;
      }
      try {
        micStart(stream, sharedCtx);
      } catch (e) {
        resourceStatusRef.current.mic = 'disconnected';
        updateError({
          type: 'mic_error',
          reason: 'mic_initialization_failure',
          message:
            e instanceof Error
              ? e.message
              : 'We could not connect to the microphone. Please try again.',
        });
        return;
      }
      resourceStatusRef.current.mic = 'connected';

      setStatus({ value: 'connected' });
      isConnectingRef.current = false;
    },
    [
      checkShouldContinueConnecting,
      clientConnect,
      getStream,
      micStart,
      player.initPlayer,
      status.value,
      updateError,
    ],
  );

  // `disconnectAndCleanUpResources`: Internal function that is called to actually disconnect
  // from the socket, audio player, and microphone.
  const disconnectAndCleanUpResources = useCallback(async () => {
    resourceStatusRef.current.socket = 'disconnecting';
    resourceStatusRef.current.audioPlayer = 'disconnecting';
    resourceStatusRef.current.mic = 'disconnecting';

    // set isConnectingRef to false in order to cancel any in-progress
    // connection attempts
    isConnectingRef.current = false;

    stopTimer();

    // MICROPHONE - shut this down before shutting down the websocket.
    // Call stopStream separately because the user could stop the
    // the connection before the microphone is initialized
    stopStream();
    await micStop();
    resourceStatusRef.current.mic = 'disconnected';

    // WEBSOCKET - shut this down before shutting down the audio player
    if (clientReadyStateRef.current !== VoiceReadyState.CLOSED) {
      // socket is open, so close it. resourceStatusRef will be set to 'disconnected'
      // in the onClose callback of the websocket client.
      clientDisconnect();
    } else {
      // socket is already closed, so ensure that the socket status is appropriately set
      resourceStatusRef.current.socket = 'disconnected';
    }
    // resourceStatusRef.current.socket is not set to 'disconnected' here,
    // but rather in the onClose callback of the client. This is because
    // onClose signals that the socket is actually disconnected.

    // AUDIO PLAYER
    await playerStopAll();
    resourceStatusRef.current.audioPlayer = 'disconnected';

    if (sharedAudioContextRef.current) {
      await sharedAudioContextRef.current.close().catch(() => {
        // .close() rejects if already closed; safe to ignore.
      });
      sharedAudioContextRef.current = null;
    }

    // Clean up other state variables that are synchronous
    if (clearMessagesOnDisconnect) {
      clearMessageStore();
    }
    toolStatusClearStore();
    setIsPaused(false);
  }, [
    stopTimer,
    stopStream,
    micStop,
    clientDisconnect,
    playerStopAll,
    clearMessagesOnDisconnect,
    clearMessageStore,
    toolStatusClearStore,
  ]);

  // `disconnect` is the function that the end user calls to disconnect a call
  const disconnect = useCallback(
    async (disconnectOnError?: boolean) => {
      await disconnectAndCleanUpResources();

      if (status.value !== 'error' && !disconnectOnError) {
        // if status was 'error', keep the error status so we can show the error message to the end user.
        // otherwise, set status to 'disconnected'
        setStatus({ value: 'disconnected' });
      }
    },
    [disconnectAndCleanUpResources, status.value],
  );

  useEffect(() => {
    if (error !== null && status.value !== 'error') {
      // If the status is ever set to `error`, disconnect the call
      // and clean up resources.
      setStatus({ value: 'error', reason: error.message });
      void disconnectAndCleanUpResources();
    }
  }, [status.value, disconnect, disconnectAndCleanUpResources, error]);

  useEffect(() => {
    // disconnect from socket when the voice provider component unmounts
    return () => {
      void disconnectAndCleanUpResources().then(() => {
        setStatus({ value: 'disconnected' });
        isConnectingRef.current = false;
        resourceStatusRef.current = {
          mic: 'disconnected',
          audioPlayer: 'disconnected',
          socket: 'disconnected',
        };
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendUserInput = useCallback(
    (text: string) => {
      if (resourceStatusRef.current.socket !== 'connected') {
        console.warn('Socket is not connected. Cannot send user input.');
        return;
      }
      try {
        clientSendUserInput(text);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        updateError({
          type: 'socket_error',
          reason: 'failed_to_send_message',
          message,
        });
      }
    },
    [clientSendUserInput, updateError],
  );

  const sendAssistantInput = useCallback(
    (text: string) => {
      if (resourceStatusRef.current.socket !== 'connected') {
        console.warn('Socket is not connected. Cannot send assistant input.');
        return;
      }
      try {
        clientSendAssistantInput(text);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        updateError({
          type: 'socket_error',
          reason: 'failed_to_send_message',
          message,
        });
      }
    },
    [clientSendAssistantInput, updateError],
  );

  const sendSessionSettings = useCallback(
    (sessionSettings: Hume.empathicVoice.SessionSettings) => {
      if (resourceStatusRef.current.socket !== 'connected') {
        console.warn('Socket is not connected. Cannot send session settings.');
        return;
      }
      try {
        clientSendSessionSettings(sessionSettings);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        updateError({
          type: 'socket_error',
          reason: 'failed_to_send_message',
          message,
        });
      }
    },
    [clientSendSessionSettings, updateError],
  );

  const sendToolMessage = useCallback(
    (
      message:
        | Hume.empathicVoice.ToolResponseMessage
        | Hume.empathicVoice.ToolErrorMessage,
    ) => {
      if (resourceStatusRef.current.socket !== 'connected') {
        console.warn('Socket is not connected. Cannot send tool message.');
        return;
      }
      try {
        clientSendToolMessage(message);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        updateError({
          type: 'socket_error',
          reason: 'failed_to_send_message',
          message,
        });
      }
    },
    [clientSendToolMessage, updateError],
  );

  const storesCtx = useMemo(
    () => ({
      playerFftStore: player.fftStore,
      micFftStore: mic.fftStore,
      callDurationStore,
    }),
    [player.fftStore, mic.fftStore, callDurationStore],
  );

  const ctx = useMemo(
    () =>
      ({
        connect,
        disconnect,
        fft: player.fftStore.getSnapshot() as number[],
        micFft: mic.fftStore.getSnapshot() as number[],
        isMuted: mic.isMuted,
        isAudioMuted: player.isAudioMuted,
        isPlaying: player.isPlaying,
        messages: messageStore.messages,
        lastVoiceMessage: messageStore.lastVoiceMessage,
        lastUserMessage: messageStore.lastUserMessage,
        lastAssistantProsodyMessage: messageStore.lastAssistantProsodyMessage,
        clearMessages: messageStore.clearMessages,
        mute: mic.mute,
        muteAudio: player.muteAudio,
        readyState: client.readyState,
        sendUserInput,
        sendAssistantInput,
        sendSessionSettings,
        pauseAssistant,
        resumeAssistant,
        sendToolMessage,
        status,
        unmute: mic.unmute,
        unmuteAudio: player.unmuteAudio,
        error,
        isAudioError,
        isError,
        isMicrophoneError,
        isSocketError,
        callDurationTimestamp: callDurationStore.getSnapshot(),
        toolStatusStore: toolStatus.store,
        chatMetadata: messageStore.chatMetadata,
        playerQueueLength: player.queueLength,
        isPaused,
        volume: player.volume,
        setVolume: player.setVolume,
      }) satisfies VoiceContextType,
    [
      connect,
      disconnect,
      player.isAudioMuted,
      player.isPlaying,
      player.muteAudio,
      player.unmuteAudio,
      player.queueLength,
      player.volume,
      player.setVolume,
      mic.isMuted,
      mic.mute,
      mic.unmute,
      messageStore.messages,
      messageStore.lastVoiceMessage,
      messageStore.lastUserMessage,
      messageStore.lastAssistantProsodyMessage,
      messageStore.clearMessages,
      messageStore.chatMetadata,
      client.readyState,
      sendUserInput,
      sendAssistantInput,
      sendSessionSettings,
      pauseAssistant,
      resumeAssistant,
      sendToolMessage,
      status,
      error,
      isAudioError,
      isError,
      isMicrophoneError,
      isSocketError,
      toolStatus.store,
      isPaused,
    ],
  );

  return (
    <StoresContext.Provider value={storesCtx}>
      <VoiceContext.Provider value={ctx}>{children}</VoiceContext.Provider>
    </StoresContext.Provider>
  );
};
