<div align="center">
  <img src="https://storage.googleapis.com/hume-public-logos/hume/hume-banner.png">
  <h1>@humeai/voice-react</h1>
  <p>
    <strong>Integrate Hume's Empathic Voice Interface in your React application</strong>
  </p>
</div>

## Overview

This package streamlines all of the required state management for building client side applications using the [EVI Chat WebSocket](https://dev.hume.ai/reference/empathic-voice-interface-evi/chat/chat) through a `<VoiceProvider>` component and `useVoice()` hook. It provides a WebSocket, Microphone Interface, Audio Playback Queue, and Message History that are all designed to work closely together.

> [!NOTE]
> This package uses Web APIs for microphone input and audio playback that are not compatible with React Native.

## Prerequisites

> [!IMPORTANT]
> This package is built for use within modern web based React applications using a bundler like `Next.js`, `Webpack`, or `Vite`

Before installing this package, please ensure your development environment meets the following requirement:

- Node.js (`v18.0.0` or higher).

To verify your Node.js version, run this command in your terminal:

```sh
node --version
```

If your Node.js version is below `18.0.0`, update it to meet the requirement. For updating Node.js, visit [Node.js' official site](https://nodejs.org/) or use a version management tool like nvm for a more seamless upgrade process.

## Installation

Add `@humeai/voice-react` to your project by running this command in your project directory:

```bash
npm install @humeai/voice-react
```

This will download and include the package in your project, making it ready for import and use within your React components.

```tsx
import { VoiceProvider } from '@humeai/voice-react';
```

## Usage

> :rocket: Visit our [Next.js quickstart](https://dev.hume.ai/docs/speech-to-speech-evi/quickstart/nextjs) for step-by-step setup instructions and example code to jumpstart your development.

### Context Provider

To use the SDK, wrap your components in the `VoiceProvider`, which will enable your components to access available voice methods. Here's a simple example to get you started:

```tsx
import { VoiceProvider } from '@humeai/voice-react';

function Page() {
  return (
    <VoiceProvider>
      {/* ... */}
    </VoiceProvider>
  );
}
```

### Configuring [VoiceProvider](https://github.com/HumeAI/empathic-voice-api-js/blob/8a4f9b87870c68650cde73a818edd093716c59fd/packages/react/src/lib/VoiceProvider.tsx)

See a complete list of props accepted by `VoiceProvider` below:

#### `enableAudioWorklet?`: boolean

(_Optional_) A flag to toggle the audio player implementation between AudioWorklet and AudioBuffer. AudioWorklet is recommended for best audio quality results on most browsers, but has degraded performance on Safari 17. Defaults to `true`.

#### `onMessage?`: (message: [JsonMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/JsonMessage.ts) & { receivedAt: Date;}) => void

(_Optional_) Callback function to invoke upon receiving a message through the web socket.

#### `onToolCall?`: [ToolCallHandler](https://github.com/HumeAI/empathic-voice-api-js/blob/8a4f9b87870c68650cde73a818edd093716c59fd/packages/react/src/lib/useVoiceClient.ts#L28)

(_Optional_) Callback function to invoke upon receiving a ToolCallMessage through the web socket. It will send the string returned as a the content of a ToolResponseMessage. This is where you should add logic that handles your custom tool calls.

#### `onAudioReceived?`: (message: AudioOutputMessage) => void

(_Optional_) Callback function to invoke when an audio output message is received from the websocket.

#### `onAudioStart?`: (clipId: string) => void

(_Optional_) Callback function to invoke when an audio clip from the assistant starts playing.

#### `onAudioEnd?`: (clipId: string) => void

(_Optional_) Callback function to invoke when an audio clip from the assistant stops playing.

#### `onInterruption?`: (clipId: string) => void

(_Optional_) Callback function to invoke when the assistant is interrupted.

#### `onClose?`: (event: [CloseEvent](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/core/websocket/events.ts#L20)) => void

(_Optional_) Callback function to invoke upon the web socket connection being closed.

#### `clearMessagesOnDisconnect?`: boolean

(_Optional_) Boolean which indicates whether you want to clear message history when the call ends.

#### `messageHistoryLimit?`: number

(_Optional_) Set the number of messages that you wish to keep over the course of the conversation. The default value is 100.


## Connecting to EVI

After you have set up your voice provider, you will be able to access various properties and methods to use the voice in your application. In any component that is a child of `VoiceProvider`, access these methods by importing the `useVoice` custom hook.

For example, to include a button to start a call, you could create a button like this:

```tsx
'use client'
import { useVoice } from '@humeai/voice-react';

export function StartCall({
  accessToken,
}: {
  accessToken: string;
}) {
  const { connect } = useVoice();

  return (
    <>
      <button
        onClick={() => {
          void connect({
            auth: { type: 'accessToken', value: accessToken },
            configId: '<YOUR_CONFIG_ID>',
            // other configuration props go here
          });
        }}
      >
        Start Call
      </button>
    </>
  );
}
```

> [!IMPORTANT]
> Under the hood, the React SDK uses the AudioContext API, which [must be initialized by a user gesture](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices#autoplay_policy).
>
> :white_check_mark: CORRECT: call `connect` on a button click.
>
> :x: INCORRECT: call `connect` in a `useEffect` to start a call on component mount.

### Methods

#### `connect`: (options?: ConnectOptions) => Promise

Opens a socket connection to the voice API and initializes the microphone.

| Parameter | Type               | Description                               |
| --------- | ------------------ | ----------------------------------------- |
| `options` | `ConnectOptions`   | Optional settings for the connection.     |

#### `disconnect`: () => void

Disconnect from the voice API and microphone.

#### `clearMessages`: () => void

Clear transcript messages from history.

#### `mute`: () => void

Mute the microphone

#### `unmute`: () => void

Unmute the microphone

#### `muteAudio`: () => void

Mute the assistant audio

#### `unmuteAudio`: () => void

Unmute the assistant audio

#### `setVolume`: (level: number) => void

Sets the playback volume for audio generated by the assistant. Input values are clamped between `0.0` (silent) and `1.0` (full volume).

#### `sendSessionSettings`: (message: [SessionSettings](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/SessionSettings.ts)) => void

Send new session settings to the assistant. This overrides any session settings that were passed as props to the VoiceProvider.

#### `sendUserInput`: (text: string) => void

Send a user input message.

#### `sendAssistantInput`: (text: string) => void

Send a text string for the assistant to read out loud.

#### `sendToolMessage`: (toolMessage: [ToolResponse](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/ToolResponseMessage.ts) \| [ToolError](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/ToolErrorMessage.ts)) => void

Send a tool response or tool error message to the EVI backend.

#### `pauseAssistant`: () => void

Pauses responses from EVI. Chat history is still saved and sent after resuming.

#### `resumeAssistant`: () => void

Resumes responses from EVI. Chat history sent while paused will now be sent.

### Properties

#### `isMuted`: boolean

Boolean that describes whether the microphone is muted.

#### `isAudioMuted`: boolean

Boolean that describes whether the assistant audio is muted.

#### `volume`: number

The current playback volume level for the assistant's voice, ranging from `0.0` (silent) to `1.0` (full volume). Defaults to `1.0`.

#### `isPlaying`: boolean

Describes whether the assistant audio is currently playing.

#### `isPaused`: boolean

Boolean that describes whether the assistant is paused. When paused, the assistant will still be listening, but will not send a response until it is resumed.

#### `fft`: number[]

Audio FFT values for the assistant audio output.

#### `micFft`: number[]

Audio FFT values for microphone input.

#### `messages`: [UserTranscriptMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/UserMessage.ts) | [AssistantTranscriptMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/AssistantMessage.ts) | [ConnectionMessage](https://github.com/HumeAI/empathic-voice-api-js/blob/8a4f9b87870c68650cde73a818edd093716c59fd/packages/react/src/lib/connection-message.ts) | [UserInterruptionMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/UserInterruption.ts) | [JSONErrorMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/WebSocketError.ts)

Message history of the current conversation. By default, `messages` does not include interim user messages when `verboseTranscription` is set to true on the `VoiceProvider` (`verboseTranscription` is true by default). To access interim messages, you can define a custom `onMessage` callback on your `VoiceProvider`.

#### `lastVoiceMessage`: [AssistantTranscriptMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/AssistantMessage.ts) | null

The last transcript message received from the assistant.

#### `lastUserMessage`: [UserTranscriptMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/UserMessage.ts) | null

The last transcript message received from the user.

#### `readyState`: [VoiceReadyState](https://github.com/HumeAI/empathic-voice-api-js/blob/8a4f9b87870c68650cde73a818edd093716c59fd/packages/react/src/lib/useVoiceClient.ts#L21)

The current readyState of the websocket connection.

#### `status`: [VoiceStatus](https://github.com/HumeAI/empathic-voice-api-js/blob/8a4f9b87870c68650cde73a818edd093716c59fd/packages/react/src/lib/VoiceProvider.tsx#L41)

The current status of the voice connection. Informs you of whether the voice is connected, disconnected, connecting, or error. If the voice is in an error state, it will automatically disconnect from the websocket and microphone.

#### `error`: [VoiceError](https://github.com/HumeAI/empathic-voice-api-js/blob/8a4f9b87870c68650cde73a818edd093716c59fd/packages/react/src/lib/VoiceProvider.tsx#L36)

Provides more detailed error information if the voice is in an error state.

#### `isError`: boolean

If true, the voice is in an error state.

#### `isAudioError`: boolean

If true, an audio playback error has occurred.

#### `isMicrophoneError`: boolean

If true, a microphone error has occurred.

#### `isSocketError`: boolean

If true, there was an error connecting to the websocket.

#### `callDurationTimestamp`: string | null

The length of a call. This value persists after the conversation has ended.

#### `toolStatusStore`: Record<string, { call?: [ToolCall](); resolved?: [ToolResponse]() | [ToolError]() }>

A map of tool call IDs to their associated tool messages.

#### `chatMetadata`: [ChatMetadataMessage](https://github.com/HumeAI/hume-typescript-sdk/blob/ac89e41e45a925f9861eb6d5a1335ab51d5a1c94/src/api/resources/empathicVoice/types/ChatMetadata.ts) | null

Metadata about the current chat, including chat ID, chat group ID, and request ID.

#### `playerQueueLength`: number

The number of assistant audio clips that are queued up, including the clip that is currently playing.

## Types

###  `ConnectOptions`

```ts
export type ConnectOptions = {
  /** Authentication strategy and corresponding value. Authentication is required to establish the web socket connection with Hume's Voice API. See our [documentation](https://dev.hume.ai/docs/quick-start#getting-your-api-key) on obtaining your `API key` or `access token`.
 */
  auth: AuthStrategy;
  /** Hostname of the Hume API. If not provided this value will default to `"api.hume.ai"`. */
  hostname?: string;
  /** If you have a configuration ID with voice presets, pass the config ID here. */
  configId?: string;
  /** If you wish to use a specific version of your config, pass in the version ID here. */
  configVersion?: string;
  /** A flag to enable verbose transcription. When `true`, unfinalized user transcripts are sent to the client as interim UserMessage messages, which makes the assistant more sensitive to interruptions. Defaults to `true`. */
  verboseTranscription?: boolean;
  /** Include a chat group ID, which enables the chat to continue from a previous chat group. */
  resumedChatGroupId?: string;
  /** Custom audio constraints passed to navigator.getUserMedia to get the microphone stream */
  audioConstraints?: AudioConstraints;
  /** Session settings to be sent immediately once the connection to EVI is established. See documentation for details: https://dev.hume.ai/docs/empathic-voice-interface-evi/configuration/session-settings */
  sessionSettings?: Hume.empathicVoice.SessionSettings;
  /** Device ID of the speaker/audio output to use for playback. Uses the default audio output if not specified. */
  speakerDeviceId?: string;
};
```

### `AudioConstraints`

```ts
export type AudioConstraints = {
  /** Reduce echo from the input (if supported). Defaults to `true`. */
  echoCancellation?: boolean;
  /** Suppress background noise (if supported). Defaults to `true`.*/
  noiseSuppression?: boolean;
  /** Automatically adjust microphone gain (if supported). Defaults to `true`. */
  autoGainControl?: boolean;
  /** Device ID of the microphone/audio input to use. Uses the default microphone if not specified. */
  deviceId?: string;
};
```

## Support

If you have questions or require assistance pertaining to this package, [reach out to us on Discord](https://hume.ai/discord)!
