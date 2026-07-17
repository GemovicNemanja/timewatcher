import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverStub,
  configurable: true
});

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    get length() { return storage.size; },
    clear() { storage.clear(); },
    getItem(key: string) { return storage.get(key) ?? null; },
    key(index: number) { return [...storage.keys()][index] ?? null; },
    removeItem(key: string) { storage.delete(key); },
    setItem(key: string, value: string) { storage.set(key, String(value)); }
  },
  configurable: true
});
