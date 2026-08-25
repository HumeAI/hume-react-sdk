const RIFF_CHUNK_ID = 0x52494646;
const WAVE_FORMAT_ID = 0x57415645;
const FORMAT_CHUNK_ID = 0x666d7420;
const DATA_CHUNK_ID = 0x64617461;
const PCM_FORMAT = 1;
const LINEAR16_BITS_PER_SAMPLE = 16;

const extractLinear16Pcm = (wavBuffer: ArrayBuffer): ArrayBuffer => {
  const view = new DataView(wavBuffer);

  if (
    view.byteLength < 12 ||
    view.getUint32(0) !== RIFF_CHUNK_ID ||
    view.getUint32(8) !== WAVE_FORMAT_ID
  ) {
    throw new Error('The recorder returned an invalid WAV header.');
  }

  let offset = 12;
  let isLinear16 = false;

  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === FORMAT_CHUNK_ID) {
      if (chunkSize < 16 || chunkDataOffset + 16 > view.byteLength) {
        throw new Error('The recorder returned an invalid WAV format chunk.');
      }

      const audioFormat = view.getUint16(chunkDataOffset, true);
      const bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      isLinear16 =
        audioFormat === PCM_FORMAT &&
        bitsPerSample === LINEAR16_BITS_PER_SAMPLE;
    }

    if (chunkId === DATA_CHUNK_ID) {
      if (!isLinear16) {
        throw new Error('The recorder did not return LINEAR16 PCM audio.');
      }

      return wavBuffer.slice(chunkDataOffset);
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  throw new Error('The recorder returned WAV audio without a data chunk.');
};

export { extractLinear16Pcm };
