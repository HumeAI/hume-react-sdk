import { intervalToDuration } from 'date-fns';
import { useCallback, useEffect, useRef } from 'react';

class CallDurationStore {
  private _snapshot: string | null = null;

  private _listeners = new Set<() => void>();

  write(value: string | null): void {
    if (value === this._snapshot) return;
    this._snapshot = value;
    for (const listener of this._listeners) {
      listener();
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  getSnapshot = (): string | null => {
    return this._snapshot;
  };

  getServerSnapshot = (): string | null => {
    return null;
  };
}

export const useCallDuration = () => {
  const interval = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const store = useRef(new CallDurationStore()).current;

  const start = useCallback(() => {
    startTime.current = Date.now();
    store.write('00:00:00');

    interval.current = window.setInterval(() => {
      if (startTime.current) {
        const duration = intervalToDuration({
          start: startTime.current,
          end: Date.now(),
        });

        const hours = (duration.hours ?? 0).toString().padStart(2, '0');
        const minutes = (duration.minutes ?? 0).toString().padStart(2, '0');
        const seconds = (duration.seconds ?? 0).toString().padStart(2, '0');

        store.write(`${hours}:${minutes}:${seconds}`);
      }
    }, 500);
  }, [store]);

  const stop = useCallback(() => {
    if (interval.current) {
      window.clearInterval(interval.current);
      interval.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (interval.current) {
        window.clearInterval(interval.current);
        interval.current = null;
      }
    };
  }, []);

  return { store, start, stop };
};

export type { CallDurationStore };
