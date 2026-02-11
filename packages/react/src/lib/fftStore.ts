import { useSyncExternalStore } from 'react';

const BARK_BAND_COUNT = 24;

export type FftSnapshot = readonly number[];

const EMPTY_FFT: FftSnapshot = Object.freeze(
  new Array<number>(BARK_BAND_COUNT).fill(0),
);

/**
 * A lightweight external store for FFT data that avoids React state updates.
 *
 * Writes go into a mutable pre-allocated buffer. Subscribers are notified
 * at most once per animation frame via requestAnimationFrame, regardless of
 * how frequently the underlying data is written (e.g. 200Hz from setInterval).
 *
 * Designed for use with useSyncExternalStore.
 */
export class FftStore {
  private _buffer: number[] = new Array<number>(BARK_BAND_COUNT).fill(0);

  private _snapshot: FftSnapshot = EMPTY_FFT;

  private _listeners = new Set<() => void>();

  private _dirty = false;

  private _rafId: number | null = null;

  /**
   * Write new FFT data into the buffer. Does not allocate.
   * Subscribers are batched and notified on the next animation frame.
   */
  write(data: number[]): void {
    for (let i = 0; i < BARK_BAND_COUNT; i++) {
      this._buffer[i] = data[i] ?? 0;
    }
    if (!this._dirty) {
      this._dirty = true;
      this._scheduleFlush();
    }
  }

  /** Reset to silence and notify subscribers immediately. */
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
    // Create a new frozen snapshot for React's identity check.
    // This happens at most ~60Hz (once per rAF), not 200Hz.
    this._snapshot = Object.freeze([...this._buffer]);
    for (const listener of this._listeners) {
      listener();
    }
  }

  // --- useSyncExternalStore contract ---

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

/**
 * React hook that subscribes to an FftStore and returns the current FFT snapshot.
 * Only re-renders when the store produces a new snapshot (~60Hz max).
 */
export function useFftSubscription(store: FftStore): FftSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}
