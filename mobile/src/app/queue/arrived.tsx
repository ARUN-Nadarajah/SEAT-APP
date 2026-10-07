import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function PickupCompleteScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <View style={styles.badge}><Ionicons name="checkmark" size={48} color={colors.textPrimary} /></View>
        <AppText variant="display" style={styles.title}>Thanks! Enjoy your meal.</AppText>
        <AppText variant="secondary" style={styles.subtitle}>Your takeaway order has been collected.</AppText>
        <Button label="Back to queue" onPress={() => router.replace('/(tabs)/queue')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'], gap: spacing.lg },
  badge: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center' },
});
