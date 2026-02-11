import type { Hume } from 'hume';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { CloseEvent, ConnectionMessage } from './connection-message';
import type {
  AssistantProsodyMessage,
  AssistantTranscriptMessage,
  ChatMetadataMessage,
  JSONMessage,
  UserTranscriptMessage,
} from '../models/messages';
import { keepLastN } from '../utils';

export const useMessages = ({
  sendMessageToParent,
  messageHistoryLimit,
}: {
  sendMessageToParent?: (message: JSONMessage) => void;
  messageHistoryLimit: number;
}) => {
  const voiceMessageMapRef = useRef<Record<string, AssistantTranscriptMessage>>(
    {},
  );

  const [messages, setMessages] = useState<
    Array<JSONMessage | ConnectionMessage>
  >([]);

  const [lastVoiceMessage, setLastVoiceMessage] =
    useState<AssistantTranscriptMessage | null>(null);
  const [lastUserMessage, setLastUserMessage] =
    useState<UserTranscriptMessage | null>(null);
  const [lastAssistantProsodyMessage, setLastAssistantProsodyMessage] =
    useState<AssistantProsodyMessage | null>(null);

  const [chatMetadata, setChatMetadata] = useState<ChatMetadataMessage | null>(
    null,
  );

  const createConnectMessage = useCallback(() => {
    setChatMetadata(null);
    setMessages((prev) =>
      prev.concat([
        {
          type: 'socket_connected',
          receivedAt: new Date(),
        },
      ]),
    );
  }, []);

  const createSessionSettingsMessage = useCallback(
    (sessionSettings: Hume.empathicVoice.SessionSettings) => {
      setMessages((prev) =>
        prev.concat([
          {
            type: 'session_settings',
            sessionSettings,
            receivedAt: new Date(),
          },
        ]),
      );
    },
    [],
  );

  const createDisconnectMessage = useCallback((event: CloseEvent) => {
    setMessages((prev) =>
      prev.concat([
        {
          type: 'socket_disconnected',
          code: event.code,
          reason: event.reason,
          receivedAt: new Date(),
        },
      ]),
    );
  }, []);

  const addMessageKeepingInterimLast = useCallback(
    (
      prev: Array<JSONMessage | ConnectionMessage>,
      messageToAdd: JSONMessage,
    ) => {
      const last = prev[prev.length - 1];

      if (last && last.type === 'user_message' && last.interim === true) {
        const result = prev.slice(0, -1);
        result.push(messageToAdd, last);
        return keepLastN(messageHistoryLimit, result);
      }

      return keepLastN(messageHistoryLimit, prev.concat([messageToAdd]));
    },
    [messageHistoryLimit],
  );

  const onMessage = useCallback(
    (message: JSONMessage) => {
      switch (message.type) {
        case 'assistant_message':
          // For assistant messages, `sendMessageToParent` is called in `onPlayAudio`
          // to line up the transcript event with the correct audio clip.
          if (message.id) {
            voiceMessageMapRef.current[message.id] = message;
          }
          break;
        case 'user_message':
          sendMessageToParent?.(message);

          if (message.interim === false) {
            setLastUserMessage(message);
          }

          setMessages((prev) => {
            if (prev.length === 0) {
              return keepLastN(messageHistoryLimit, [message]);
            }

            const last = prev[prev.length - 1];

            if (last && last.type === 'user_message' && last.interim === true) {
              const result = prev.slice(0, -1);
              result.push(message);
              return keepLastN(messageHistoryLimit, result);
            }

            return keepLastN(messageHistoryLimit, prev.concat([message]));
          });

          break;
        case 'user_interruption':
        case 'error':
        case 'tool_call':
        case 'tool_response':
        case 'tool_error':
        case 'assistant_end':
          sendMessageToParent?.(message);
          setMessages((prev) => addMessageKeepingInterimLast(prev, message));
          break;
        case 'assistant_prosody':
          setLastAssistantProsodyMessage(message);
          sendMessageToParent?.(message);
          setMessages((prev) => addMessageKeepingInterimLast(prev, message));
          break;
        case 'chat_metadata':
          sendMessageToParent?.(message);
          setMessages((prev) => addMessageKeepingInterimLast(prev, message));
          setChatMetadata(message);
          break;
        default:
          break;
      }
    },
    [addMessageKeepingInterimLast, messageHistoryLimit, sendMessageToParent],
  );

  const onPlayAudio = useCallback(
    (id: string) => {
      const matchingTranscript = voiceMessageMapRef.current[id];
      if (matchingTranscript) {
        sendMessageToParent?.(matchingTranscript);
        setLastVoiceMessage(matchingTranscript);
        setMessages((prev) =>
          addMessageKeepingInterimLast(prev, matchingTranscript),
        );

        // Remove from the map to ensure we don't push it more than once
        delete voiceMessageMapRef.current[id];
      }
    },
    [sendMessageToParent, addMessageKeepingInterimLast],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastVoiceMessage(null);
    setLastUserMessage(null);
    setLastAssistantProsodyMessage(null);
    voiceMessageMapRef.current = {};
    setChatMetadata(null);
  }, []);

  return useMemo(
    () => ({
      createConnectMessage,
      createDisconnectMessage,
      createSessionSettingsMessage,
      onMessage,
      onPlayAudio,
      clearMessages,
      messages,
      lastVoiceMessage,
      lastUserMessage,
      lastAssistantProsodyMessage,
      chatMetadata,
    }),
    [
      createConnectMessage,
      createDisconnectMessage,
      createSessionSettingsMessage,
      onMessage,
      onPlayAudio,
      clearMessages,
      messages,
      lastVoiceMessage,
      lastUserMessage,
      lastAssistantProsodyMessage,
      chatMetadata,
    ],
  );
};
