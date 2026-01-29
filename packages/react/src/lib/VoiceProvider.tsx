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
} from 'react';

import { ConnectionMessage } from './connection-message';
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

/**
 * The context type for the Voice Provider, containing all voice-related methods and state.
 * 
 * Provides a comprehensive interface for interacting with Hume's Empathic Voice Interface,
 * including connection management, audio control, message handling, and tool interactions.
 */
export type VoiceContextType = {
  /**
   * Opens a socket connection to the voice API and initializes the microphone.
   * @param options Optional settings for the connection
   * @returns A promise that resolves when the connection is established
   */
  connect: (options: ConnectOptions) => Promise<void>;

  /**
   * Disconnect from the voice API and microphone.
   * @returns A promise that resolves when disconnection is complete
   */
  disconnect: () => Promise<void>;

  /**
   * Audio FFT values for the assistant audio output.
   * Provides frequency domain data for visualizing assistant audio.
   */
  fft: number[];

  /**
   * Boolean that describes whether the microphone is muted.
   */
  isMuted: boolean;

  /**
   * Boolean that describes whether the assistant audio is muted.
   */
  isAudioMuted: boolean;

  /**
   * Describes whether the assistant audio is currently playing.
   */
  isPlaying: boolean;

  /**
   * Message history of the current conversation.
   * By default, does not include interim user messages when `verboseTranscription` is set to true on the `VoiceProvider`.
   * To access interim messages, define a custom `onMessage` callback on your `VoiceProvider`.
   */
  messages: (JSONMessage | ConnectionMessage)[];

  /**
   * The last transcript message received from the assistant.
   */
  lastVoiceMessage: AssistantTranscriptMessage | null;

  /**
   * The last transcript message received from the user.
   */
  lastUserMessage: UserTranscriptMessage | null;

  /**
   * The last prosody message received from the assistant.
   */
  lastAssistantProsodyMessage: AssistantProsodyMessage | null;

  /**
   * Clear transcript messages from history.
   */
  clearMessages: () => void;

  /**
   * Mute the microphone.
   */
  mute: () => void;

  /**
   * Unmute the microphone.
   */
  unmute: () => void;

  /**
   * Mute the assistant audio.
   */
  muteAudio: () => void;

  /**
   * Unmute the assistant audio.
   */
  unmuteAudio: () => void;

  /**
   * The current readyState of the websocket connection.
   */
  readyState: VoiceReadyState;

  /**
   * Send a user input message.
   * @param text The text message to send
   */
  sendUserInput: (text: string) => void;

  /**
   * Send a text string for the assistant to read out loud.
   * @param text The text to send for the assistant to speak
   */
  sendAssistantInput: (text: string) => void;

  /**
   * Send new session settings to the assistant.
   * This overrides any session settings that were passed as props to the VoiceProvider.
   */
  sendSessionSettings: Hume.empathicVoice.chat.ChatSocket['sendSessionSettings'];

  /**
   * Send a tool response or tool error message to the EVI backend.
   * @param type The tool response or tool error message to send
   */
  sendToolMessage: (
    type:
      | Hume.empathicVoice.ToolResponseMessage
      | Hume.empathicVoice.ToolErrorMessage,
  ) => void;

  /**
   * Pauses responses from EVI. Chat history is still saved and sent after resuming.
   */
  pauseAssistant: () => void;

  /**
   * Resumes responses from EVI. Chat history sent while paused will now be sent.
   */
  resumeAssistant: () => void;

  /**
   * The current status of the voice connection.
   * Informs whether the voice is connected, disconnected, connecting, or in an error state.
   * If the voice is in an error state, it will automatically disconnect from the websocket and microphone.
   */
  status: VoiceStatus;

  /**
   * Audio FFT values for microphone input.
   * Provides frequency domain data for visualizing microphone audio.
   */
  micFft: number[];

  /**
   * Provides more detailed error information if the voice is in an error state.
   * Null if there is no error.
   */
  error: VoiceError | null;

  /**
   * True if an audio playback error has occurred.
   */
  isAudioError: boolean;

  /**
   * True if the voice is in an error state.
   */
  isError: boolean;

  /**
   * True if a microphone error has occurred.
   */
  isMicrophoneError: boolean;

  /**
   * True if there was an error connecting to the websocket.
   */
  isSocketError: boolean;

  /**
   * The length of a call.
   * This value persists after the conversation has ended.
   * Null if no call has been made.
   */
  callDurationTimestamp: string | null;

  /**
   * A map of tool call IDs to their associated tool messages.
   * Tracks the status and responses of tool calls.
   */
  toolStatusStore: ReturnType<typeof useToolStatus>['store'];

  /**
   * Metadata about the current chat, including chat ID, chat group ID, and request ID.
   * Null if not connected.
   */
  chatMetadata: ChatMetadataMessage | null;

  /**
   * The number of assistant audio clips that are queued up, including the clip that is currently playing.
   */
  playerQueueLength: number;

  /**
   * Boolean that describes whether the assistant is paused.
   * When paused, the assistant will still be listening, but will not send a response until it is resumed.
   */
  isPaused: boolean;

  /**
   * The current playback volume level for the assistant's voice.
   * Ranges from 0.0 (silent) to 1.0 (full volume).
   * Defaults to 1.0.
   */
  volume: number;

  /**
   * Sets the playback volume for audio generated by the assistant.
   * Input values are clamped between 0.0 (silent) and 1.0 (full volume).
   * @param level The volume level to set (0.0 - 1.0)
   */
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

export const VoiceProvider: FC<VoiceProviderProps> = ({
  children,
  clearMessagesOnDisconnect = true,
  messageHistoryLimit = 100,
  enableAudioWorklet = true,
  ...props
}) => {
  const {
    timestamp: callDurationTimestamp,
    start: startTimer,
    stop: stopTimer,
  } = useCallDuration();

  const [status, setStatus] = useState<VoiceStatus>({
    value: 'disconnected',
  });
  const isConnectingRef = useRef(false);

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

  const onError = useRef(props.onError ?? noop);
  onError.current = props.onError ?? noop;

  const onClose = useRef(props.onClose ?? noop);
  onClose.current = props.onClose ?? noop;

  const onMessage = useRef(props.onMessage ?? noop);
  onMessage.current = props.onMessage ?? noop;

  const onAudioReceived = useRef(props.onAudioReceived ?? noop);
  onAudioReceived.current = props.onAudioReceived ?? noop;

  const onAudioStart = useRef(props.onAudioStart ?? noop);
  onAudioStart.current = props.onAudioStart ?? noop;

  const onAudioEnd = useRef(props.onAudioEnd ?? noop);
  onAudioEnd.current = props.onAudioEnd ?? noop;

  const onInterruption = useRef(props.onInterruption ?? noop);
  onInterruption.current = props.onInterruption ?? noop;

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

  const { getStream, stopStream } = useMicrophoneStream();

  const client = useVoiceClient({
    onAudioMessage: (message: AudioOutputMessage) => {
      if (checkIsDisconnecting() || checkIsDisconnected()) {
        // disconnection in progress, and resources are being cleaned up.
        // ignore the message
        return;
      }
      void player.addToQueue(message);
      onAudioReceived.current(message);
    },
    onMessage: useCallback(
      (message: JSONMessage) => {
        if (checkIsDisconnecting() || checkIsDisconnected()) {
          // disconnection in progress, and resources are being cleaned up.
          // ignore the message
          return;
        }

        // store message
        messageStore.onMessage(message);

        if (
          message.type === 'user_interruption' ||
          message.type === 'user_message'
        ) {
          if (player.isPlaying) {
            onInterruption.current(message);
          }
          player.clearQueue();
        }

        if (
          message.type === 'tool_call' ||
          message.type === 'tool_response' ||
          message.type === 'tool_error'
        ) {
          toolStatus.addToStore(message);
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
        messageStore,
        player,
        toolStatus,
      ],
    ),
    onSessionSettings: useCallback(
      (sessionSettings: Hume.empathicVoice.SessionSettings) => {
        if (checkIsDisconnecting() || checkIsDisconnected()) {
          // disconnection in progress, and resources are being cleaned up.
          // ignore the message
          return;
        }
        messageStore.createSessionSettingsMessage(sessionSettings);
      },
      [checkIsDisconnected, checkIsDisconnecting, messageStore],
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
      messageStore.createConnectMessage();
      props.onOpen?.();
    }, [messageStore, props, startTimer]),
    onClose: useCallback<
      NonNullable<Hume.empathicVoice.chat.ChatSocket.EventHandlers['close']>
    >(
      (event) => {
        // onClose handler needs to handle resource cleanup in the event that the
        // websocket connection is closed by the server and not the user/client
        stopTimer();
        isConnectingRef.current = false;
        resourceStatusRef.current.socket = 'disconnected';

        messageStore.createDisconnectMessage(event);
        if (clearMessagesOnDisconnect) {
          messageStore.clearMessages();
        }
        toolStatus.clearStore();
        setIsPaused(false);

        const resourceShutdownFns = [];
        if (resourceStatusRef.current.audioPlayer === 'connected') {
          resourceShutdownFns.push(player.stopAll());
        }
        if (resourceStatusRef.current.mic === 'connected') {
          resourceShutdownFns.push(micStopFnRef.current?.());
        }

        if (resourceShutdownFns.length > 0) {
          void Promise.all(resourceShutdownFns).then(() => {
            resourceStatusRef.current.audioPlayer = 'disconnected';
            resourceStatusRef.current.mic = 'disconnected';
            // if audio player and mic were connected at the time the socket
            // shut down, we can assume that the connection was closed by
            // the server, and not the user. Therefore, set the status
            // to 'disconnected'
            setStatus({ value: 'disconnected' });
            onClose.current?.(event);
          });
        } else {
          // if audio player and mic were not connected at the time the socket,
          // no need to setStatus because the user initiated the disconnect.
          onClose.current?.(event);
        }
      },
      [clearMessagesOnDisconnect, messageStore, player, stopTimer, toolStatus],
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
  } = client;

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

  useEffect(() => {
    micStopFnRef.current = mic.stop;
  }, [mic]);

  const { clearQueue } = player;

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
    clearQueue();
  }, [sendPauseAssistantMessage, clearQueue, updateError]);

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

      // Audio Player - must initialize before connecting to the socket
      // because it needs to exist by the time the socket is ready to send audio data
      if (!checkShouldContinueConnecting()) {
        console.warn('Connection attempt was canceled. Stopping connection.');
        return;
      }
      try {
        await player.initPlayer(devices?.speakerDeviceId);
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
        await client.connect(
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
        mic.start(stream);
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

      // Everything is now initialized (socket, audio player, microphone),
      // so set the global connected status
      setStatus({ value: 'connected' });
      isConnectingRef.current = false;
    },
    [
      checkShouldContinueConnecting,
      client,
      getStream,
      mic,
      player,
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
    await mic.stop();
    resourceStatusRef.current.mic = 'disconnected';

    // WEBSOCKET - shut this down before shutting down the audio player
    if (client.readyState !== VoiceReadyState.CLOSED) {
      // socket is open, so close it. resourceStatusRef will be set to 'disconnected'
      // in the onClose callback of the websocket client.
      client.disconnect();
    } else {
      // socket is already closed, so ensure that the socket status is appropriately set
      resourceStatusRef.current.socket = 'disconnected';
    }
    // resourceStatusRef.current.socket is not set to 'disconnected' here,
    // but rather in the onClose callback of the client. This is because
    // onClose signals that the socket is actually disconnected.

    // AUDIO PLAYER
    await player.stopAll();
    resourceStatusRef.current.audioPlayer = 'disconnected';

    // Clean up other state variables that are synchronous
    if (clearMessagesOnDisconnect) {
      messageStore.clearMessages();
    }
    toolStatus.clearStore();
    setIsPaused(false);
  }, [
    stopTimer,
    stopStream,
    mic,
    client,
    player,
    clearMessagesOnDisconnect,
    toolStatus,
    messageStore,
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

  const ctx = useMemo(
    () =>
      ({
        connect,
        disconnect,
        fft: player.fft,
        micFft: mic.fft,
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
        callDurationTimestamp,
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
      player.fft,
      player.isAudioMuted,
      player.isPlaying,
      player.muteAudio,
      player.unmuteAudio,
      player.queueLength,
      player.volume,
      player.setVolume,
      mic.fft,
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
      callDurationTimestamp,
      toolStatus.store,
      isPaused,
    ],
  );

  return <VoiceContext.Provider value={ctx}>{children}</VoiceContext.Provider>;
};
