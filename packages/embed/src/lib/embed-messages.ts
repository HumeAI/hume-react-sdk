/**                                                                      
                                                                         
            client                                      frame            
                                                                         
 ┌───────────────────────────┐                                           
 │       mount iframe        │ ───────────▶                              
 └───────────────────────────┘                                           
                                            ┌───────────────────────────┐
                               ◀─────────── │      iframe is ready      │
                                            └───────────────────────────┘
 ┌───────────────────────────┐                                           
 │        send config        │ ───────────▶                              
 └───────────────────────────┘                                           
                                            ┌───────────────────────────┐
                               ◀─────────── │      widget is open       │
                                            └───────────────────────────┘
                                            ┌───────────────────────────┐
                               ◀─────────── │    widget is collapsed    │
                                            └───────────────────────────┘
                                            ┌───────────────────────────┐
                               ◀─────────── │    widget is minimized    │
                                            └───────────────────────────┘
                                            ┌───────────────────────────┐
                               ◀─────────── │    transcript message     │
                                            └───────────────────────────┘
                                            ┌───────────────────────────┐
                               ◀─────────── │       resize window       │
                                            └───────────────────────────┘
 ┌───────────────────────────┐                                           
 │      unmount iframe       │ ───────────▶                              
 └───────────────────────────┘                                           
                                                                       */
import { type Hume } from 'hume';
import * as serialization from 'hume/serialization';
import { z } from 'zod';

const { AssistantMessage, UserMessage } = serialization.empathicVoice;

import { AuthStrategySchema } from './auth';

const WindowDimensionsSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export type WindowDimensions = z.infer<typeof WindowDimensionsSchema>;

export const SocketConnect =
  z.custom<Hume.empathicVoice.chat.Chat.ConnectArgs>();
export type SocketConnectSchema = z.infer<typeof SocketConnect>;

export const BaseSocketConfig = z.object({
  auth: AuthStrategySchema,
  hostname: z.string().optional(),
});
export type SocketAuthSchema = z.infer<typeof BaseSocketConfig>;

export type SocketConfig = SocketAuthSchema & SocketConnectSchema;

// ---------------------------------------------------------------------------
// Client to frame actions
// ---------------------------------------------------------------------------
export const ClientToFrameActionSchema = z.union([
  z.object({
    type: z.literal('update_config'),
    payload: z.custom<SocketConfig>(),
  }),
  z.object({
    type: z.literal('cancel'),
  }),
  z.object({
    type: z.literal('expand_widget_from_client'),
    payload: WindowDimensionsSchema,
  }),
  z.object({
    type: z.literal('send_window_size'),
    payload: WindowDimensionsSchema,
  }),
]);

export type ClientToFrameAction = z.infer<typeof ClientToFrameActionSchema>;

export const UPDATE_CONFIG_ACTION = (config: SocketConfig) =>
  ({
    type: 'update_config',
    payload: config,
  }) satisfies ClientToFrameAction;

export const EXPAND_FROM_CLIENT_ACTION = (dimensions: WindowDimensions) =>
  ({
    type: 'expand_widget_from_client',
    payload: dimensions,
  }) satisfies ClientToFrameAction;

export const SEND_WINDOW_SIZE_ACTION = (dimensions: WindowDimensions) =>
  ({
    type: 'send_window_size',
    payload: dimensions,
  }) satisfies ClientToFrameAction;

export const parseClientToFrameAction = (
  data: unknown,
): Promise<ClientToFrameAction> => {
  return new Promise((resolve, reject) => {
    try {
      const value = ClientToFrameActionSchema.parse(data);
      resolve(value);
    } catch (error) {
      reject(error);
    }
  });
};

// ---------------------------------------------------------------------------
// Frame to client actions
// ---------------------------------------------------------------------------
export const FrameToClientActionSchema = z.union([
  z.object({
    type: z.literal('expand_widget'),
  }),
  z.object({
    type: z.literal('collapse_widget'),
  }),
  z.object({
    type: z.literal('minimize_widget'),
  }),
  z.object({
    type: z.literal('widget_iframe_is_ready'),
  }),
  z.object({
    type: z.literal('transcript_message'),
    payload: z.custom<
      Hume.empathicVoice.UserMessage | Hume.empathicVoice.AssistantMessage
    >((val) => {
      const userMessageParseResponse = UserMessage.parse(val);
      if (userMessageParseResponse.ok) {
        return true;
      }
      const assistantMessageParseResponse = AssistantMessage.parse(val);
      if (assistantMessageParseResponse.ok) {
        return true;
      }
      return false;
    }),
  }),
  z.object({
    type: z.literal('resize_frame'),
    payload: z.object({
      width: z.number(),
      height: z.number(),
    }),
  }),
]);

export type FrameToClientAction = z.infer<typeof FrameToClientActionSchema>;

export const EXPAND_WIDGET_ACTION = {
  type: 'expand_widget',
} satisfies FrameToClientAction;

export const COLLAPSE_WIDGET_ACTION = {
  type: 'collapse_widget' as const,
} satisfies FrameToClientAction;

export const MINIMIZE_WIDGET_ACTION = {
  type: 'minimize_widget',
} satisfies FrameToClientAction;

export const WIDGET_IFRAME_IS_READY_ACTION = {
  type: 'widget_iframe_is_ready',
} satisfies FrameToClientAction;

export const TRANSCRIPT_MESSAGE_ACTION = (
  message: Hume.empathicVoice.UserMessage | Hume.empathicVoice.AssistantMessage,
) => {
  return {
    type: 'transcript_message',
    payload: message,
  } satisfies FrameToClientAction;
};

export const RESIZE_FRAME_ACTION = (dimensions: {
  width: number;
  height: number;
}) => {
  return {
    type: 'resize_frame',
    payload: {
      width: dimensions.width,
      height: dimensions.height,
    },
  } satisfies FrameToClientAction;
};
