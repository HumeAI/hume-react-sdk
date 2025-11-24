// cspell:ignore dataavailable
import { checkForAudioTracks } from 'hume';
import { useCallback, useRef, useState } from 'react';

type PermissionStatus = 'prompt' | 'granted' | 'denied';

const getAudioStream = async (
  audioConstraints: MediaTrackConstraints,
): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...audioConstraints,
      echoCancellation: audioConstraints.echoCancellation ?? true,
      noiseSuppression: audioConstraints.noiseSuppression ?? true,
      autoGainControl: audioConstraints.autoGainControl ?? true,
      deviceId: audioConstraints.deviceId,
    },
    video: false,
  });
};

export const useMicrophoneStream = () => {
  const [permission, setPermission] = useState<PermissionStatus>('prompt');
  const currentStream = useRef<MediaStream | null>(null);

  const getStream = useCallback(
    async (audioConstraints: MediaTrackConstraints) => {
      let stream: MediaStream | null = null;

      try {
        stream = await getAudioStream(audioConstraints);
      } catch (e) {
        if (
          e instanceof DOMException &&
          'name' in e &&
          e.name === 'NotAllowedError'
        ) {
          setPermission('denied');
        }
        throw e;
      }

      setPermission('granted');

      checkForAudioTracks(stream);

      currentStream.current = stream;

      return stream;
    },
    [],
  );

  const stopStream = useCallback(() => {
    if (currentStream.current) {
      currentStream.current.getTracks().forEach((track) => track.stop());
      currentStream.current = null;
    }
  }, []);

  return {
    getStream,
    stopStream,
    permission,
  };
};
