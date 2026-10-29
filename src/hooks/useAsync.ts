import { useCallback, useEffect, useRef, useState } from 'react';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { showErrorAlert } from '@/utils/errorAlert';

/** The lifecycle of an async read, exposed to a screen so it can render the right state. */
export interface AsyncState<T> {
  readonly data: T | null;
  readonly loading: boolean;
  /** Normalized, screen-ready error view (banner message + field map), or null. */
  readonly error: FormErrorView | null;
  /** Re-run the loader (e.g. pull-to-refresh / retry button). */
  readonly reload: () => void;
}

/**
 * Run an async loader and track loading/data/error for a data screen (Req 65.6 — every data screen
 * gets explicit loading/empty/error states). The loader receives an {@link AbortSignal} so an
 * in-flight request is cancelled when inputs change or the screen unmounts (no setState-after-unmount
 * and no race between stale/fresh responses). `deps` re-run the loader like `useEffect`. Errors are
 * normalized through {@link toFormError} so nothing internal leaks to the UI (security first).
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [nonce, setNonce] = useState(0);
  // Keep the latest loader without making it a dependency (callers pass inline closures).
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (active && !controller.signal.aborted) {
          setError(toFormError(err));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** The lifecycle of a one-shot async action (approve, save, …) a screen triggers from a handler. */
export interface AsyncAction<Args extends unknown[]> {
  readonly run: (...args: Args) => Promise<boolean>;
  readonly running: boolean;
  readonly error: FormErrorView | null;
  /** Clear the current error (e.g. before retrying). */
  readonly reset: () => void;
}

/** Options for {@link useAsyncAction}. */
export interface AsyncActionOptions {
  /**
   * Show a friendly native error popup on failure (default true). The inline `error` banner is also
   * set, so a screen can render both or just the popup. Set false to suppress the popup (e.g. a
   * screen that only wants the banner).
   */
  alertOnError?: boolean;
}

/**
 * Wrap a mutating action (verify/reject/save preferences) with running + error state so a screen
 * can disable its button and surface a friendly error — both an inline banner (`error`) and, by
 * default, a native popup. The user only ever sees a plain, code-mapped message (never raw server
 * text). {@link run} resolves `true` on success and `false` on failure, so a caller can
 * `if (await run()) { refresh() }`.
 */
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
  options: AsyncActionOptions = {},
): AsyncAction<Args> {
  const { alertOnError = true } = options;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<boolean> => {
      setRunning(true);
      setError(null);
      try {
        await action(...args);
        return true;
      } catch (err) {
        if (mounted.current) {
          setError(toFormError(err));
        }
        if (alertOnError) {
          showErrorAlert(err);
        }
        return false;
      } finally {
        if (mounted.current) {
          setRunning(false);
        }
      }
    },
    [action, alertOnError],
  );

  const reset = useCallback(() => setError(null), []);
  return { run, running, error, reset };
}
