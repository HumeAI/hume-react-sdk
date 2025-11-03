export * from './lib/embed';

export {
  COLLAPSE_WIDGET_ACTION,
  EXPAND_WIDGET_ACTION,
  MINIMIZE_WIDGET_ACTION,
  RESIZE_FRAME_ACTION,
  TRANSCRIPT_MESSAGE_ACTION,
  WIDGET_IFRAME_IS_READY_ACTION,
  parseClientToFrameAction,
  type FrameToClientAction,
  type WindowDimensions,
} from './lib/embed-messages';
import { type Hume } from 'hume';

export type AssistantTranscriptMessage = Hume.empathicVoice.AssistantMessage;
export type JSONMessage = Hume.empathicVoice.SubscribeEvent;
export type UserTranscriptMessage = Hume.empathicVoice.UserMessage;
export type EmotionScores = Hume.empathicVoice.EmotionScores;
export type ToolCall = Hume.empathicVoice.ToolCallMessage;
export type ToolResponse = Hume.empathicVoice.ToolResponseMessage;
export type ToolError = Hume.empathicVoice.ToolErrorMessage;
export type ChatMetadataMessage = Hume.empathicVoice.ChatMetadata;

export type SubscribeEvent = Hume.empathicVoice.SubscribeEvent;
export type AssistantMessage = Hume.empathicVoice.AssistantMessage;
export type UserMessage = Hume.empathicVoice.UserMessage;
export type ToolCallMessage = Hume.empathicVoice.ToolCallMessage;
export type ToolResponseMessage = Hume.empathicVoice.ToolResponseMessage;
export type ToolErrorMessage = Hume.empathicVoice.ToolErrorMessage;
export type ChatMetadata = Hume.empathicVoice.ChatMetadata;

export { LanguageModelOption } from './types';
export { type SocketConfig } from './lib/embed-messages';
