import { Channels } from '@humeai/assistant';

const DEFAULT_CHANNELS = Channels.MONO;
const DEFAULT_SAMPLE_RATE = 48000;

type EncodingValues = {
  sampleRate: number;
  channelCount: Channels;
};

const DEFAULT_ENCODING_VALUES: EncodingValues = {
  sampleRate: DEFAULT_SAMPLE_RATE,
  channelCount: DEFAULT_CHANNELS,
};

export { DEFAULT_ENCODING_VALUES };
export type { EncodingValues };
