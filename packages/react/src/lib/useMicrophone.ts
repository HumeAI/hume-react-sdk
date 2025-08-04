// cspell:ignore dataavailable
import type { MimeType } from 'hume';
import { getBrowserSupportedMimeType } from 'hume';
import { useCallback, useEffect, useRef, useState } from 'react';

import { convertLinearFrequenciesToBark } from './convertFrequencyScale';
import { generateEmptyFft } from './generateEmptyFft';
import type { MicErrorReason } from './VoiceProvider';

export type MicrophoneProps = {
  onAudioCaptured: (b: ArrayBuffer) => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onError: (message: string, reason: MicErrorReason) => void;
};

export const useMicrophone = (props: MicrophoneProps) => {
  const { onAudioCaptured, onError } = props;
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  const currentStream = useRef<MediaStream | null>(null);

  const [fft, setFft] = useState<number[]>(generateEmptyFft());
  const currentAnalyzer = useRef<AnalyserNode | null>(null);
  const fftAnimationId = useRef<number | null>(null);
  const analyzerSource = useRef<MediaStreamAudioSourceNode | null>(null);

  const mimeTypeRef = useRef<MimeType | null>(null);

  const audioContext = useRef<AudioContext | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);

  const sendAudio = useRef(onAudioCaptured);
  sendAudio.current = onAudioCaptured;

  const dataHandler = useCallback((event: BlobEvent) => {
    const blob = event.data;

    blob
      .arrayBuffer()
      .then((buffer) => {
        if (buffer.byteLength > 0) {
          sendAudio.current?.(buffer);
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  const startFftAnalyzer = useCallback((stream: MediaStream) => {
    if (!audioContext.current) {
      return;
    }

    const source = audioContext.current.createMediaStreamSource(stream);
    analyzerSource.current = source;
    currentAnalyzer.current = audioContext.current.createAnalyser();
    currentAnalyzer.current.fftSize = 2048;
    const bufferLength = currentAnalyzer.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    source.connect(currentAnalyzer.current);
    const draw = () => {
      if (!currentAnalyzer.current || !audioContext.current) {
        return;
      }

      currentAnalyzer.current.getByteFrequencyData(dataArray);

      const sampleRate = audioContext.current.sampleRate;

      const barkFrequencies = convertLinearFrequenciesToBark(
        dataArray,
        sampleRate,
      );

      setFft(barkFrequencies);
      fftAnimationId.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const start = useCallback(
    (stream: MediaStream) => {
      if (!stream) {
        throw new Error('No stream connected');
      }

      if (fftAnimationId.current) {
        cancelAnimationFrame(fftAnimationId.current);
      }

      currentStream.current = stream;

      const context = new AudioContext();
      audioContext.current = context;

      try {
        startFftAnalyzer(stream);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error(`Failed to start mic analyzer: ${message}`);
      }
      const mimeType = mimeTypeRef.current;
      if (!mimeType) {
        throw new Error('No MimeType specified');
      }

      recorder.current = new MediaRecorder(stream, {
        mimeType,
      });
      recorder.current.addEventListener('dataavailable', dataHandler);
      recorder.current.start(100);
    },
    [dataHandler, startFftAnalyzer],
  );

  const stop = useCallback(async () => {
    if (analyzerSource.current) {
      analyzerSource.current.disconnect();
      analyzerSource.current = null;
    }

    if (currentAnalyzer.current) {
      if (fftAnimationId.current) {
        cancelAnimationFrame(fftAnimationId.current);
      }
      fftAnimationId.current = null;
      currentAnalyzer.current = null;
    }

    if (audioContext.current) {
      await audioContext.current
        .close()
        .then(() => {
          audioContext.current = null;
        })
        .catch(() => {
          // .close() rejects if the audio context is already closed.
          // Therefore, we just need to catch the error, but we don't need to
          // do anything with it.
          return null;
        });
    }

    recorder.current?.stop();
    recorder.current?.removeEventListener('dataavailable', dataHandler);
    recorder.current = null;
    currentStream.current?.getTracks().forEach((track) => track.stop());

    setIsMuted(false);
  }, [dataHandler]);

  const stopMicWithRetries = async (maxAttempts = 3, delayMs = 500) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await stop();
        return;
      } catch (e) {
        if (attempt < maxAttempts) {
          await new Promise((res) => setTimeout(res, delayMs));
        } else {
          const message = e instanceof Error ? e.message : 'Unknown error';
          onError?.(
            `Failed to stop mic after ${maxAttempts} attempts: ${message}`,
            'mic_closure_failure',
          );
        }
      }
    }
  };

  const mute = useCallback(() => {
    if (currentAnalyzer.current) {
      setFft(generateEmptyFft());
    }

    currentStream.current?.getTracks().forEach((track) => {
      track.enabled = false;
    });

    isMutedRef.current = true;
    setIsMuted(true);
  }, []);

  const unmute = useCallback(() => {
    currentStream.current?.getTracks().forEach((track) => {
      track.enabled = true;
    });

    isMutedRef.current = false;
    setIsMuted(false);
  }, [currentStream]);

  useEffect(() => {
    return () => {
      try {
        recorder.current?.stop();
        recorder.current?.removeEventListener('dataavailable', dataHandler);

        if (currentAnalyzer.current) {
          analyzerSource.current?.disconnect();
          if (fftAnimationId.current) {
            cancelAnimationFrame(fftAnimationId.current);
          }
          fftAnimationId.current = null;
          currentAnalyzer.current = null;
        }

        currentStream.current?.getTracks().forEach((track) => track.stop());
        currentStream.current = null;
      } catch (e) {
        console.log(e);
        void true;
      }
    };
  }, [dataHandler, currentStream]);

  useEffect(() => {
    const mimeTypeResult = getBrowserSupportedMimeType();
    if (mimeTypeResult.success) {
      mimeTypeRef.current = mimeTypeResult.mimeType;
    } else {
      onError(mimeTypeResult.error.message, 'mime_types_not_supported');
    }
  }, [onError]);

  return {
    start,
    stop: stopMicWithRetries,
    mute,
    unmute,
    isMuted,
    fft,
  };
};
