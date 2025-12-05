'use client';

import { useVoice } from '@humeai/voice-react';
import { useEffect, useState } from 'react';
import { match } from 'ts-pattern';

import { ChatConnected } from '@/components/ChatConnected';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/Select';

export const ExampleComponent = ({
  accessToken,
  configId,
}: {
  accessToken: string;
  configId?: string;
}) => {
  const { connect, disconnect, status, callDurationTimestamp } = useVoice();

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>(
    [],
  );
  const [audioOutputDevices, setAudioOutputDevices] = useState<
    MediaDeviceInfo[]
  >([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');

  useEffect(() => {
    const getDevices = async () => {
      let stream: MediaStream | null = null;
      try {
        // Request permission first
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Get all devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(
          (device) => device.kind === 'audioinput',
        );
        const audioOutputs = devices.filter(
          (device) => device.kind === 'audiooutput',
        );

        setAudioInputDevices(audioInputs);
        setAudioOutputDevices(audioOutputs);

        // Set defaults to first device
        if (audioInputs.length > 0 && !selectedMicrophoneId) {
          setSelectedMicrophoneId(audioInputs[0].deviceId);
        }
        if (audioOutputs.length > 0 && !selectedSpeakerId) {
          setSelectedSpeakerId(audioOutputs[0].deviceId);
        }
      } catch {
        // eslint-disable-next-line no-console
        console.warn('Unable to enumerate devices');
      } finally {
        // Close the microphone stream now that we have the device IDs
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      }
    };

    void getDevices();
  }, [selectedMicrophoneId, selectedSpeakerId]);

  const connectArgs = {
    auth: {
      type: 'accessToken' as const,
      value: accessToken,
    },
    hostname: process.env.NEXT_PUBLIC_HUME_VOICE_HOSTNAME || 'api.hume.ai',
    ...(configId
      ? {
          configId,
          sessionSettings: {
            type: 'session_settings' as const,
            builtinTools: [{ name: 'web_search' as const }],
          },
        }
      : {}),
    devices: {
      microphoneDeviceId: selectedMicrophoneId,
      speakerDeviceId: selectedSpeakerId,
    },
  };

  const deviceSelectors = (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Microphone</div>
        <Select
          value={selectedMicrophoneId}
          onValueChange={setSelectedMicrophoneId}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select microphone" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto rounded-md border bg-white shadow-lg">
            {audioInputDevices.map((device) => (
              <SelectItem
                key={device.deviceId}
                value={device.deviceId}
                className="cursor-pointer px-8 py-2 hover:bg-gray-100"
              >
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Speaker</div>
        <Select value={selectedSpeakerId} onValueChange={setSelectedSpeakerId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select speaker" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto rounded-md border bg-white shadow-lg">
            {audioOutputDevices.map((device) => (
              <SelectItem
                key={device.deviceId}
                value={device.deviceId}
                className="cursor-pointer px-8 py-2 hover:bg-gray-100"
              >
                {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const connectButton = (
    <button
      className="max-w-sm rounded border border-neutral-500 p-2"
      onClick={() => {
        void connect(connectArgs);
      }}
    >
      Connect to voice
    </button>
  );

  const callDuration = (
    <div>
      <div className={'text-sm font-medium uppercase'}>Call duration</div>
      <div>{callDurationTimestamp ?? 'n/a'}</div>
    </div>
  );

  return (
    <div>
      <div className={'flex flex-col gap-4 font-light'}>
        <div>
          <div className={'text-sm font-medium uppercase'}>Status</div>
          <div>{status.value}</div>
        </div>
        <div className="flex flex-col gap-4">
          {match(status.value)
            .with('connected', () => <ChatConnected />)
            .with('disconnected', () => (
              <div className="flex flex-col gap-4">
                {!configId && (
                  <div className="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800">
                    Tool use is disabled. Please provide the HUME_CONFIG_ID
                    environment variable to enable tool use.
                  </div>
                )}
                {callDuration}
                {deviceSelectors}
                {connectButton}
              </div>
            ))
            .with('connecting', () => (
              <div className="flex max-w-sm flex-col gap-4">
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
              </div>
            ))
            .with('error', () => (
              <div className="flex flex-col gap-4">
                {!configId && (
                  <div className="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800">
                    Tool use is disabled. Please provide the HUME_CONFIG_ID
                    environment variable to enable tool use.
                  </div>
                )}
                {callDuration}
                {deviceSelectors}
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
