import { toFormError } from '@/utils/formError';
import { emitToast } from '@/utils/toastBus';

/**
 * Show a user-friendly error toast for any thrown error. Routes the error through
 * {@link toFormError} so the user only ever sees a plain, code-mapped sentence — never the raw
 * server/internal message (security first). If the error is purely field-level validation (no
 * banner message), the first field reason is shown so the toast is never empty.
 *
 * Emits onto the module toast bus (rendered by {@link ToastProvider}); if no provider is mounted the
 * call is a harmless no-op. Replaces the old native `Alert` dialog with an in-app toast — the
 * function name/signature is unchanged so every existing call site keeps working.
 */
export function showErrorAlert(err: unknown, title = 'Something went wrong'): void {
  const view = toFormError(err);
  const message =
    view.message ||
    firstFieldReason(view.fieldErrors) ||
    'Please check your input and try again.';
  emitToast({ tone: 'error', title, message });
}

/** Show a friendly success toast (e.g. after a save). */
export function showSuccessAlert(message: string, title = 'Done'): void {
  emitToast({ tone: 'success', title, message });
}

/** Show a neutral info toast. */
export function showInfoAlert(message: string, title?: string): void {
  emitToast({ tone: 'info', message, ...(title ? { title } : {}) });
}

function firstFieldReason(fieldErrors: Readonly<Record<string, string>>): string | undefined {
  const keys = Object.keys(fieldErrors);
  return keys.length > 0 ? fieldErrors[keys[0] as string] : undefined;
}
