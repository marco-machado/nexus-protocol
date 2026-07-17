// minimal observable box shared by the app's React seams (screen state,
// mission mount); compatible with React's useSyncExternalStore
export class Store<T> {
  private listeners = new Set<() => void>();

  constructor(private value: T) {}

  get = (): T => this.value;

  set = (value: T): void => {
    this.value = value;
    for (const fn of [...this.listeners]) fn();
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
}
