import { convertBase64ToBlob } from 'hume';
import { useCallback, useRef, useState } from 'react';
import z from 'zod';

import { convertLinearFrequenciesToBark } from './convertFrequencyScale';
import { generateEmptyFft } from './generateEmptyFft';
import type { AudioPlayerErrorReason } from './VoiceProvider';
import type { AudioOutputMessage } from '../models/messages';
import { loadAudioWorklet } from '../utils/loadAudioWorklet';

export const useSoundPlayer = (props: {
  enableAudioWorklet: boolean;
  onError: (message: string, reason: AudioPlayerErrorReason) => void;
  onPlayAudio: (id: string) => void;
  onStopAudio: (id: string) => void;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [volume, setVolumeState] = useState<number>(1.0);
  const [fft, setFft] = useState<number[]>(generateEmptyFft());

  const audioContext = useRef<AudioContext | null>(null);
  const analyserNode = useRef<AnalyserNode | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const workletNode = useRef<AudioWorkletNode | null>(null);
  const isInitialized = useRef(false);

  const isProcessing = useRef(false);
  const frequencyDataIntervalId = useRef<number | null>(null);

  const onPlayAudio = useRef<typeof props.onPlayAudio>(props.onPlayAudio);
  onPlayAudio.current = props.onPlayAudio;

  const onStopAudio = useRef<typeof props.onStopAudio>(props.onStopAudio);
  onStopAudio.current = props.onStopAudio;

  const onError = useRef<typeof props.onError>(props.onError);
  onError.current = props.onError;

  const isWorkletActive = useRef(false);

  // lastQueuedChunk and chunkBufferQueues are used to make sure that
  // we don't play chunks out of order. chunkBufferQueues is NOT the
  // audio playback queue
  const lastQueuedChunk = useRef({
    id: '',
    index: 0,
  });
  const chunkBufferQueues = useRef<
    Record<string, Array<AudioBuffer | undefined>>
  >({});

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

    const updateFrequencyData = () => {
      try {
        const bufferSampleRate = bufferSource.buffer?.sampleRate;

        if (!analyserNode.current || typeof bufferSampleRate === 'undefined')
          return;

        const dataArray = new Uint8Array(
          analyserNode.current.frequencyBinCount,
        ); // frequencyBinCount is 1/2 of fftSize
        analyserNode.current.getByteFrequencyData(dataArray); // Using getByteFrequencyData for performance

        const barkFrequencies = convertLinearFrequenciesToBark(
          dataArray,
          bufferSampleRate,
        );
        setFft(() => barkFrequencies);
      } catch (e) {
        setFft(generateEmptyFft());
      }
    };

    frequencyDataIntervalId.current = window.setInterval(
      updateFrequencyData,
      5,
    );

    bufferSource.start(0);
    if (nextClip.index === 0) {
      onPlayAudio.current(nextClip.id);
    }

    bufferSource.onended = () => {
      if (frequencyDataIntervalId.current) {
        clearInterval(frequencyDataIntervalId.current);
        frequencyDataIntervalId.current = null;
      }
      setFft(generateEmptyFft());
      bufferSource.disconnect();
      isProcessing.current = false;
      setIsPlaying(false);
      onStopAudio.current(nextClip.id);
      currentlyPlayingAudioBuffer.current = null;
      playNextClip();
    };
  }, []);

  const initPlayer = useCallback(async () => {
    isWorkletActive.current = true;

    try {
      const initAudioContext = new AudioContext();
      audioContext.current = initAudioContext;

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
          const playingEvent = z
            .object({
              type: z.literal('start_clip'),
              id: z.string(),
              index: z.number(),
            })
            .safeParse(e.data);

          if (playingEvent.success) {
            if (playingEvent.data.index === 0) {
              onPlayAudio.current(playingEvent.data.id);
            }
            setIsPlaying(true);
          }

          const endedEvent = z
            .object({ type: z.literal('ended') })
            .safeParse(e.data);
          if (endedEvent.success) {
            setIsPlaying(false);
            onStopAudio.current('stream');
          }

          const queueLengthEvent = z
            .object({ type: z.literal('queueLength'), length: z.number() })
            .safeParse(e.data);
          if (queueLengthEvent.success) {
            if (queueLengthEvent.data.length === 0) {
              setIsPlaying(false);
            }
            setQueueLength(queueLengthEvent.data.length);
          }

          const closedEvent = z
            .object({ type: z.literal('worklet_closed') })
            .safeParse(e.data);
          if (closedEvent.success) {
            isWorkletActive.current = false;
          }
        };

        frequencyDataIntervalId.current = window.setInterval(() => {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);

          const barkFrequencies = convertLinearFrequenciesToBark(
            dataArray,
            initAudioContext.sampleRate,
          );
          setFft(() => barkFrequencies);
        }, 5);
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
  }, [props.enableAudioWorklet]);

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
      const { id: lastId } = lastQueuedChunk.current;
      const buffers: AudioBuffer[] = [];

      // If the current message ID is different from the last one that was added
      // to the queue, that means that we're playing a new message now, so the first chunk
      // we play needs to be at index 0.
      if (message.id !== lastId) {
        if (queueForCurrMessage[0]) {
          lastQueuedChunk.current = { id: message.id, index: 0 };
          buffers.push(queueForCurrMessage[0]);
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
      let nextIdx = lastQueuedChunk.current.index + 1;
      let nextBuf = queueForCurrMessage[nextIdx];
      while (nextBuf) {
        buffers.push(nextBuf);
        // As above re: setting queueForCurrMessage[nextIdx] to undefined
        queueForCurrMessage[nextIdx] = undefined;
        lastQueuedChunk.current.index = nextIdx;
        nextBuf = queueForCurrMessage[nextIdx];
        nextIdx += 1;
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
            const pcmData = nextAudioBufferToPlay.getChannelData(0);
            workletNode.current?.port.postMessage({
              type: 'audio',
              data: pcmData,
              id: message.id,
              index: message.index,
            });
          } else if (!props.enableAudioWorklet) {
            // Non-AudioWorklet mode
            clipQueue.current.push({
              id: message.id,
              buffer: nextAudioBufferToPlay,
              index: message.index,
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
    setFft(generateEmptyFft());

    chunkBufferQueues.current = {};
    lastQueuedChunk.current = {
      id: '',
      index: 0,
    };

    if (frequencyDataIntervalId.current) {
      window.clearInterval(frequencyDataIntervalId.current);
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
  }, [props.enableAudioWorklet]);

  const stopAllWithRetries = async (maxAttempts = 3, delayMs = 500) => {
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
  };

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
    setFft(generateEmptyFft());
  }, [props.enableAudioWorklet]);

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

  return {
    addToQueue,
    fft,
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
  };
};
