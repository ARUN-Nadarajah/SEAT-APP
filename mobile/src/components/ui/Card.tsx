import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from './Text';
import { colors, radius, shadow, spacing } from '@/theme';

/** White rounded card (radius 16–20, spec §8). */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
  );
}

/** Section heading in the serif face. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionRow}>
      <AppText variant="heading">{children}</AppText>
      {action}
    </View>
  );
}

/**
 * Pill chip used for Explore filters ("All places", "Sri Lankan", "Tonight")
 * and venue metadata ("Open until 10:00 PM", "Parking available").
 */
export function Chip({
  label,
  selected = false,
  onPress,
  tone = 'neutral',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected, chipTones[tone]]}
    >
      <AppText
        style={[styles.chipLabel, selected && styles.chipLabelSelected]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/** Small status pill — available / limited / fully booked, etc. */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  return (
    <View style={[styles.badge, badgeTones[tone]]}>
      <AppText style={[styles.badgeLabel, badgeLabelTones[tone]]}>{label}</AppText>
    </View>
  );
}

/** Soft info box — helper copy such as "What is a virtual queue?". */
export function InfoBox({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'danger';
}) {
  return <View style={[styles.infoBox, infoTones[tone]]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  padded: { padding: spacing.lg },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  chipLabelSelected: { color: colors.textOnPrimary },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  badgeLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  infoBox: {
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
});

const chipTones = StyleSheet.create({
  neutral: {},
  success: { backgroundColor: colors.infoBox, borderColor: colors.success },
  warning: { backgroundColor: colors.warningBox, borderColor: colors.warning },
  danger: { backgroundColor: '#FBE9E7', borderColor: colors.danger },
  info: { backgroundColor: colors.infoBox, borderColor: colors.primaryMuted },
});

const badgeTones = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  success: { backgroundColor: colors.infoBox },
  warning: { backgroundColor: colors.warningBox },
  danger: { backgroundColor: '#FBE9E7' },
  accent: { backgroundColor: colors.accent },
});

const badgeLabelTones = StyleSheet.create({
  neutral: { color: colors.textSecondary },
  success: { color: colors.success },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
  accent: { color: colors.textPrimary },
});

const infoTones = StyleSheet.create({
  info: { backgroundColor: colors.infoBox },
  warning: { backgroundColor: colors.warningBox },
  success: { backgroundColor: colors.infoBox },
  danger: { backgroundColor: '#FBE9E7' },
});
