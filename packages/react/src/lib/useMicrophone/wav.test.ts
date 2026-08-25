import { describe, expect, it } from 'vitest';

import { extractLinear16Pcm } from './wav';

const writeChunkId = (view: DataView, offset: number, id: string) => {
  Array.from(id).forEach((character, index) => {
    view.setUint8(offset + index, character.charCodeAt(0));
  });
};

const createWav = ({
  audioFormat = 1,
  bitsPerSample = 16,
  pcm = new Uint8Array([1, 2, 3, 4]),
}: {
  audioFormat?: number;
  bitsPerSample?: number;
  pcm?: Uint8Array;
} = {}): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);

  writeChunkId(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeChunkId(view, 8, 'WAVE');
  writeChunkId(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, bitsPerSample, true);
  writeChunkId(view, 36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(pcm);

  return buffer;
};

describe('extractLinear16Pcm', () => {
  it('removes the WAV container header from LINEAR16 audio', () => {
    const pcm = new Uint8Array([10, 20, 30, 40]);

    expect(new Uint8Array(extractLinear16Pcm(createWav({ pcm })))).toEqual(pcm);
  });

  it('rejects buffers without a WAV header', () => {
    expect(() => extractLinear16Pcm(new ArrayBuffer(12))).toThrow(
      'The recorder returned an invalid WAV header.',
    );
  });

  it('rejects compressed or non-16-bit WAV audio', () => {
    expect(() => extractLinear16Pcm(createWav({ audioFormat: 3 }))).toThrow(
      'The recorder did not return LINEAR16 PCM audio.',
    );
    expect(() => extractLinear16Pcm(createWav({ bitsPerSample: 24 }))).toThrow(
      'The recorder did not return LINEAR16 PCM audio.',
    );
  });
});
