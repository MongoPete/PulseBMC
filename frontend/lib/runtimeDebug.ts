type RuntimeKind = "eventSources" | "timers";

type RuntimeCounts = {
  eventSources: number;
  timers: number;
};

const counts: RuntimeCounts = {
  eventSources: 0,
  timers: 0,
};

const listeners = new Set<(snapshot: RuntimeCounts) => void>();

function emit() {
  const snapshot = { ...counts };
  listeners.forEach((cb) => cb(snapshot));
}

function acquire(kind: RuntimeKind): () => void {
  counts[kind] += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    counts[kind] = Math.max(0, counts[kind] - 1);
    emit();
  };
}

export function subscribeRuntimeCounts(cb: (snapshot: RuntimeCounts) => void): () => void {
  listeners.add(cb);
  cb({ ...counts });
  return () => listeners.delete(cb);
}

export function trackedEventSource(url: string): { es: EventSource; close: () => void } {
  const es = new EventSource(url);
  const release = acquire("eventSources");
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    es.close();
    release();
  };
  return { es, close };
}

export function trackedInterval(fn: () => void, ms: number): { clear: () => void } {
  const release = acquire("timers");
  const id = window.setInterval(fn, ms);
  let cleared = false;
  const clear = () => {
    if (cleared) return;
    cleared = true;
    window.clearInterval(id);
    release();
  };
  return { clear };
}

export function trackedTimeout(fn: () => void, ms: number): { clear: () => void } {
  const release = acquire("timers");
  let cleared = false;
  const id = window.setTimeout(() => {
    if (cleared) return;
    cleared = true;
    try {
      fn();
    } finally {
      release();
    }
  }, ms);

  const clear = () => {
    if (cleared) return;
    cleared = true;
    window.clearTimeout(id);
    release();
  };
  return { clear };
}
