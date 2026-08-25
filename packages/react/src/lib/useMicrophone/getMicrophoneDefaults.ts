import { Channels } from '@humeai/assistant';

import type { EncodingValues } from './constants';
import { DEFAULT_ENCODING_VALUES } from './constants';

const getSupportedChannelCount = (channelCount: number): Channels => {
  if (channelCount === 1) {
    return Channels.MONO;
  }
  if (channelCount === 2) {
    return Channels.STEREO;
  }

  throw new Error(`Unsupported microphone channel count: ${channelCount}`);
};

const getStreamSettings = (
  stream: MediaStream,
  encodingConstraints: Partial<EncodingValues> = {},
): EncodingValues => {
  const [track] = stream.getAudioTracks();

  if (!track) {
    throw new Error('The microphone stream has no audio track.');
  }

  const settings = track.getSettings();
  const channelCount =
    settings.channelCount ??
    encodingConstraints.channelCount ??
    DEFAULT_ENCODING_VALUES.channelCount;

  return {
    sampleRate:
      settings.sampleRate ??
      encodingConstraints.sampleRate ??
      DEFAULT_ENCODING_VALUES.sampleRate,
    channelCount: getSupportedChannelCount(channelCount),
  };
};

export { getStreamSettings };
