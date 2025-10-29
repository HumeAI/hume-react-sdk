import { type Hume } from 'hume';
import z from 'zod';

type AssistantEnd = Hume.empathicVoice.AssistantEnd;
type AssistantMessage = Hume.empathicVoice.AssistantMessage;
type AssistantProsody = Hume.empathicVoice.AssistantProsody;
type AudioInput = Hume.empathicVoice.AudioInput;
type AudioOutput = Hume.empathicVoice.AudioOutput;
type ChatMetadata = Hume.empathicVoice.ChatMetadata;
type JsonMessage = Hume.empathicVoice.JsonMessage;
type ToolCallMessage = Hume.empathicVoice.ToolCallMessage;
type ToolErrorMessage = Hume.empathicVoice.ToolErrorMessage;
type ToolResponseMessage = Hume.empathicVoice.ToolResponseMessage;
type UserInterruption = Hume.empathicVoice.UserInterruption;
type UserMessage = Hume.empathicVoice.UserMessage;
type WebSocketError = Hume.empathicVoice.WebSocketError;

type WithReceivedAt<T> = T & { receivedAt: Date };

export type AssistantEndMessage = WithReceivedAt<AssistantEnd>;
export type AssistantTranscriptMessage = WithReceivedAt<AssistantMessage>;
export type AssistantProsodyMessage = WithReceivedAt<AssistantProsody>;
export type AudioMessage = WithReceivedAt<AudioInput>;
export type AudioOutputMessage = WithReceivedAt<AudioOutput>;
export type ChatMetadataMessage = WithReceivedAt<ChatMetadata>;
export type JSONErrorMessage = WithReceivedAt<WebSocketError>;
export type JSONMessage = WithReceivedAt<JsonMessage>;
export type ToolCall = WithReceivedAt<ToolCallMessage>;
export type ToolError = WithReceivedAt<ToolErrorMessage>;
export type ToolResponse = WithReceivedAt<ToolResponseMessage>;
export type UserInterruptionMessage = WithReceivedAt<UserInterruption>;
export type UserTranscriptMessage = WithReceivedAt<UserMessage>;

export const TimeSliceSchema = z.object({
  begin: z.number(),
  end: z.number(),
});

export type TimeSlice = z.infer<typeof TimeSliceSchema>;
