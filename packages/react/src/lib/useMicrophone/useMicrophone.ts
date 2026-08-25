// cspell:ignore dataavailable

import {
  MediaRecorder as ExtendableMediaRecorder,
  type IBlobEvent,
  type IMediaRecorder,
  register,
} from 'extendable-media-recorder';
import { connect as connectWavEncoder } from 'extendable-media-recorder-wav-encoder';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EncodingValues } from './constants';
import { DEFAULT_ENCODING_VALUES } from './constants';
import { getStreamSettings } from './getMicrophoneDefaults';
import { extractLinear16Pcm } from './wav';

const WAV_MIME_TYPE = 'audio/wav';

let wavEncoderRegistration: Promise<void> | undefined;

class MicrophonePreparationCancelledError extends Error {
  constructor() {
    super('Microphone preparation was cancelled.');
    this.name = 'MicrophonePreparationCancelledError';
  }
}

const registerWavEncoder = async (): Promise<void> => {
  const encoderPort = await connectWavEncoder();
  await register(encoderPort);
};

const ensureWavEncoderRegistered = (): Promise<void> => {
  if (!wavEncoderRegistration) {
    wavEncoderRegistration = registerWavEncoder();
    void wavEncoderRegistration.catch(() => {
      wavEncoderRegistration = undefined;
    });
  }

  return wavEncoderRegistration;
};

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const normalizedError = new Error(error.message);
    if ('name' in error && typeof error.name === 'string') {
      normalizedError.name = error.name;
    }
    return normalizedError;
  }

  return new Error(String(error));
};

export type MicrophoneProps = {
  encodingConstraints: Partial<EncodingValues>;
  onAudioCaptured: (buffer: ArrayBuffer) => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onError?: (message: string, error: Error) => void;
  onMicPermissionChange: (permission: 'prompt' | 'granted' | 'denied') => void;
};

export const useMicrophone = ({
  encodingConstraints,
  onAudioCaptured,
  onStartRecording,
  onStopRecording,
  onError,
  onMicPermissionChange,
}: MicrophoneProps) => {
  const isMutedRef = useRef(false);
  const isFirstChunkRef = useRef(true);
  const isRecordingRef = useRef(false);
  const audioGenerationRef = useRef(0);
  const preparationAttemptRef = useRef(0);
  const recorderRef = useRef<IMediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [realEncodingValues, setRealEncodingValues] = useState<EncodingValues>(
    DEFAULT_ENCODING_VALUES,
  );

  const sendAudioRef = useRef(onAudioCaptured);
  const onErrorRef = useRef(onError);
  const onMicPermissionChangeRef = useRef(onMicPermissionChange);
  const onStartRecordingRef = useRef(onStartRecording);
  const onStopRecordingRef = useRef(onStopRecording);

  sendAudioRef.current = onAudioCaptured;
  onErrorRef.current = onError;
  onMicPermissionChangeRef.current = onMicPermissionChange;
  onStartRecordingRef.current = onStartRecording;
  onStopRecordingRef.current = onStopRecording;

  const reportError = useCallback((message: string, error: unknown) => {
    const normalizedError = toError(error);
    onErrorRef.current?.(message, normalizedError);
    return normalizedError;
  }, []);

  const processAudioData = useCallback(
    async (event: IBlobEvent, audioGeneration: number): Promise<void> => {
      try {
        let audioBuffer = await event.data.arrayBuffer();

        if (audioGeneration !== audioGenerationRef.current) {
          return;
        }

        if (isFirstChunkRef.current) {
          isFirstChunkRef.current = false;
          audioBuffer = extractLinear16Pcm(audioBuffer);
        }

        if (!isMutedRef.current && audioBuffer.byteLength > 0) {
          sendAudioRef.current(audioBuffer);
        }
      } catch (error) {
        reportError('Error processing microphone audio.', error);
      }
    },
    [reportError],
  );

  const dataHandler = useCallback(
    (event: IBlobEvent) => {
      void processAudioData(event, audioGenerationRef.current);
    },
    [processAudioData],
  );

  const recorderErrorHandler = useCallback(() => {
    reportError(
      'Error recording microphone audio.',
      new Error('The microphone recorder reported an error.'),
    );
  }, [reportError]);

  const stop = useCallback(() => {
    preparationAttemptRef.current += 1;
    audioGenerationRef.current += 1;
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    const wasRecording = isRecordingRef.current;
    let stopError: Error | undefined;

    recorderRef.current = null;
    streamRef.current = null;
    isRecordingRef.current = false;

    if (recorder) {
      try {
        recorder.removeEventListener('dataavailable', dataHandler);
        recorder.removeEventListener('error', recorderErrorHandler);
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch (error) {
        stopError = toError(error);
      }
    }

    stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (error) {
        stopError ??= toError(error);
      }
    });

    isFirstChunkRef.current = true;

    if (wasRecording) {
      onStopRecordingRef.current?.();
    }

    if (stopError) {
      reportError('Error stopping microphone recording.', stopError);
    }
  }, [dataHandler, recorderErrorHandler, reportError]);

  const prepare = useCallback(async (): Promise<EncodingValues> => {
    stop();
    const preparationAttempt = preparationAttemptRef.current + 1;
    preparationAttemptRef.current = preparationAttempt;

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...encodingConstraints,
        },
        video: false,
      });

      if (preparationAttempt !== preparationAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        throw new MicrophonePreparationCancelledError();
      }

      onMicPermissionChangeRef.current('granted');
    } catch (error) {
      if (
        error instanceof MicrophonePreparationCancelledError ||
        preparationAttempt !== preparationAttemptRef.current
      ) {
        throw new MicrophonePreparationCancelledError();
      }

      onMicPermissionChangeRef.current('denied');
      throw reportError('Microphone permission denied.', error);
    }

    streamRef.current = stream;

    try {
      const encodingValues = getStreamSettings(stream, encodingConstraints);

      await ensureWavEncoderRegistered();

      if (preparationAttempt !== preparationAttemptRef.current) {
        throw new MicrophonePreparationCancelledError();
      }

      if (!ExtendableMediaRecorder.isTypeSupported(WAV_MIME_TYPE)) {
        throw new Error(
          'This browser cannot record LINEAR16 microphone audio.',
        );
      }

      const recorder = new ExtendableMediaRecorder(stream, {
        mimeType: WAV_MIME_TYPE,
      });
      recorder.addEventListener('dataavailable', dataHandler);
      recorder.addEventListener('error', recorderErrorHandler);
      recorderRef.current = recorder;
      setRealEncodingValues(encodingValues);

      return encodingValues;
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) {
        streamRef.current = null;
        recorderRef.current = null;
      }

      if (error instanceof MicrophonePreparationCancelledError) {
        throw error;
      }

      throw reportError('Error preparing microphone recording.', error);
    }
  }, [
    dataHandler,
    encodingConstraints,
    recorderErrorHandler,
    reportError,
    stop,
  ]);

  const startPreparedRecording = useCallback(() => {
    const recorder = recorderRef.current;

    if (!recorder) {
      throw reportError(
        'Error starting microphone recording.',
        new Error('The microphone has not been prepared.'),
      );
    }

    try {
      isFirstChunkRef.current = true;
      recorder.start(250);
      isRecordingRef.current = true;
      onStartRecordingRef.current?.();
    } catch (error) {
      throw reportError('Error starting microphone recording.', error);
    }
  }, [reportError]);

  const start = useCallback(async (): Promise<EncodingValues> => {
    const encodingValues = await prepare();
    startPreparedRecording();
    return encodingValues;
  }, [prepare, startPreparedRecording]);

  const mute = useCallback(() => {
    isMutedRef.current = true;
    setIsMuted(true);
  }, []);

  const unmute = useCallback(() => {
    isMutedRef.current = false;
    setIsMuted(false);
  }, []);

  useEffect(() => {
    return stop;
  }, [stop]);

  return {
    isMuted,
    mute,
    prepare,
    realEncodingValues,
    start,
    startPreparedRecording,
    stop,
    unmute,
  };
};
