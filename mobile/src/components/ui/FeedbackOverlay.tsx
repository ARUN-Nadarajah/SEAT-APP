import { useEffect, useState } from 'react';
import { Animated, Modal, StyleSheet, View } from 'react-native';

import { AppText } from './Text';
import { Button } from './Button';
import { toastColors, useFeedback } from './Feedback';
import { colors, radius, shadow, spacing } from '@/theme';

/**
 * Renders the toast + confirmation dialog owned by `FeedbackProvider`.
 * Mount once, near the root of the app.
 */
export function FeedbackOverlay() {
  const { toast, hideToast, dialog, resolveDialog } = useFeedback();
  // Lazy state keeps the animated value out of render (React compiler rule).
  const [slide] = useState(() => new Animated.Value(-90));

  useEffect(() => {
    if (!toast) return;

    slide.setValue(-90);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 16 }).start();

    const timer = setTimeout(hideToast, 3200);
    return () => clearTimeout(timer);
  }, [toast, hideToast, slide]);

  return (
    <>
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            { borderLeftColor: toastColors[toast.variant] },
            { transform: [{ translateY: slide }] },
          ]}
          accessibilityRole="alert"
        >
          <AppText variant="label" style={styles.toastText}>
            {toast.message}
          </AppText>
        </Animated.View>
      ) : null}

      <Modal
        visible={Boolean(dialog)}
        transparent
        animationType="fade"
        onRequestClose={() => resolveDialog(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <AppText variant="heading">{dialog?.title}</AppText>
            <AppText variant="secondary" style={styles.dialogMessage}>
              {dialog?.message}
            </AppText>

            <View style={styles.dialogActions}>
              <Button
                label={dialog?.cancelLabel || 'Keep it'}
                variant="secondary"
                onPress={() => resolveDialog(false)}
                accessibilityLabel={dialog?.cancelLabel || 'Keep it'}
              />
              <Button
                label={dialog?.confirmLabel || 'Yes, continue'}
                variant={dialog?.destructive ? 'danger' : 'primary'}
                onPress={() => resolveDialog(true)}
                accessibilityLabel={dialog?.confirmLabel || 'Yes, continue'}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 56,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.raised,
    zIndex: 1000,
  },
  toastText: { color: colors.textPrimary },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    gap: spacing.md,
    ...shadow.raised,
  },
  dialogMessage: { marginBottom: spacing.xs },
  dialogActions: { gap: spacing.sm, marginTop: spacing.sm },
});
