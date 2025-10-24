import type { Hume } from 'hume';
import type { CloseEvent } from 'hume/core';

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
