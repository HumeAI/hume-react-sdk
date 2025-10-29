import type { RenderHookResult } from '@testing-library/react-hooks';
import { act, renderHook } from '@testing-library/react-hooks';
import { fromPartial } from '@total-typescript/shoehorn';
import type { Hume } from 'hume';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {CloseEvent} from './connection-message'
import { useMessages } from './useMessages'; // adjust the import path as needed
import type {
  AssistantTranscriptMessage,
  JSONMessage,
  UserTranscriptMessage,
} from '../models/messages';


const MODEL_CONFIG: Hume.empathicVoice.Inference = {
  prosody: {
    scores: {
      amusement: 0.95,
      admiration: 0.0,
      adoration: 0.0,
      aestheticAppreciation: 0.0,
      anger: 0.0,
      anxiety: 0.0,
      awe: 0.0,
      awkwardness: 0.0,
      boredom: 0.0,
      calmness: 0.0,
      concentration: 0.0,
      contemplation: 0.0,
      confusion: 0.0,
      contempt: 0.0,
      contentment: 0.0,
      craving: 0.0,
      determination: 0.0,
      disappointment: 0.0,
      disgust: 0.0,
      distress: 0.0,
      doubt: 0.0,
      ecstasy: 0.0,
      embarrassment: 0.0,
      empathicPain: 0.0,
      entrancement: 0.0,
      envy: 0.0,
      excitement: 0.0,
      fear: 0.0,
      guilt: 0.0,
      horror: 0.0,
      interest: 0.0,
      joy: 0.0,
      love: 0.0,
      nostalgia: 0.0,
      pain: 0.0,
      pride: 0.0,
      realization: 0.0,
      relief: 0.0,
      romance: 0.0,
      sadness: 0.0,
      satisfaction: 0.0,
      desire: 0.0,
      shame: 0.0,
      surpriseNegative: 0.0,
      surprisePositive: 0.0,
      sympathy: 0.0,
      tiredness: 0.0,
      triumph: 0.0,
    },
  },
};

describe('useMessages hook', () => {
  let hook: RenderHookResult<unknown, ReturnType<typeof useMessages>>;
  let userMessage: UserTranscriptMessage;
  let agentMessage: AssistantTranscriptMessage;

  const sendMessageToParent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    hook = renderHook(() =>
      useMessages({ messageHistoryLimit: 100, sendMessageToParent }),
    );
    userMessage = {
      type: 'user_message',
      interim: false,
      message: {
        role: 'user',
        content: 'How is the weather today?',
      },
      models: MODEL_CONFIG,
      time: {
        begin: 1633035625,
        end: 1633035635,
      },
      fromText: false,
      receivedAt: new Date(1),
    };
    agentMessage = {
      type: 'assistant_message' as const,
      id: 'message_12345',
      message: {
        role: 'assistant' as const,
        content: 'Hey',
      },
      fromText: false,
      models: MODEL_CONFIG,
      receivedAt: new Date(1),
    };
  });

  it('should initialize with correct default states', () => {
    expect(hook.result.current.messages).toEqual([]);
    expect(hook.result.current.lastVoiceMessage).toBeNull();
    expect(hook.result.current.lastUserMessage).toBeNull();
  });

  it('should handle connection message creation', () => {
    act(() => {
      hook.result.current.createConnectMessage();
    });

    expect(hook.result.current.messages).toHaveLength(1);
    expect(hook.result.current.messages[0]?.type).toBe('socket_connected');
  });

  it('should handle disconnection message creation', () => {
    const closeEvent = fromPartial<CloseEvent>({
      code: 1000,
      reason: 'Normal closure',
    });

    act(() => {
      hook.result.current.createDisconnectMessage(closeEvent);
    });

    expect(hook.result.current.messages).toHaveLength(1);
    expect(hook.result.current.messages[0]?.type).toBe('socket_disconnected');
  });

  it('should add user messages to `messages` immediately', () => {
    act(() => {
      hook.result.current.onMessage({
        ...userMessage,
        receivedAt: new Date(1),
      });
    });

    expect(hook.result.current.lastUserMessage).toMatchObject(
      expect.objectContaining(userMessage),
    );
    expect(hook.result.current.messages).toMatchObject(
      expect.arrayContaining([expect.objectContaining(userMessage)]),
    );
  });

  it('should add voice messages to the voice message map', () => {
    act(() => {
      hook.result.current.onMessage({
        ...agentMessage,
        receivedAt: new Date(1),
      });
    });

    expect(hook.result.current.lastVoiceMessage).toBeNull();
    expect(hook.result.current.messages).toMatchObject([]);
  });

  it('should expose the voice message after the associated audio clip is played', () => {
    // add the message
    act(() => {
      hook.result.current.onMessage({
        ...agentMessage,
        receivedAt: new Date(1),
      });
    });

    // simulate playing audio
    act(() => {
      hook.result.current.onPlayAudio(agentMessage.id ?? '');
    });

    expect(hook.result.current.lastVoiceMessage).toMatchObject(
      expect.objectContaining(agentMessage),
    );
    expect(hook.result.current.messages).toMatchObject(
      expect.arrayContaining([expect.objectContaining(agentMessage)]),
    );
  });

  it('should expose the voice message after the associated audio clip is played', () => {
    act(() => {
      // First, add the message
      hook.result.current.onMessage({
        ...agentMessage,
        receivedAt: new Date(1),
      });
    });

    act(() => {
      hook.result.current.onPlayAudio(agentMessage.id ?? '');
    });

    expect(hook.result.current.lastVoiceMessage).toMatchObject(
      expect.objectContaining(agentMessage),
    );
    expect(hook.result.current.messages).toMatchObject(
      expect.arrayContaining([expect.objectContaining(agentMessage)]),
    );
  });

  it('should only add voice messages once', () => {
    act(() => {
      // First, add the message
      hook.result.current.onMessage({
        ...agentMessage,
        receivedAt: new Date(1),
      });
    });

    act(() => {
      hook.result.current.onPlayAudio(agentMessage.id ?? '');
    });

    expect(hook.result.current.messages).toHaveLength(1);

    // play audio clip with the same ID as before
    act(() => {
      hook.result.current.onPlayAudio(agentMessage.id ?? '');
    });

    expect(hook.result.current.messages).toHaveLength(1);
  });

  it('should call the sendMessageToParent callback when the associated audio clip plays', () => {
    act(() => {
      hook.result.current.onMessage({
        ...agentMessage,
        receivedAt: new Date(1),
      });
    });

    act(() => {
      hook.result.current.onPlayAudio(agentMessage.id ?? '');
    });

    expect(sendMessageToParent).toHaveBeenCalledWith(
      expect.objectContaining(agentMessage),
    );
  });

  it('should clear all messages and states on disconnect', () => {
    const closeEvent = fromPartial<CloseEvent>({
      code: 1000,
      reason: 'Normal closure',
    });

    // First, add some messages and states
    act(() => {
      hook.result.current.createConnectMessage();
      hook.result.current.createDisconnectMessage(closeEvent);
    });

    // Then, disconnect
    act(() => {
      hook.result.current.clearMessages();
    });

    expect(hook.result.current.messages).toHaveLength(0);
    expect(hook.result.current.lastVoiceMessage).toBeNull();
    expect(hook.result.current.lastUserMessage).toBeNull();
  });

  it('should not assign interim user messages to `lastUserMessage`, but does call `sendMessageToParent`', () => {
    act(() => {
      hook.result.current.onMessage({
        ...userMessage,
        interim: true,
        receivedAt: new Date(1),
      });
    });

    expect(hook.result.current.lastUserMessage).toBe(null);
    expect(sendMessageToParent).toHaveBeenCalledWith({
      ...userMessage,
      interim: true,
      receivedAt: new Date(1),
    });
  });

  it('replaces interim user messages until a non-interim message is received', () => {
    const interimMessage1 = {
      ...userMessage,
      message: {
        ...userMessage.message,
        content: 'interim message 1',
      },
      interim: true,
      receivedAt: new Date(1),
    };
    act(() => {
      hook.result.current.onMessage(interimMessage1);
    });

    expect(hook.result.current.messages).toMatchObject([
      expect.objectContaining(interimMessage1),
    ]);

    const interimMessage2 = {
      ...userMessage,
      message: {
        ...userMessage.message,
        content: 'interim message 2',
      },
      interim: true,
      receivedAt: new Date(1),
    };
    act(() => {
      hook.result.current.onMessage(interimMessage2);
    });

    expect(hook.result.current.messages).toMatchObject([
      expect.objectContaining(interimMessage2),
    ]);
    expect(hook.result.current.messages).not.toMatchObject([
      expect.objectContaining(interimMessage1),
    ]);

    const finalMessage = {
      ...userMessage,
      message: {
        ...userMessage.message,
        content: 'final message',
      },
      interim: false,
      receivedAt: new Date(2),
    };
    act(() => {
      hook.result.current.onMessage(finalMessage);
    });

    expect(hook.result.current.messages).not.toMatchObject([
      expect.objectContaining(interimMessage2),
    ]);
    expect(hook.result.current.messages).not.toMatchObject([
      expect.objectContaining(interimMessage1),
    ]);
    expect(hook.result.current.messages).toMatchObject([
      expect.objectContaining(finalMessage),
    ]);
  });

  it('does no replacements if there are no interim messages', () => {
    const message1 = {
      ...userMessage,
      message: {
        ...userMessage.message,
        content: 'message 1',
      },
      interim: false,
      receivedAt: new Date(1),
    };
    act(() => {
      hook.result.current.onMessage(message1);
    });

    expect(hook.result.current.messages).toMatchObject([
      expect.objectContaining(message1),
    ]);

    const message2 = {
      ...userMessage,
      message: {
        ...userMessage.message,
        content: 'interim message 2',
      },
      interim: false,
      receivedAt: new Date(1),
    };
    act(() => {
      hook.result.current.onMessage(message2);
    });

    expect(hook.result.current.messages[0]).toMatchObject(
      expect.objectContaining(message1),
    );
    expect(hook.result.current.messages[1]).toMatchObject(
      expect.objectContaining(message2),
    );

    const finalMessage = {
      ...userMessage,
      message: {
        ...userMessage.message,
        content: 'final message',
      },
      interim: false,
      receivedAt: new Date(2),
    };
    act(() => {
      hook.result.current.onMessage(finalMessage);
    });

    expect(hook.result.current.messages[0]).toMatchObject(
      expect.objectContaining(message1),
    );
    expect(hook.result.current.messages[1]).toMatchObject(
      expect.objectContaining(message2),
    );
    expect(hook.result.current.messages[2]).toMatchObject(
      expect.objectContaining(finalMessage),
    );
  });

  it('always pushes interim user messages to the end of the messages array', () => {
    const interimMessage = {
      ...userMessage,
      interim: true,
      receivedAt: new Date(1),
    };
    act(() => {
      hook.result.current.onMessage(interimMessage);
    });

    expect(hook.result.current.messages).toMatchObject([
      expect.objectContaining(interimMessage),
    ]);

    const interruptionMessage: JSONMessage = {
      type: 'user_interruption',
      receivedAt: new Date(2),
      time: 1633035625,
    };
    act(() => {
      hook.result.current.onMessage(interruptionMessage);
    });

    expect(hook.result.current.messages[0]).toMatchObject(interruptionMessage);
    expect(hook.result.current.messages[1]).toMatchObject(interimMessage);

    const userMessage2 = {
      ...userMessage,
      message: {
        ...userMessage.message,
        content: 'user message 2',
      },
      interim: false,
      receivedAt: new Date(2),
    };
    act(() => {
      hook.result.current.onMessage(userMessage2);
    });

    expect(hook.result.current.messages.length).toBe(2);
    expect(hook.result.current.messages[0]).toMatchObject(interruptionMessage);
    expect(hook.result.current.messages[1]).toMatchObject(userMessage2);
  });
});
