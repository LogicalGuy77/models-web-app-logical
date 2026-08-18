export type SseWatchEventType =
  | 'INITIAL'
  | 'ADDED'
  | 'MODIFIED'
  | 'DELETED'
  | 'ERROR'
  | 'UPDATE';

export interface SseWatchEvent {
  type: SseWatchEventType;
  object?: unknown;
  items?: unknown[];
  message?: string;
}

export interface SseMockOptions {
  inferenceServices?: unknown[];
  byNamespace?: Record<string, unknown[]>;
}

export class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = FakeEventSource.OPEN;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public url: string, win: Window) {
    const sources = getSseSources(win);
    sources.push(this);

    win.setTimeout(() => {
      if (this.readyState === FakeEventSource.CLOSED) {
        return;
      }

      this.onopen?.(new Event('open'));

      if (isInferenceServiceListWatch(this.url)) {
        const namespace = parseListWatchNamespace(this.url);
        this.emit({
          type: 'INITIAL',
          items: getListItems(namespace),
        });
        return;
      }

      const detail = parseDetailWatch(this.url);
      if (detail) {
        const object = findService(detail.namespace, detail.name);
        if (object) {
          this.emit({
            type: 'INITIAL',
            object,
          });
        }
      }
    }, 0);
  }

  emit(event: SseWatchEvent) {
    if (!this.onmessage || this.readyState === FakeEventSource.CLOSED) {
      return;
    }

    this.onmessage(
      new MessageEvent('message', {
        data: JSON.stringify(event),
      }),
    );
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return false;
  }
}

export interface CypressSseWindow extends Window {
  EventSource: typeof FakeEventSource;
  __cypressSseSources: FakeEventSource[];
}

let sseMockOptions: SseMockOptions = { inferenceServices: [] };

export function resetSseMock() {
  sseMockOptions = { inferenceServices: [] };
}

export function setSseMockOptions(options: SseMockOptions = {}) {
  sseMockOptions = {
    inferenceServices: options.inferenceServices ?? [],
    byNamespace: options.byNamespace,
  };
}

export function installSseMock(win: Window) {
  const sseWindow = win as CypressSseWindow;
  sseWindow.__cypressSseSources = [];

  class WindowEventSource extends FakeEventSource {
    constructor(url: string) {
      super(url, win);
    }
  }

  sseWindow.EventSource = WindowEventSource;
}

export function emitSseOnWindow(
  win: Window,
  event: SseWatchEvent,
  urlIncludes?: string,
): number {
  const openSources = getSseSources(win).filter(
    source => source.readyState === FakeEventSource.OPEN,
  );
  const targets = urlIncludes
    ? openSources.filter(source => source.url.includes(urlIncludes))
    : openSources.filter(source => isInferenceServiceListWatch(source.url));

  targets.forEach(source => source.emit(event));
  return targets.length;
}

function getSseSources(win: Window): FakeEventSource[] {
  const sseWindow = win as CypressSseWindow;
  if (!sseWindow.__cypressSseSources) {
    sseWindow.__cypressSseSources = [];
  }
  return sseWindow.__cypressSseSources;
}

function isInferenceServiceListWatch(url: string): boolean {
  return /\/namespaces\/[^/]+\/inferenceservices\/?$/.test(url);
}

function parseListWatchNamespace(url: string): string | undefined {
  const match = url.match(/\/namespaces\/([^/]+)\/inferenceservices\/?$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function parseDetailWatch(
  url: string,
): { namespace: string; name: string } | null {
  const match = url.match(
    /\/namespaces\/([^/]+)\/inferenceservices\/([^/?]+)\/?$/,
  );
  if (!match) {
    return null;
  }

  return {
    namespace: decodeURIComponent(match[1]),
    name: decodeURIComponent(match[2]),
  };
}

function getListItems(namespace?: string): unknown[] {
  if (namespace && sseMockOptions.byNamespace?.[namespace]) {
    return sseMockOptions.byNamespace[namespace];
  }

  return sseMockOptions.inferenceServices ?? [];
}

function findService(namespace: string, name: string): unknown | undefined {
  const items = getListItems(namespace);
  return items.find(item => {
    const metadata = (item as { metadata?: { name?: string } }).metadata;
    return metadata?.name === name;
  });
}
