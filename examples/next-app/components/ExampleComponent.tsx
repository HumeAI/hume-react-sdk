'use client';

import { useVoice } from '@humeai/voice-react';
import { SelectItem } from '@radix-ui/react-select';
import { useCallback, useState } from 'react';
import { match } from 'ts-pattern';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@/components/Select';
import { Waveform } from '@/components/Waveform';

export const ExampleComponent = ({ accessToken }: { accessToken: string }) => {
  const {
    connect,
    disconnect,
    fft: audioFft,
    status,
    isMuted,
    isAudioMuted,
    isPlaying,
    mute,
    muteAudio,
    readyState,
    unmute,
    unmuteAudio,
    messages,
    micFft,
    callDurationTimestamp,
    sendUserInput,
    sendAssistantInput,
    pauseAssistant,
    resumeAssistant,
    chatMetadata,
    lastUserMessage,
    lastVoiceMessage,
    isPaused,
    volume,
    setVolume,
    playerQueueLength,
  } = useVoice();

  const [textValue, setTextValue] = useState('');
  const [textInputType, setTextInputType] = useState<'user' | 'assistant'>(
    'user',
  );

  const togglePaused = useCallback(() => {
    if (isPaused) {
      resumeAssistant();
    } else {
      pauseAssistant();
    }
  }, [isPaused, resumeAssistant, pauseAssistant]);
  const pausedText = isPaused ? 'Resume' : 'Pause';

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(event.target.value);
      setVolume(newVolume);
    },
    [setVolume],
  );

  const callDuration = (
    <div>
      <div className={'text-sm font-medium uppercase'}>Call duration</div>
      <div>{callDurationTimestamp ?? 'n/a'}</div>
    </div>
  );

  const connectArgs = {
    auth: {
      type: 'accessToken' as const,
      value: accessToken,
    },
    hostname: process.env.NEXT_PUBLIC_HUME_VOICE_HOSTNAME || 'api.hume.ai',
    configId: process.env.NEXT_PUBLIC_HUME_VOICE_WEATHER_CONFIG_ID,
    sessionSettings: {
      type: 'session_settings' as const,
      builtinTools: [{ name: 'web_search' as const }],
    },
  };

  const connectButton = (
    <button
      className="rounded border border-neutral-500 p-2"
      onClick={() => {
        void connect(connectArgs);
      }}
    >
      Connect to voice
    </button>
  );

  return (
    <div>
      <div className={'flex flex-col gap-4 font-light'}>
        <div>
          <div className={'text-sm font-medium uppercase'}>Status</div>
          <div>{status.value}</div>
        </div>
        <div className="flex max-w-sm flex-col gap-4">
          {match(status.value)
            .with('connected', () => (
              <>
                <div className="flex gap-6">
                  {callDuration}
                  <div>
                    <div className={'text-sm font-medium uppercase'}>
                      Playing
                    </div>
                    <div>{isPlaying ? 'true' : 'false'}</div>
                  </div>
                  <div>
                    <div className={'text-sm font-medium uppercase'}>
                      Player queue length
                    </div>
                    <div>{playerQueueLength}</div>
                  </div>
                  <div>
                    <div className={'text-sm font-medium uppercase'}>
                      Ready state
                    </div>
                    <div>{readyState}</div>
                  </div>
                  <div>
                    <div className={'text-sm font-medium uppercase'}>
                      Request ID
                    </div>
                    <div>{chatMetadata?.requestId}</div>
                  </div>
                  <div>
                    <div className={'text-sm font-medium uppercase'}>
                      Chat group ID
                    </div>
                    <div>{chatMetadata?.chatGroupId}</div>
                  </div>
                </div>

                <button
                  className="rounded border border-neutral-500 p-2"
                  onClick={() => {
                    void disconnect();
                  }}
                >
                  Disconnect
                </button>
                {isMuted ? (
                  <button
                    className="rounded border border-neutral-500 p-2"
                    onClick={() => unmute()}
                  >
                    Unmute mic
                  </button>
                ) : (
                  <button
                    className="rounded border border-neutral-500 p-2"
                    onClick={() => mute()}
                  >
                    Mute mic
                  </button>
                )}
                <button
                  className="rounded border border-neutral-500 p-2"
                  onClick={() => (isAudioMuted ? unmuteAudio() : muteAudio())}
                >
                  {isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
                </button>

                <div className="flex flex-col gap-1 pt-2">
                  <label
                    htmlFor="volumeSlider"
                    className="text-sm font-medium uppercase"
                  >
                    Volume ({Math.round(volume * 100)}%)
                  </label>
                  <input
                    id="volumeSlider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    disabled={isAudioMuted}
                  />
                </div>

                <div className="flex gap-10">
                  <Waveform fft={audioFft} />
                  <Waveform fft={micFft} />
                </div>

                <div className="flex flex-col justify-start gap-2">
                  <div className="text-sm font-medium uppercase">
                    Send a text input message
                  </div>
                  <div className="flex gap-2">
                    <SelectGroup className="shrink-0">
                      <Select
                        value={textInputType}
                        onValueChange={(value) => {
                          if (value === 'user' || value === 'assistant') {
                            setTextInputType(value);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select message input type" />
                          {textInputType === 'user' ? 'User' : 'Assistant'}
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="assistant">Assistant</SelectItem>
                        </SelectContent>
                      </Select>
                    </SelectGroup>
                    <label className="flex grow flex-col gap-2">
                      <span className="sr-only">Text input content</span>
                      <input
                        className="border px-2 py-1 text-black"
                        placeholder="Write an input message here"
                        value={textValue}
                        onChange={(e) => setTextValue(e.target.value)}
                      />
                    </label>
                  </div>

                  <button
                    className="border border-black p-2"
                    onClick={() => {
                      const method =
                        textInputType === 'user'
                          ? sendUserInput
                          : sendAssistantInput;
                      method(textValue);
                    }}
                  >
                    Send text input message
                  </button>

                  <button
                    className="border border-black p-2"
                    onClick={togglePaused}
                  >
                    {pausedText}
                  </button>
                </div>

                <div>
                  <div className={'text-sm font-medium uppercase'}>
                    All messages ({messages.length})
                  </div>
                  <textarea
                    className={
                      'w-full bg-neutral-800 font-mono text-sm text-white'
                    }
                    value={JSON.stringify(messages, null, 0)}
                    readOnly
                  ></textarea>
                </div>

                <div>
                  <div className={'text-sm font-medium uppercase'}>
                    Last assistant message
                  </div>
                  <div>
                    Received at:{' '}
                    {lastVoiceMessage?.receivedAt.toTimeString() ?? 'n/a'}
                  </div>

                  <textarea
                    className={
                      'w-full bg-neutral-800 font-mono text-sm text-white'
                    }
                    value={JSON.stringify(lastVoiceMessage)}
                    readOnly
                  ></textarea>
                </div>

                <div>
                  <div className={'text-sm font-medium uppercase'}>
                    Last user message
                  </div>
                  <div>
                    Received at:{' '}
                    {lastUserMessage?.receivedAt.toTimeString() ?? 'n/a'}
                  </div>
                  <textarea
                    className={
                      'w-full bg-neutral-800 font-mono text-sm text-white'
                    }
                    value={JSON.stringify(lastUserMessage)}
                    readOnly
                  ></textarea>
                </div>
              </>
            ))
            .with('disconnected', () => (
              <>
                {callDuration}
                {connectButton}
              </>
            ))
            .with('connecting', () => (
              <>
                {callDuration}

                <button
                  className="cursor-not-allowed rounded border border-neutral-500 p-2"
                  disabled
                >
                  Connecting...
                </button>
                <button
                  className="rounded border border-red-500 p-2 text-red-500"
                  onClick={() => {
                    void disconnect();
                  }}
                >
                  Disconnect
                </button>
              </>
            ))
            .with('error', () => (
              <div className="flex flex-col gap-4">
                {callDuration}
                {connectButton}
                <div>
                  <span className="text-red-500">{status.reason}</span>
                </div>
              </div>
            ))
            .exhaustive()}
        </div>
      </div>
    </div>
  );
};
