/** Severity of a toast — drives its colour + icon in the host. */
export type ToastTone = 'success' | 'error' | 'info';

/** A single toast message request. */
export interface ToastMessage {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title?: string;
  readonly message: string;
  /** Auto-dismiss after this many ms (host default when omitted). */
  readonly durationMs?: number;
}

export type ToastInput = Omit<ToastMessage, 'id'>;
type Listener = (toast: ToastMessage) => void;

/**
 * A tiny module-level event bus so non-React code (the API error helpers in `errorAlert.ts`, called
 * from `useAsyncAction`) can raise a toast without threading a React context through every call
 * site. The {@link ToastProvider} subscribes on mount and renders the queue; if no provider is
 * mounted, `emit` is a harmless no-op (nothing listening). ponytail: a single global bus — fine for
 * one host; if two hosts ever mount, both would render the toast.
 */
const listeners = new Set<Listener>();
let nextId = 1;

/** Subscribe to toast emissions. Returns an unsubscribe fn. */
export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Raise a toast. No-ops cleanly when no host is mounted. */
export function emitToast(input: ToastInput): void {
  const toast: ToastMessage = { id: nextId++, ...input };
  for (const l of listeners) {
    l(toast);
  }
}
