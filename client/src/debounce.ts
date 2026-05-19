// Tiny debounce. Avoids a lodash dependency for one shape of function we
// actually need in v0.

export interface Debounced<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
  flush(): void;
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (pendingArgs) {
        const a = pendingArgs;
        pendingArgs = null;
        fn(...a);
      }
    }, ms);
  }) as Debounced<T>;

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  debounced.flush = () => {
    if (timer && pendingArgs) {
      clearTimeout(timer);
      timer = null;
      const a = pendingArgs;
      pendingArgs = null;
      fn(...a);
    }
  };

  return debounced;
}
