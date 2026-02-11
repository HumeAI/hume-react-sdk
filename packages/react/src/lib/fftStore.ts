import { useSyncExternalStore } from 'react';

const BARK_BAND_COUNT = 24;

export type FftSnapshot = readonly number[];

const EMPTY_FFT: FftSnapshot = Object.freeze(
  new Array<number>(BARK_BAND_COUNT).fill(0),
);

export class FftStore {
  private _buffer: number[] = new Array<number>(BARK_BAND_COUNT).fill(0);

  private _snapshot: FftSnapshot = EMPTY_FFT;

  private _listeners = new Set<() => void>();

  private _dirty = false;

  private _rafId: number | null = null;

  write(data: number[]): void {
    for (let i = 0; i < BARK_BAND_COUNT; i++) {
      this._buffer[i] = data[i] ?? 0;
    }
    if (!this._dirty) {
      this._dirty = true;
      this._scheduleFlush();
    }
  }

  clear(): void {
    this._buffer.fill(0);
    this._dirty = true;
    this._flush();
  }

  private _scheduleFlush(): void {
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._flush();
    });
  }

  private _flush(): void {
    if (!this._dirty) return;
    this._dirty = false;
    this._snapshot = Object.freeze([...this._buffer]);
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

  getSnapshot = (): FftSnapshot => {
    return this._snapshot;
  };

  getServerSnapshot = (): FftSnapshot => {
    return EMPTY_FFT;
  };

  destroy(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._listeners.clear();
    this._buffer.fill(0);
    this._snapshot = EMPTY_FFT;
  }
}

export function useFftSubscription(store: FftStore): FftSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}
