import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './Text';
import { colors, spacing } from '@/theme';

/**
 * Screen chrome (spec §9: consistent navigation, clear titles/back buttons).
 *
 * Every screen uses this so headers, spacing and scroll behaviour match.
 */
export function Screen({
  children,
  title,
  subtitle,
  onBack,
  right,
  scroll = true,
  refreshing,
  onRefresh,
  footer,
  edges = ['top'],
  backgroundColor = colors.background,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  backgroundColor?: string;
}) {
  const header =
    title || onBack || right ? (
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <AppText style={styles.backGlyph}>‹</AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.headerCenter}>
          {title ? (
            <AppText variant="heading" numberOfLines={1} style={styles.title}>
              {title}
            </AppText>
          ) : null}
          {subtitle ? (
            <AppText variant="caption" style={styles.subtitle}>
              {subtitle}
            </AppText>
          ) : null}
        </View>

        <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.flex]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor }]} edges={edges}>
      {header}
      {body}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** Full-width primary action docked to the bottom of forms (spec §8). */
export function ScreenFooter({ children }: { children: ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <Centered>
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText variant="secondary" style={styles.loadingLabel}>
        {label}
      </AppText>
    </Centered>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerSide: { width: 56, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backGlyph: { fontSize: 28, lineHeight: 30, color: colors.textPrimary, marginTop: -4 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 2 },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing['2xl'],
  },
  loadingLabel: { marginTop: spacing.sm },
});
