# Migration guide

## Migrating from 0.1.x to 0.2.0

This guide helps you migrate to the latest version of **@humeai/voice-react**, which introduces several breaking changes to improve clarity, session handling, and browser compatibility.

### 1. Connection Settings Moved from `VoiceProvider` Props to `connect` Parameters

**What changed**

Several connection-specific options were previously passed as props on `VoiceProvider`. These are now expected as parameters to the `connect()` function instead. This change makes the API cleaner, since these values are tied to a single session, not the component’s lifecycle.

The affected properties are:

- `auth`
- `hostName`
- `configId`
- `configVersion`
- `verboseTranscription`
- `resumedChatGroupId`
- `sessionSettings`

**How to migrate**

Remove these props from `VoiceProvider`, and instead pass them directly to the `useVoice` hook's `connect()` method as the `ConnectOptions` parameter when you start a session.

### 2. reconnectAttempts Removed from `VoiceProvider`

**What changed**

- The `reconnectAttempts` prop on `VoiceProvider` has been removed.
- Its default behavior is now set to 0, meaning calls will no longer auto-reconnect.
- This change is necessary due to browser security policies (particularly in Safari) that prevent automatically resuming audio/mic connections without explicit user action.

**How to migrate**

If your app disconnects from the chat due to an error, handle the reconnection manually in your code by prompting the user to click on `connect` again.

### 3. `disconnect` Method is Now Asynchronous

**What changed**

- The disconnect method on the voice client is now asynchronous.

**How to migrate**

- Make sure to `await` the `disconnect()` call if you need to guarantee cleanup before taking further actions, such as navigating away from a page.

### 4. Audio Player Updated to Use AudioWorklet

**What changed**

The audio player has been upgraded to use the AudioWorklet API, which improves audio quality and processing performance on modern browsers.

**How to migrate**

No changes are needed if you want to benefit from the new audio quality improvements. However, if you experience degraded performance — for example, on certain older versions of Safari (e.g. 17.5) — you can disable AudioWorklet and fall back to the legacy player by setting the `enableAudioWorklet` prop on `VoiceProvider` to `false`.

## Why These Changes?

- **Browser security:** browsers, especially Safari, require explicit user gestures to activate audio devices, making automatic reconnect infeasible.
- **Cleaner separation of concerns:** session-specific settings do not belong on a component that represents the entire app — moving them to `connect()` avoids unnecessary rerenders and easier state management, especially when refreshing access tokens or switching between configs.
- **Improved clarity:** asynchronous disconnects help you manage resource cleanup more predictably.
- **Improved audio:** AudioWorklet improves the quality audio playback, while still offering a fallback for compatibility.

---

## Migrating from 0.2.x to 0.3.0

This guide helps you migrate to **@humeai/voice-react** 0.3.0, which moves high-frequency data (FFT and call duration) off the main `useVoice()` context and into dedicated hooks for better performance and fewer unnecessary rerenders.

### 1. `fft`, `micFft`, and `callDurationTimestamp` Removed from `useVoice()`

**What changed**

- The following properties have been removed from the object returned by `useVoice()`:
  - `fft` — previously held FFT values for the assistant audio output
  - `micFft` — previously held FFT values for microphone input
  - `callDurationTimestamp` — previously held the formatted call duration string

- These values are high-frequency or time-based and caused the entire voice context to update very often when consumed from `useVoice()`, leading to unnecessary rerenders in every component that used the hook.

**How to migrate**

Use the new granular hooks instead of reading these from `useVoice()`:

| Previously (`useVoice()`) | Use instead |
|---------------------------|-------------|
| `const { fft } = useVoice()` | `const fft = usePlayerFft()` |
| `const { micFft } = useVoice()` | `const micFft = useMicFft()` |
| `const { callDurationTimestamp } = useVoice()` | `const callDurationTimestamp = useCallDurationTimestamp()` |

Each of these hooks must be used within a `VoiceProvider`. They subscribe via `useSyncExternalStore` so only components that use a given hook rerender when that data changes.

**Example (before)**

```tsx
import { useVoice } from '@humeai/voice-react';

function Waveform() {
  const { fft, micFft, callDurationTimestamp } = useVoice();
  return (
    <>
      <Visualization data={fft} />
      <MicVisualization data={micFft} />
      <span>{callDurationTimestamp ?? '0:00'}</span>
    </>
  );
}
```

**Example (after)**

```tsx
import {
  useVoice,
  usePlayerFft,
  useMicFft,
  useCallDurationTimestamp,
} from '@humeai/voice-react';

function Waveform() {
  const fft = usePlayerFft();
  const micFft = useMicFft();
  const callDurationTimestamp = useCallDurationTimestamp();
  return (
    <>
      <Visualization data={fft} />
      <MicVisualization data={micFft} />
      <span>{callDurationTimestamp ?? '0:00'}</span>
    </>
  );
}
```

### 2. FFT and Call Duration Types

**What changed**

- `usePlayerFft()` and `useMicFft()` return `readonly number[]` (not `number[]`). This reflects that the arrays are shared and must not be mutated.
- `useCallDurationTimestamp()` returns `string | null`, unchanged in meaning; it is updated at ~1 Hz during an active call.

**How to migrate**

- If you pass FFT data to a component that typed the prop as `number[]`, update the prop type to `readonly number[]` (e.g. `fft: readonly number[]`) so it accepts the return type of the new hooks.
- No change needed for call duration if you already treated it as `string | null`.

### 3. Why These Changes?

- **Performance:** High-frequency FFT updates no longer trigger rerenders in components that only need other voice state (e.g. `status`, `messages`, `connect`). Only components that use `usePlayerFft()`, `useMicFft()`, or `useCallDurationTimestamp()` subscribe to that data.
- **Stable context:** The main `VoiceContext` from `useVoice()` changes less often, so consumers that do not use FFT or call duration avoid extra renders.
- **Clearer API:** FFT and call duration are explicitly “display/visualization” data and are now accessed via dedicated hooks.
