import type { Config, Message } from '@humeai/assistant';
import { AssistantClient } from '@humeai/assistant';
import { useCallback, useEffect, useRef, useState } from 'react';

export enum ReadyState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  OPEN = 'open',
  CLOSED = 'closed',
}

export const useAssistantClient = (props: {
  config: Config;
  onAudioMessage?: (arrayBuffer: ArrayBufferLike) => void;
  onError?: (error: Error) => void;
}) => {
  const config = useRef<Config>(props.config);
  config.current = props.config;

  const client = useRef<AssistantClient | null>(null);

  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);

  const onAudioMessage = useRef<
    ((arrayBuffer: ArrayBufferLike) => void) | undefined
  >(props.onAudioMessage);
  onAudioMessage.current = props.onAudioMessage;
  const onError = useRef<((error: Error) => void) | undefined>(props.onError);
  onError.current = props.onError;

  const connect = useCallback((nextConfig?: Config) => {
    const previousClient = client.current;
    client.current = null;
    previousClient?.disconnect();

    const nextClient = AssistantClient.create(nextConfig ?? config.current);
    client.current = nextClient;

    nextClient.on('open', () => {
      if (client.current !== nextClient) return;
      setReadyState(ReadyState.OPEN);
    });

    nextClient.on('message', (message) => {
      if (client.current !== nextClient) return;

      if (message.type === 'audio') {
        onAudioMessage.current?.(message.data);
      }

      setMessages((prev) => {
        return prev.concat([message]);
      });
    });

    nextClient.on('close', () => {
      if (client.current !== nextClient) return;
      setReadyState(ReadyState.CLOSED);
    });

    nextClient.on('error', (error) => {
      if (client.current !== nextClient) return;
      onError.current?.(error);
    });

    setReadyState(ReadyState.CONNECTING);

    nextClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    const currentClient = client.current;
    client.current = null;
    setReadyState(ReadyState.IDLE);
    currentClient?.disconnect();
  }, []);

  const sendAudio = useCallback((arrayBuffer: ArrayBufferLike) => {
    client.current?.sendAudio(arrayBuffer);
  }, []);

  useEffect(() => {
    return () => {
      const currentClient = client.current;
      client.current = null;
      currentClient?.disconnect();
    };
  }, []);

  return {
    readyState,
    messages,
    sendAudio,
    connect,
    disconnect,
  };
};
