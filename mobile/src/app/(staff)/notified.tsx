import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** "Guest notified" confirmation (spec §5 staff flow). */
export default function GuestNotifiedScreen() {
  const { queueCode, tableNumber, guestName, partySize } = useLocalSearchParams<{
    queueCode?: string;
    tableNumber?: string;
    guestName?: string;
    partySize?: string;
  }>();

  // Hold the table for 10 minutes from when the guest was told (FR06 policy).
  // Computed once in a lazy state initializer so render stays pure.
  const [deadline] = useState(() =>
    new Date(Date.now() + 10 * 60000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="paper-plane" size={40} color={colors.textPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          The good news is sent
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          {guestName ? `${guestName} has` : 'The party has'} been notified that
          the table is ready and a push notification was delivered.
        </AppText>

        <Card style={styles.card}>
          <View style={styles.row}>
            <AppText variant="secondary" style={styles.rowLabel}>
              Table
            </AppText>
            <AppText variant="heading" style={styles.rowValue}>
              {tableNumber ? `Table ${tableNumber} held` : 'Awaiting a free table'}
            </AppText>
          </View>
          <View style={styles.row}>
            <AppText variant="secondary" style={styles.rowLabel}>
              Queue code
            </AppText>
            <AppText variant="bodyMedium" style={styles.rowValue}>
              {queueCode || '—'}
            </AppText>
          </View>
          <View style={styles.row}>
            <AppText variant="secondary" style={styles.rowLabel}>
              Party
            </AppText>
            <AppText variant="bodyMedium" style={styles.rowValue}>
              {partySize || '—'} guests
            </AppText>
          </View>
          <View style={styles.row}>
            <AppText variant="secondary" style={styles.rowLabel}>
              Check-in
            </AppText>
            <AppText variant="bodyMedium" style={styles.rowValue}>
              Requested by {deadline}
            </AppText>
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            label="Back to dashboard"
            onPress={() => router.replace('/(staff)')}
            testID="back-to-dashboard"
          />
          <Button
            label="Open queue panel"
            variant="secondary"
            onPress={() => router.replace('/(staff)')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    gap: spacing.lg,
  },
  badge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 330 },
  card: { width: '100%', maxWidth: 380, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { width: 92 },
  rowValue: { flex: 1, textAlign: 'right' },
  actions: { width: '100%', maxWidth: 380, gap: spacing.sm, marginTop: spacing.md },
});
