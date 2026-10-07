import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { apiErrorMessage, fetchOrder } from '@/services/api';
import { useApiQuery } from '@/hooks/useApi';
import { onOrderUpdated } from '@/services/realtime/socket';
import { colors, spacing } from '@/theme';

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useApiQuery(['order', id], () => fetchOrder(id!), { enabled: Boolean(id), refetchInterval: 8000 });
  const current = order.data?.data?.order;
  useEffect(() => {
    if (!current?.restaurantId) return;
    return onOrderUpdated(current.restaurantId, () => order.refetch());
  }, [current?.restaurantId, order.refetch]);
  if (order.isLoading) return <SafeAreaView style={styles.root}><View style={styles.content}><Skeleton height={100} /><Skeleton height={180} /></View></SafeAreaView>;
  if (order.isError || !current) return <SafeAreaView style={styles.root}><ErrorState message={apiErrorMessage(order.error)} onRetry={() => order.refetch()} /></SafeAreaView>;
  const stages = current.orderType === 'takeaway' ? ['placed', 'preparing', 'ready', 'collected'] : ['placed', 'preparing', 'ready', 'served'];
  const active = stages.indexOf(current.status);
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">Order tracking</AppText>
        <Card><AppText variant="caption">ORDER CODE</AppText><AppText variant="display">{current.orderCode}</AppText><Badge label={current.orderType === 'takeaway' ? 'Parcel' : `Table ${current.tableNumber ?? ''}`} tone="accent" /></Card>
        <Card>{stages.map((stage, index) => <View key={stage} style={styles.stage}><View style={[styles.dot, index <= active && styles.done]} /><AppText variant={index === active ? 'label' : 'secondary'}>{stage[0].toUpperCase() + stage.slice(1)}</AppText></View>)}</Card>
        {current.orderType === 'takeaway' ? <Button label="View takeaway queue" onPress={() => router.replace('/(tabs)/queue')} /> : <Button label="Back to booking" variant="secondary" onPress={() => router.back()} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  stage: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong },
  done: { backgroundColor: colors.accent, borderColor: colors.accent },
});
