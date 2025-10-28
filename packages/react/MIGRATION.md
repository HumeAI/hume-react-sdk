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
