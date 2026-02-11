import { useRef } from 'react';

/**
 * Returns a ref that always holds the latest value.
 * Useful for accessing the latest callback/value in event handlers
 * without adding it to effect dependency arrays.
 */
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
