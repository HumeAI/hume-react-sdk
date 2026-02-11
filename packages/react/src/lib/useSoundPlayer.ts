import { convertBase64ToBlob } from 'hume';
import { useCallback, useMemo, useRef, useState } from 'react';

import { convertLinearFrequenciesToBarkInto } from './convertFrequencyScale';
import { FftStore } from './fftStore';
import { useLatestRef } from './useLatestRef';
import type { AudioPlayerErrorReason } from './VoiceProvider';
import type { AudioOutputMessage } from '../models/messages';
import { loadAudioWorklet } from '../utils/loadAudioWorklet';

// Worklet message types (replaces Zod schemas)
interface WorkletStartClipMessage {
  type: 'start_clip';
  id: string;
  index: number;
}
interface WorkletEndedMessage {
  type: 'ended';
}
interface WorkletQueueLengthMessage {
  type: 'queueLength';
  length: number;
}
interface WorkletClosedMessage {
  type: 'worklet_closed';
}
type WorkletMessage =
  | WorkletStartClipMessage
  | WorkletEndedMessage
  | WorkletQueueLengthMessage
  | WorkletClosedMessage;

const BARK_BAND_COUNT = 24;

export const useSoundPlayer = (props: {
  enableAudioWorklet: boolean;
  onError: (message: string, reason: AudioPlayerErrorReason) => void;
  onPlayAudio: (id: string) => void;
  onStopAudio: (id: string) => void;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [volume, setVolumeState] = useState<number>(1.0);

  // FFT data is managed outside React state via FftStore.
  // Components subscribe to it via useSyncExternalStore (see fftStore.ts).
  const fftStore = useRef(new FftStore()).current;

  const audioContext = useRef<AudioContext | null>(null);
  const ownsAudioContext = useRef(false);
  const analyserNode = useRef<AnalyserNode | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const workletNode = useRef<AudioWorkletNode | null>(null);
  const isInitialized = useRef(false);

  const isProcessing = useRef(false);
  const fftRafId = useRef<number | null>(null);

  const onPlayAudio = useLatestRef(props.onPlayAudio);
  const onStopAudio = useLatestRef(props.onStopAudio);
  const onError = useLatestRef(props.onError);

  const isWorkletActive = useRef(false);

  // chunkBufferQueues and lastQueuedChunk are used to make sure that
  // we don't play chunks out of order. chunkBufferQueues is NOT the
  // audio playback queue.
  const chunkBufferQueues = useRef<
    Record<string, Array<AudioBuffer | undefined>>
  >({});
  const lastQueuedChunk = useRef<{ id: string; index: number } | null>(null);

  /**
   * Only for non-AudioWorklet mode.
   * In non-AudioWorklet mode, audio clips are managed and played sequentially.
   * When the current audio clip finishes, the next clip in the queue is played automatically.
   * In AudioWorklet mode, audio processing and playback are handled by the worklet itself.
   * In non-AudioWorklet, we must track the currently playing audio buffer
   * in order to stop it when a new clip is added or when playback is manually stopped by the user.
   */
  const clipQueue = useRef<
    Array<{
      id: string;
      buffer: AudioBuffer;
      index: number;
    }>
  >([]);
  const [queueLength, setQueueLength] = useState(0);
  const currentlyPlayingAudioBuffer = useRef<AudioBufferSourceNode | null>(
    null,
  );

  /**
   * Only for non-AudioWorklet mode.
   * This function is called when the current audio clip ends.
   * It will play the next clip in the queue if there is one.
   */
  const playNextClip = useCallback(() => {
    if (clipQueue.current.length === 0 || isProcessing.current) {
      setQueueLength(0);
      return;
    }

    if (analyserNode.current === null || audioContext.current === null) {
      onError.current(
        'Audio player is not initialized',
        'audio_player_initialization_failure',
      );
      return;
    }

    const nextClip = clipQueue.current.shift();
    setQueueLength(clipQueue.current.length);

    if (!nextClip) return;

    isProcessing.current = true;
    setIsPlaying(true);

    const bufferSource = audioContext.current.createBufferSource();

    bufferSource.buffer = nextClip.buffer;

    bufferSource.connect(analyserNode.current);

    currentlyPlayingAudioBuffer.current = bufferSource;

    // Pre-allocate buffers for FFT analysis (zero allocations per frame)
    const frequencyDataBuffer = new Uint8Array(
      analyserNode.current.frequencyBinCount,
    );
    const barkBuffer = new Array<number>(BARK_BAND_COUNT).fill(0);

    const updateFrequencyData = () => {
      try {
        const bufferSampleRate = bufferSource.buffer?.sampleRate;

        if (!analyserNode.current || typeof bufferSampleRate === 'undefined')
          return;

        analyserNode.current.getByteFrequencyData(frequencyDataBuffer);
        convertLinearFrequenciesToBarkInto(
          frequencyDataBuffer,
          bufferSampleRate,
          barkBuffer,
        );
        fftStore.write(barkBuffer);
      } catch {
        fftStore.clear();
      }
    };

    // Use requestAnimationFrame instead of setInterval(5ms) for display-rate updates
    const pollFft = () => {
      updateFrequencyData();
      fftRafId.current = requestAnimationFrame(pollFft);
    };
    fftRafId.current = requestAnimationFrame(pollFft);

    bufferSource.start(0);
    if (nextClip.index === 0) {
      onPlayAudio.current(nextClip.id);
    }

    bufferSource.onended = () => {
      if (fftRafId.current) {
        cancelAnimationFrame(fftRafId.current);
        fftRafId.current = null;
      }
      fftStore.clear();
      bufferSource.disconnect();
      isProcessing.current = false;
      setIsPlaying(false);
      onStopAudio.current(nextClip.id);
      currentlyPlayingAudioBuffer.current = null;
      playNextClip();
    };
  }, [fftStore]);

  const initPlayer = useCallback(
    async (speakerDeviceId?: string, sharedAudioContext?: AudioContext) => {
      isWorkletActive.current = true;

      try {
        const initAudioContext = sharedAudioContext ?? new AudioContext();
        ownsAudioContext.current = !sharedAudioContext;
        audioContext.current = initAudioContext;

        // Set the speaker device if specified and supported
        if (speakerDeviceId && 'setSinkId' in initAudioContext) {
          try {
            // TypeScript doesn't recognize setSinkId on AudioContext yet, so we need to cast
            await (
              initAudioContext as AudioContext & {
                setSinkId: (deviceId: string) => Promise<void>;
              }
            ).setSinkId(speakerDeviceId);
          } catch (e) {
            onError.current(
              `Failed to set speaker device: ${e instanceof Error ? e.message : 'Unknown error'}`,
              'audio_player_initialization_failure',
            );
            // Continue initialization even if setSinkId fails
          }
        }

        // Use AnalyserNode to get fft frequency data for visualizations
        const analyser = initAudioContext.createAnalyser();
        // Use GainNode to adjust volume
        const gain = initAudioContext.createGain();

        analyser.fftSize = 2048; // Must be a power of 2
        analyser.connect(gain);
        gain.connect(initAudioContext.destination);

        analyserNode.current = analyser;
        gainNode.current = gain;

        if (props.enableAudioWorklet) {
          const isWorkletLoaded = await loadAudioWorklet(initAudioContext);
          if (!isWorkletLoaded) {
            onError.current(
              'Failed to load audio worklet',
              'audio_worklet_load_failure',
            );
            return;
          }

          const worklet = new AudioWorkletNode(
            initAudioContext,
            'audio-processor',
          );
          worklet.connect(analyser);
          workletNode.current = worklet;

          worklet.port.onmessage = (e: MessageEvent) => {
            const data = e.data as WorkletMessage;

            switch (data.type) {
              case 'start_clip':
                if (data.index === 0) {
                  onPlayAudio.current(data.id);
                }
                setIsPlaying(true);
                break;

              case 'ended':
                setIsPlaying(false);
                onStopAudio.current('stream');
                break;

              case 'queueLength':
                if (data.length === 0) {
                  setIsPlaying(false);
                }
                setQueueLength(data.length);
                break;

              case 'worklet_closed':
                isWorkletActive.current = false;
                break;
            }
          };

          // Pre-allocate buffers for FFT analysis (zero allocations per frame)
          const frequencyDataBuffer = new Uint8Array(analyser.frequencyBinCount);
          const barkBuffer = new Array<number>(BARK_BAND_COUNT).fill(0);

          // Use requestAnimationFrame instead of setInterval(5ms) for display-rate updates
          const pollFft = () => {
            analyser.getByteFrequencyData(frequencyDataBuffer);
            convertLinearFrequenciesToBarkInto(
              frequencyDataBuffer,
              initAudioContext.sampleRate,
              barkBuffer,
            );
            fftStore.write(barkBuffer);
            fftRafId.current = requestAnimationFrame(pollFft);
          };
          fftRafId.current = requestAnimationFrame(pollFft);

          isInitialized.current = true;
        } else {
          isInitialized.current = true;
        }
      } catch (e) {
        onError.current(
          'Failed to initialize audio player',
          'audio_player_initialization_failure',
        );
      }
    },
    [props.enableAudioWorklet, fftStore],
  );

  const convertToAudioBuffer = useCallback(
    async (message: AudioOutputMessage) => {
      if (!isInitialized.current || !audioContext.current) {
        onError.current(
          'Audio player has not been initialized',
          'audio_player_not_initialized',
        );
        return;
      }
      const blob = convertBase64ToBlob(message.data);
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer =
        await audioContext.current.decodeAudioData(arrayBuffer);
      return audioBuffer;
    },
    [],
  );

  const getNextAudioBuffers = useCallback(
    (message: AudioOutputMessage, audioBuffer: AudioBuffer) => {
      //1. Add the current buffer to the queue
      if (!chunkBufferQueues.current[message.id]) {
        chunkBufferQueues.current[message.id] = [];
      }
      const queueForCurrMessage = chunkBufferQueues.current[message.id] || [];
      queueForCurrMessage[message.index] = audioBuffer;

      // 2. Now collect buffers that are ready to be played
      const lastId = lastQueuedChunk.current?.id;
      const buffers: Array<{ id: string; index: number; buffer: AudioBuffer }> =
        [];

      // If the current message ID is different from the last one that was added
      // to the queue, that means that we're playing a new message now, so the first chunk
      // we play needs to be at index 0.
      if (message.id !== lastId) {
        if (queueForCurrMessage[0]) {
          lastQueuedChunk.current = { id: message.id, index: 0 };
          buffers.push({
            id: message.id,
            index: 0,
            buffer: queueForCurrMessage[0],
          });
          // Every time we add a buffer to the buffers array, we set the current index to undefined.
          // This is so that we don't try to add the same buffer to the buffers array again the next
          // time we call this function.
          queueForCurrMessage[0] = undefined;
        } else {
          // If the current index is not 0, that means the chunks came out of order,
          // so we return an empty array instead of returning anything to be added to the queue.
          return [];
        }
      }

      // Drain the queue - basically if any chunks were received out of order previously,
      // and they're now ready to be played because the earlier chunks
      // have been received, we can add them to the buffers array.
      let nextIdx = (lastQueuedChunk.current?.index || 0) + 1;
      let nextBuf = queueForCurrMessage[nextIdx];
      while (nextBuf) {
        buffers.push({ index: nextIdx, buffer: nextBuf, id: message.id });
        // As above re: setting queueForCurrMessage[nextIdx] to undefined
        queueForCurrMessage[nextIdx] = undefined;
        lastQueuedChunk.current = { id: message.id, index: nextIdx };
        nextIdx += 1;
        nextBuf = queueForCurrMessage[nextIdx];
      }

      return buffers;
    },
    [],
  );

  const addToQueue = useCallback(
    async (message: AudioOutputMessage) => {
      if (!isInitialized.current || !audioContext.current) {
        onError.current(
          'Audio player has not been initialized',
          'audio_player_not_initialized',
        );
        return;
      }

      const audioBuffer = await convertToAudioBuffer(message);
      if (!audioBuffer) {
        onError.current(
          'Failed to convert data to audio buffer',
          'malformed_audio',
        );
        return;
      }

      // Because converting the data to an audi obuffer is async, chunks that are
      // only a few ms apart can end up converting out of order. So we need this
      // getNextAudioBuffers function to make sure that we're playing the chunks
      // in the correct order.
      const playableBuffers = getNextAudioBuffers(message, audioBuffer);
      if (playableBuffers.length === 0) {
        return;
      }

      try {
        // Loop through the buffers and add them to the playback queue one at a time
        for (const nextAudioBufferToPlay of playableBuffers) {
          if (props.enableAudioWorklet) {
            // AudioWorklet mode
            const pcmData = nextAudioBufferToPlay.buffer.getChannelData(0);
            workletNode.current?.port.postMessage({
              type: 'audio',
              data: pcmData,
              id: nextAudioBufferToPlay.id,
              index: nextAudioBufferToPlay.index,
            });
          } else if (!props.enableAudioWorklet) {
            // Non-AudioWorklet mode
            clipQueue.current.push({
              id: nextAudioBufferToPlay.id,
              buffer: nextAudioBufferToPlay.buffer,
              index: nextAudioBufferToPlay.index,
            });
            setQueueLength(clipQueue.current.length);
            // playNextClip will iterate the clipQueue upon finishing
            // the playback of the current audio clip,
            // so we can just call playNextClip here if it's the only one in the queue
            if (clipQueue.current.length === 1) {
              playNextClip();
            }
          }
        }
      } catch (e) {
        const eMessage = e instanceof Error ? e.message : 'Unknown error';
        onError.current(
          `Failed to add clip to queue: ${eMessage}`,
          'malformed_audio',
        );
      }
    },
    [
      convertToAudioBuffer,
      getNextAudioBuffers,
      playNextClip,
      props.enableAudioWorklet,
    ],
  );

  const stopAll = useCallback(async () => {
    isInitialized.current = false;
    isProcessing.current = false;
    setIsPlaying(false);
    setIsAudioMuted(false);
    setVolumeState(1.0);
    fftStore.clear();

    chunkBufferQueues.current = {};
    lastQueuedChunk.current = null;

    if (fftRafId.current) {
      cancelAnimationFrame(fftRafId.current);
      fftRafId.current = null;
    }

    if (props.enableAudioWorklet) {
      // AudioWorklet mode
      workletNode.current?.port.postMessage({ type: 'fadeAndClear' });
      workletNode.current?.port.postMessage({ type: 'end' });

      // We use this loop to make sure the worklet has been closed before we consider
      // the player to be successfully stopped. The audio worklet asynchronously emits
      // the 'worklet_closed' message in order to confirm that it has been closed successfully.
      // If you close the worklet before the fade-out, the user may hear a small audio
      // artifact when the call ends.
      // (Reference the `_fadeOutDurationMs` constant in `audio-worklet.js`
      // to see how long it takes for the worklet to close - the current default is 300ms.)
      let closed = 0;
      while (closed < 5) {
        if (isWorkletActive.current === false) {
          break;
        }
        closed += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // In the unlikely event that the worklet is still active after 500ms,
      // something went wrong in the worklet code, and the worklet failed to close.
      // So we should reset isWorkletActive to false anyway.
      isWorkletActive.current = false;

      if (workletNode.current) {
        workletNode.current.port.close();
        workletNode.current.disconnect();
        workletNode.current = null;
      }
    } else if (!props.enableAudioWorklet) {
      // Non-AudioWorklet mode
      if (currentlyPlayingAudioBuffer.current) {
        currentlyPlayingAudioBuffer.current.disconnect();
        currentlyPlayingAudioBuffer.current = null;
      }

      clipQueue.current = [];
      setQueueLength(0);
    }

    if (analyserNode.current) {
      analyserNode.current.disconnect();
      analyserNode.current = null;
    }

    // Only close the AudioContext if this hook created it.
    // When a shared AudioContext was provided, the caller manages its lifecycle.
    if (audioContext.current && ownsAudioContext.current) {
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
    } else {
      audioContext.current = null;
    }
  }, [props.enableAudioWorklet, fftStore]);

  const stopAllWithRetries = useCallback(
    async (maxAttempts = 3, delayMs = 500) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await stopAll();
          return;
        } catch (e) {
          if (attempt < maxAttempts) {
            await new Promise((res) => setTimeout(res, delayMs));
          } else {
            const message = e instanceof Error ? e.message : 'Unknown error';
            onError.current?.(
              `Failed to stop audio player after ${maxAttempts} attempts: ${message}`,
              'audio_player_closure_failure',
            );
          }
        }
      }
    },
    [stopAll],
  );

  const clearQueue = useCallback(() => {
    if (props.enableAudioWorklet) {
      // AudioWorklet mode
      workletNode.current?.port.postMessage({
        type: 'fadeAndClear',
      });
    } else if (!props.enableAudioWorklet) {
      // Non-AudioWorklet mode
      if (currentlyPlayingAudioBuffer.current) {
        currentlyPlayingAudioBuffer.current.stop();
        currentlyPlayingAudioBuffer.current = null;
      }
      clipQueue.current = [];
      setQueueLength(0);
    }

    isProcessing.current = false;
    setIsPlaying(false);
    fftStore.clear();
  }, [props.enableAudioWorklet, fftStore]);

  const setVolume = useCallback(
    (newLevel: number) => {
      const clampedLevel = Math.max(0, Math.min(newLevel, 1.0));
      setVolumeState(clampedLevel);
      if (gainNode.current && audioContext.current && !isAudioMuted) {
        gainNode.current.gain.setValueAtTime(
          clampedLevel,
          audioContext.current.currentTime,
        );
      }
    },
    [isAudioMuted],
  );

  const muteAudio = useCallback(() => {
    if (gainNode.current && audioContext.current) {
      gainNode.current.gain.setValueAtTime(0, audioContext.current.currentTime);
      setIsAudioMuted(true);
    }
  }, []);

  const unmuteAudio = useCallback(() => {
    if (gainNode.current && audioContext.current) {
      gainNode.current.gain.setValueAtTime(
        volume,
        audioContext.current.currentTime,
      );
      setIsAudioMuted(false);
    }
  }, [volume]);

  return useMemo(
    () => ({
      addToQueue,
      fftStore,
      initPlayer,
      isPlaying,
      isAudioMuted,
      muteAudio,
      unmuteAudio,
      stopAll: stopAllWithRetries,
      clearQueue,
      volume,
      setVolume,
      queueLength,
    }),
    [
      addToQueue,
      fftStore,
      initPlayer,
      isPlaying,
      isAudioMuted,
      muteAudio,
      unmuteAudio,
      stopAllWithRetries,
      clearQueue,
      volume,
      setVolume,
      queueLength,
    ],
  );
};
