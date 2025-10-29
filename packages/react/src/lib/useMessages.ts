import { useCallback, useState } from 'react';

import type { ConnectionMessage, CloseEvent } from './connection-message';
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
  const [voiceMessageMap, setVoiceMessageMap] = useState<
    Record<string, AssistantTranscriptMessage>
  >({});

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

  const findMostRecentUserMessage = useCallback(
    (allMessages: typeof messages) => {
      let mostRecentUserMessage: UserTranscriptMessage | undefined;
      let mostRecentUserMessageIndex: number | undefined;
      for (let i = allMessages.length - 1; i >= 0; i--) {
        const m = allMessages[i];
        if (m && m.type === 'user_message') {
          mostRecentUserMessage = m;
          mostRecentUserMessageIndex = i;
          break;
        }
      }
      return { mostRecentUserMessage, mostRecentUserMessageIndex };
    },
    [],
  );

  const updateMessagesArray = useCallback(
    (messageToAdd: JSONMessage) => {
      setMessages((prev) => {
        // If there is an interim user message, move it to the end of the array and insert the current
        // message into the penultimate position.
        // Otherwise, add the message to the end of the array.
        const { mostRecentUserMessage, mostRecentUserMessageIndex } =
          findMostRecentUserMessage(prev);

        if (mostRecentUserMessage?.interim === true) {
          // Move interim user messages to the end of the array
          const nextMessages = prev.filter((m, idx) => {
            if (idx === mostRecentUserMessageIndex) {
              return false;
            }
            return true;
          });
          return keepLastN(
            messageHistoryLimit,
            nextMessages.concat([messageToAdd, mostRecentUserMessage]),
          );
        }
        return keepLastN(messageHistoryLimit, prev.concat([messageToAdd]));
      });
    },
    [findMostRecentUserMessage, messageHistoryLimit],
  );

  const onMessage = useCallback(
    (message: JSONMessage) => {
      /* 
      1. message comes in from the backend
        - if the message IS NOT AssistantTranscriptMessage, store in `messages` immediately  
        - if the message is an AssistantTranscriptMessage, stored in `voiceMessageMap`
      2. audio clip plays
        - find the AssistantTranscriptMessage with a matching ID, and store it in `messages`
        - remove the AssistantTranscriptMessage from `voiceMessageMap`
    */
      switch (message.type) {
        case 'assistant_message':
          // for assistant messages, `sendMessageToParent` is called in `onPlayAudio`
          // in order to line up the transcript event with the correct audio clip
          setVoiceMessageMap((prev) => ({
            ...prev,
            [`${message.id}`]: message,
          }));
          break;
        case 'user_message':
          // Replace interim user message with current message
          // If there are no interim user messages, add the current message to the end of the messages array
          sendMessageToParent?.(message);

          if (message.interim === false) {
            setLastUserMessage(message);
          }

          setMessages((prev) => {
            if (prev.length === 0) {
              return keepLastN(messageHistoryLimit, [message]);
            }
            const { mostRecentUserMessage, mostRecentUserMessageIndex } =
              findMostRecentUserMessage(prev);
            if (mostRecentUserMessage?.interim === true) {
              const nextMessages = prev.filter((m, idx) => {
                if (idx === mostRecentUserMessageIndex) {
                  return false;
                }
                return true;
              });
              return keepLastN(
                messageHistoryLimit,
                nextMessages.concat([message]),
              );
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
          updateMessagesArray(message);
          break;
        case 'assistant_prosody':
          setLastAssistantProsodyMessage(message);
          sendMessageToParent?.(message);
          updateMessagesArray(message);

          break;
        case 'chat_metadata':
          sendMessageToParent?.(message);
          updateMessagesArray(message);
          setChatMetadata(message);
          break;
        default:
          break;
      }
    },
    [
      findMostRecentUserMessage,
      messageHistoryLimit,
      sendMessageToParent,
      updateMessagesArray,
    ],
  );

  const onPlayAudio = useCallback(
    (id: string) => {
      const matchingTranscript = voiceMessageMap[id];
      if (matchingTranscript) {
        sendMessageToParent?.(matchingTranscript);
        setLastVoiceMessage(matchingTranscript);
        updateMessagesArray(matchingTranscript);

        // remove the message from the map to ensure we don't
        // accidentally push it to the messages array more than once
        setVoiceMessageMap((prev) => {
          const newMap = { ...prev };
          delete newMap[id];
          return newMap;
        });
      }
    },
    [voiceMessageMap, sendMessageToParent, updateMessagesArray],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastVoiceMessage(null);
    setLastUserMessage(null);
    setLastAssistantProsodyMessage(null);
    setVoiceMessageMap({});
    setChatMetadata(null);
  }, []);

  return {
    createConnectMessage,
    createDisconnectMessage,
    onMessage,
    onPlayAudio,
    clearMessages,
    messages,
    lastVoiceMessage,
    lastUserMessage,
    lastAssistantProsodyMessage,
    chatMetadata,
  };
};
