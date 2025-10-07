import { Hume, HumeClient } from 'hume';
import { useCallback, useRef, useState } from 'react';
import { type Simplify } from 'type-fest';

import { type AuthStrategy } from './auth';
import type {
  AudioOutputMessage,
  JSONMessage,
  ToolCall,
} from '../models/messages';

const isNever = (_n: never) => {
  return;
};

export type SocketConfig = {
  auth: AuthStrategy;
  hostname?: string;
} & Hume.empathicVoice.chat.Chat.ConnectArgs;

export enum VoiceReadyState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  OPEN = 'open',
  CLOSED = 'closed',
}

type SessionSettingsOnConnect = Omit<Hume.empathicVoice.SessionSettings, 'builtinTools' | 'type'>
type SessionSettingsPostConnect = Pick<Hume.empathicVoice.SessionSettings, 'builtinTools' | 'type'>
/**
 * Split the properties on a session settings message by when they can be sent.
 *
 * The Hume API supports sending *most* but not *all* properties of the session settings 
 * as query params on the websocket connection. Tools-related settings like `builtinTools` 
 * must be sent as a separate message after the connection is established.
 * 
 */
const splitSessionSettings = (
  sessionSettings?: Hume.empathicVoice.SessionSettings,
): {
  onConnect?: SessionSettingsOnConnect;
  postConnect?: SessionSettingsPostConnect;
} => {
  if (!sessionSettings) {
    return {}
  }

  const { builtinTools, ...onConnect } = sessionSettings;
  if (builtinTools) {
    return {
      onConnect,
      postConnect: {
        type: 'session_settings',
        builtinTools,
      },
    }
  }
  return { onConnect }
};

export type ToolCallHandler = (
  // message will always be a tool call message where toolType === 'function'
  message: Simplify<
    ToolCall & {
      // caveat: this doesn't actually do what it appears to, since ToolType is
      // exported as both an interface and a value, this ends up being a constant
      // that doesn't share an type identity with the actual ToolType enum
      toolType: typeof Hume.empathicVoice.ToolType.Function;
    }
  >,
  send: {
    success: (content: unknown) => Hume.empathicVoice.ToolResponseMessage;
    error: (e: {
      error: string;
      code: string;
      level: string;
      content: string;
    }) => Hume.empathicVoice.ToolErrorMessage;
  },
) => Promise<
  Hume.empathicVoice.ToolResponseMessage | Hume.empathicVoice.ToolErrorMessage
>;

export const useVoiceClient = (props: {
  onAudioMessage?: (message: AudioOutputMessage) => void;
  onMessage?: (message: JSONMessage) => void;
  onToolCall?: ToolCallHandler;
  onToolCallError?: (message: string, error?: Error) => void;
  onClientError?: (message: string, error?: Error) => void;
  onOpen?: () => void;
  onClose?: Hume.empathicVoice.chat.ChatSocket.EventHandlers['close'];
}) => {
  const connectAbortController = useRef<AbortController | null>(null);

  const client = useRef<Hume.empathicVoice.chat.ChatSocket | null>(null);

  const [readyState, setReadyState] = useState<VoiceReadyState>(
    VoiceReadyState.IDLE,
  );

  // this pattern might look hacky but it allows us to use the latest props
  // in callbacks set up inside useEffect without re-rendering the useEffect
  const onAudioMessage = useRef<typeof props.onAudioMessage>(
    props.onAudioMessage,
  );
  onAudioMessage.current = props.onAudioMessage;

  const onMessage = useRef<typeof props.onMessage>(props.onMessage);
  onMessage.current = props.onMessage;

  const onToolCall = useRef<typeof props.onToolCall>(props.onToolCall);
  onToolCall.current = props.onToolCall;

  const onClientError = useRef<typeof props.onClientError>(props.onClientError);
  onClientError.current = props.onClientError;

  const onToolCallError = useRef<typeof props.onToolCallError>(
    props.onToolCallError,
  );
  onToolCallError.current = props.onToolCallError;

  const onOpen = useRef<typeof props.onOpen>(props.onOpen);
  onOpen.current = props.onOpen;

  const onClose = useRef<typeof props.onClose>(props.onClose);
  onClose.current = props.onClose;

  const connect = useCallback(
    (
      config: SocketConfig,
      sessionSettings?: Hume.empathicVoice.SessionSettings,
    ) => {
      // Abort previous attempt if any
      connectAbortController.current?.abort();

      const controller = new AbortController();
      const signal = controller.signal;
      connectAbortController.current = controller;

      const { onConnect: connectSettings, postConnect: postConnectSettings } = splitSessionSettings(sessionSettings);

      return new Promise<VoiceReadyState>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('Connection attempt has already been aborted'));
        }

        const hostname = config.hostname || 'api.hume.ai';

        const hume = new HumeClient(
          config.auth.type === 'apiKey'
            ? {
              apiKey: config.auth.value,
              environment: hostname,
            }
            : {
              accessToken: config.auth.value,
              environment: hostname,
            },
        );

        const socket = hume.empathicVoice.chat.connect({
          ...config,
          reconnectAttempts: 0,
          ...(connectSettings && { sessionSettings: connectSettings }),
        });

        client.current = socket;

        const abortHandler = () => {
          socket.close();
          reject(new Error('Connection attempt has been aborted'));
        };

        signal.addEventListener('abort', abortHandler);

        socket.on('message', (message) => {
          if (signal.aborted) {
            return;
          }

          if (message.type === 'audio_output') {
            const messageWithReceivedAt = {
              ...message,
              receivedAt: new Date(),
            };
            onAudioMessage.current?.(messageWithReceivedAt);
            return;
          }

          if (message.type === 'chat_metadata') {
            onOpen.current?.();
            setReadyState(VoiceReadyState.OPEN);
            signal.removeEventListener('abort', abortHandler);
            if (postConnectSettings) {
              socket.sendSessionSettings(postConnectSettings);
            }
            resolve(VoiceReadyState.OPEN);
          }

          if (
            message.type === 'assistant_message' ||
            message.type === 'user_message' ||
            message.type === 'user_interruption' ||
            message.type === 'error' ||
            message.type === 'tool_response' ||
            message.type === 'tool_error' ||
            message.type === 'chat_metadata' ||
            message.type === 'assistant_end' ||
            message.type === 'assistant_prosody'
          ) {
            const messageWithReceivedAt = {
              ...message,
              receivedAt: new Date(),
            };
            onMessage.current?.(messageWithReceivedAt);
            return;
          }

          if (message.type === 'tool_call') {
            const messageWithReceivedAt = {
              ...message,
              receivedAt: new Date(),
            };
            onMessage.current?.(messageWithReceivedAt);

            // only pass tool call messages for user defined tools
            if (message.toolType === Hume.empathicVoice.ToolType.Function) {
              void onToolCall
                .current?.(
                  {
                    ...messageWithReceivedAt,
                    // we have to do this because even though we are using the correct
                    // enum on line 30 for the type definition
                    // fern exports an interface and a value using the same `ToolType`
                    // identifier so the type comparisons will always fail
                    toolType: 'function',
                  },
                  {
                    success: (content: unknown) => ({
                      type: 'tool_response',
                      toolCallId: messageWithReceivedAt.toolCallId,
                      content: JSON.stringify(content),
                    }),
                    error: ({
                      error,
                      code,
                      level,
                      content,
                    }: {
                      error: string;
                      code: string;
                      level: string;
                      content: string;
                    }) => ({
                      type: 'tool_error',
                      toolCallId: messageWithReceivedAt.toolCallId,
                      error,
                      code,
                      level: level !== null ? 'warn' : undefined, // level can only be warn
                      content,
                    }),
                  },
                )
                .then((response) => {
                  // if valid send it to the socket
                  // otherwise, report error
                  if (response.type === 'tool_response') {
                    socket.sendToolResponseMessage(response);
                  } else if (response.type === 'tool_error') {
                    socket.sendToolErrorMessage(response);
                  } else {
                    onToolCallError.current?.(
                      'Invalid response from tool call',
                    );
                  }
                });
            }
            return;
          }

          // asserts that all message types are handled
          isNever(message);
          return;
        });

        socket.on('close', (event) => {
          signal.removeEventListener('abort', abortHandler);
          onClose.current?.(event);
          setReadyState(VoiceReadyState.CLOSED);
        });

        socket.on('error', (e) => {
          signal.removeEventListener('abort', abortHandler);
          const message = e instanceof Error ? e.message : 'Unknown error';
          onClientError.current?.(message, e instanceof Error ? e : undefined);
          reject(e);
        });

        setReadyState(VoiceReadyState.CONNECTING);
      });
    },
    [],
  );

  const disconnect = useCallback(() => {
    connectAbortController.current?.abort();
    connectAbortController.current = null;
    setReadyState(VoiceReadyState.IDLE);
    client.current?.close();
  }, []);

  const sendSessionSettings = useCallback(
    (sessionSettings: Hume.empathicVoice.SessionSettings) => {
      if (readyState !== VoiceReadyState.OPEN) {
        return;
      }
      client.current?.sendSessionSettings(sessionSettings);
    },
    [readyState],
  );

  const sendAudio = useCallback(
    (arrayBuffer: ArrayBufferLike) => {
      if (readyState !== VoiceReadyState.OPEN) {
        return;
      }
      client.current?.socket?.send(arrayBuffer);
    },
    [readyState],
  );

  const sendUserInput = useCallback(
    (text: string) => {
      if (readyState !== VoiceReadyState.OPEN) {
        return;
      }
      client.current?.sendUserInput(text);
    },
    [readyState],
  );

  const sendAssistantInput = useCallback(
    (text: string) => {
      if (readyState !== VoiceReadyState.OPEN) {
        return;
      }
      client.current?.sendAssistantInput({
        text,
      });
    },
    [readyState],
  );

  const sendToolMessage = useCallback(
    (
      // type definitions for toolMessage come from the Hume SDK because messages that are sent from the client
      // to the backend do not have the extended `receivedAt` field
      toolMessage:
        | Hume.empathicVoice.ToolResponseMessage
        | Hume.empathicVoice.ToolErrorMessage,
    ) => {
      if (readyState !== VoiceReadyState.OPEN) {
        return;
      }
      if (toolMessage.type === 'tool_error') {
        client.current?.sendToolErrorMessage(toolMessage);
      } else {
        client.current?.sendToolResponseMessage(toolMessage);
      }
    },
    [readyState],
  );

  const sendPauseAssistantMessage = useCallback(() => {
    if (readyState !== VoiceReadyState.OPEN) {
      return;
    }
    client.current?.pauseAssistant({});
  }, [readyState]);
  const sendResumeAssistantMessage = useCallback(() => {
    if (readyState !== VoiceReadyState.OPEN) {
      return;
    }
    client.current?.resumeAssistant({});
  }, [readyState]);

  return {
    readyState,
    sendSessionSettings,
    sendAudio,
    connect,
    disconnect,
    sendUserInput,
    sendAssistantInput,
    sendToolMessage,
    sendPauseAssistantMessage,
    sendResumeAssistantMessage,
  };
};
