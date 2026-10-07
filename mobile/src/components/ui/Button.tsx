import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { AppText } from './Text';
import { colors, radius, spacing, touch } from '@/theme';

type Variant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'danger'
  | 'dangerOutline'
  | 'ghost';

/**
 * Primary / secondary / danger action button (spec §8, §9).
 *
 * - full-width at the bottom of forms (primary)
 * - min 48px tap target, generous padding
 * - `loading` swaps the label for a spinner without changing size
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel || label}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.textOnPrimary : colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <AppText variant="button" style={[styles.label, styles[`${variant}Label`]]}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.buttonHeight,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { textAlign: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.5 },

  primary: { backgroundColor: colors.primary },
  primaryLabel: { color: colors.textOnPrimary },

  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondaryLabel: { color: colors.primary },

  accent: { backgroundColor: colors.accent },
  accentLabel: { color: colors.textPrimary },

  danger: { backgroundColor: colors.danger },
  dangerLabel: { color: colors.textOnPrimary },

  /** Outlined destructive action (Log out on staff/manager footers). */
  dangerOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  dangerOutlineLabel: { color: colors.danger },

  ghost: { backgroundColor: 'transparent' },
  ghostLabel: { color: colors.primary },
});
