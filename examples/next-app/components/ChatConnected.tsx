'use client';

import {
  useCallDurationTimestamp,
  useMicFft,
  usePlayerFft,
  useVoice,
} from '@humeai/voice-react';
import { SelectItem } from '@radix-ui/react-select';
import { MicIcon, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@/components/Select';
import { Waveform } from '@/components/Waveform';

export const ChatConnected = () => {
  const {
    disconnect,
    isMuted,
    isAudioMuted,
    isPlaying,
    mute,
    muteAudio,
    readyState,
    unmute,
    unmuteAudio,
    messages,
    sendUserInput,
    sendAssistantInput,
    pauseAssistant,
    resumeAssistant,
    chatMetadata,
    lastUserMessage,
    lastVoiceMessage,
    lastAssistantProsodyMessage,
    isPaused,
    volume,
    setVolume,
    playerQueueLength,
  } = useVoice();

  const audioFft = usePlayerFft();
  const micFft = useMicFft();
  const callDurationTimestamp = useCallDurationTimestamp();

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

  return (
    <div className="grid w-full grid-cols-2 gap-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-6">
          {callDuration}
          <div>
            <div className={'text-sm font-medium uppercase'}>Playing</div>
            <div>{isPlaying ? 'true' : 'false'}</div>
          </div>
          <div>
            <div className={'text-sm font-medium uppercase'}>
              Player queue length
            </div>
            <div>{playerQueueLength}</div>
          </div>
          <div>
            <div className={'text-sm font-medium uppercase'}>Ready state</div>
            <div>{readyState}</div>
          </div>
          <div>
            <div className={'text-sm font-medium uppercase'}>Request ID</div>
            <div>{chatMetadata?.requestId}</div>
          </div>
          <div>
            <div className={'text-sm font-medium uppercase'}>Chat group ID</div>
            <div>{chatMetadata?.chatGroupId}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
              <MicOff strokeWidth={1.5} />
            </button>
          ) : (
            <button
              className="rounded border border-neutral-500 p-2"
              onClick={() => mute()}
            >
              <MicIcon strokeWidth={1.5} />
            </button>
          )}
          <button
            className="rounded border border-neutral-500 p-2"
            onClick={() => (isAudioMuted ? unmuteAudio() : muteAudio())}
          >
            {isAudioMuted ? (
              <VolumeX strokeWidth={1.5} />
            ) : (
              <Volume2 strokeWidth={1.5} />
            )}
          </button>
        </div>

        <div className="flex flex-col gap-1 pt-2">
          <label
            htmlFor="volumeSlider"
            className="text-sm font-medium uppercase"
          >
            Volume ({Math.round(volume * 100)}%)
          </label>
          <input
            className="max-w-sm"
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
                textInputType === 'user' ? sendUserInput : sendAssistantInput;
              method(textValue);
            }}
          >
            Send text input message
          </button>

          <button className="border border-black p-2" onClick={togglePaused}>
            {pausedText}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className={'text-sm font-medium uppercase'}>
            All messages ({messages.length})
          </div>
          <div
            className={
              'flex w-full flex-col gap-2 bg-neutral-800 font-mono text-sm text-white'
            }
          >
            {messages.map((message) => {
              if (message.type === 'assistant_message') {
                return (
                  <div key={message.id}>
                    <div className="text-xs uppercase">Assistant</div>
                    <div>{message.message.content}</div>
                  </div>
                );
              }
              if (message.type === 'user_message') {
                return (
                  <div
                    key={
                      message.receivedAt.toISOString() +
                      message.message.content +
                      JSON.stringify(message.time)
                    }
                  >
                    <div className="text-xs uppercase">
                      User ({String(message.interim)})
                    </div>
                    <div>{message.message.content}</div>
                  </div>
                );
              }
              return (
                <div key={message.receivedAt.toISOString()}>
                  {JSON.stringify(message)}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className={'text-sm font-medium uppercase'}>
            Last assistant message
          </div>
          <div>
            Received at: {lastVoiceMessage?.receivedAt.toTimeString() ?? 'n/a'}
          </div>
          <textarea
            className={'w-full bg-neutral-800 font-mono text-sm text-white'}
            value={JSON.stringify(lastVoiceMessage)}
            readOnly
          ></textarea>
        </div>

        <div>
          <div className={'text-sm font-medium uppercase'}>
            Last user message
          </div>
          <div>
            Received at: {lastUserMessage?.receivedAt.toTimeString() ?? 'n/a'}
          </div>
          <textarea
            className={'w-full bg-neutral-800 font-mono text-sm text-white'}
            value={JSON.stringify(lastUserMessage)}
            readOnly
          ></textarea>
        </div>

        <div>
          <div className={'text-sm font-medium uppercase'}>
            Last assistant prosody message
          </div>
          <div>
            Received at:{' '}
            {lastAssistantProsodyMessage?.receivedAt.toTimeString() ?? 'n/a'}
          </div>
          <textarea
            className={'w-full bg-neutral-800 font-mono text-sm text-white'}
            value={JSON.stringify(lastAssistantProsodyMessage)}
            readOnly
          ></textarea>
        </div>
      </div>
    </div>
  );
};
