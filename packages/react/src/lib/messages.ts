import { type Hume, serialization as HumeSerialization } from 'hume';

import { type AudioMessage, parseAudioMessage } from './audio-message';
import {
  SocketFailedToParseMessageError,
  SocketUnknownMessageError,
} from './errors';

/**
 * @name parseMessageData
 * @description
 * Parse the data of a message from the socket.
 * @param data - The data to parse.
 * @returns
 * The parsed message data.
 * @example
 * ```ts
 * const message = await parseMessageData(data);
 * ```
 */
export const parseMessageData = async (
  data: unknown,
): Promise<
  | {
      success: true;
      message: Hume.empathicVoice.SubscribeEvent | AudioMessage;
    }
  | {
      success: false;
      error: Error;
    }
> => {
  if (data instanceof Blob) {
    const message = await parseAudioMessage(data);

    if (message) {
      return {
        success: true,
        message,
      };
    } else {
      return {
        success: false,
        error: new SocketFailedToParseMessageError(
          `Received blob was unable to be converted to ArrayBuffer.`,
        ),
      };
    }
  }

  if (typeof data !== 'string') {
    return {
      success: false,
      error: new SocketFailedToParseMessageError(
        `Expected a string but received ${typeof data}.`,
      ),
    };
  }

  const parseResponse = HumeSerialization.empathicVoice.SubscribeEvent.parse(data);

  if (!parseResponse.ok) {
    return {
      success: false,
      error: new SocketUnknownMessageError(
        `Received JSON was not a known message type.`,
      ),
    };
  }

  return {
    success: true,
    message: parseResponse.value,
  };
};

/**
 * @name parseMessageType
 * @description
 * Parse the type of a message from the socket.
 * @param event - The event to parse.
 * @returns
 * The parsed message type.
 * @example
 * ```ts
 * const message = await parseMessageType(event);
 * ```
 */
export const parseMessageType = async (
  event: MessageEvent,
): Promise<
  | {
      success: true;
      message: Hume.empathicVoice.SubscribeEvent | AudioMessage;
    }
  | {
      success: false;
      error: Error;
    }
> => {
  const data: unknown = event.data;
  return parseMessageData(data);
};
