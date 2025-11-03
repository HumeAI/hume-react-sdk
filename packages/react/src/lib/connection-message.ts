import type { Hume } from 'hume';

export type CloseEvent = Parameters<
  NonNullable<Hume.empathicVoice.chat.ChatSocket.EventHandlers['close']>
>[0];

export type ConnectionMessage =
  | {
      type: 'socket_connected';
      receivedAt: Date;
    }
  | {
      type: 'socket_disconnected';
      code: CloseEvent['code'];
      reason: CloseEvent['reason'];
      receivedAt: Date;
    }
  | {
      type: 'session_settings';
      sessionSettings: Hume.empathicVoice.SessionSettings;
      receivedAt: Date;
    };
