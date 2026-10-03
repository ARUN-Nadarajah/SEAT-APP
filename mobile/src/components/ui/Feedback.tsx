import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { colors } from '@/theme';

/**
 * Toast/snackbar feedback (spec §10) + confirmation dialogs (NFR/error prevention).
 *
 * `showToast` is the single feedback channel for mutations, so every screen
 * reports success and failure the same way.
 */

type ToastVariant = 'success' | 'error' | 'info';

type ToastState = {
  message: string;
  variant: ToastVariant;
  id: number;
};

type FeedbackContextValue = {
  toast: ToastState | null;
  showToast: (message: string, variant?: ToastVariant) => void;
  hideToast: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ConfirmOptions | null;
  resolveDialog: (accepted: boolean) => void;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((accepted: boolean) => void) | null>(null);

  function showToast(message: string, variant: ToastVariant = 'info') {
    setToast({ message, variant, id: Date.now() });
  }

  function hideToast() {
    setToast(null);
  }

  /** Resolves `true` when the user confirms, `false` when they back out. */
  function confirm(options: ConfirmOptions) {
    setDialog(options);
    return new Promise<boolean>((resolve) => setResolver(() => resolve));
  }

  function resolveDialog(accepted: boolean) {
    resolver?.(accepted);
    setResolver(null);
    setDialog(null);
  }

  const value = useMemo<FeedbackContextValue>(
    () => ({ toast, showToast, hideToast, confirm, dialog, resolveDialog }),
    [toast, dialog, resolver],
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within FeedbackProvider.');
  }
  return context;
}

/** Accessible colour per variant (spec §9: never colour alone — we pair with text). */
export const toastColors: Record<ToastVariant, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.primary,
};
