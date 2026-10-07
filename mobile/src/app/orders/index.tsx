import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Badge, Button, Card, EmptyState, ErrorState, Skeleton, useFeedback } from '@/components/ui';
import { apiErrorMessage, cancelOrder, fetchOrders } from '@/services/api';
import { useApiQuery } from '@/hooks/useApi';
import { colors, spacing } from '@/theme';

export default function OrdersScreen() {
  const { confirm, showToast } = useFeedback();
  const orders = useApiQuery(['orders', 'mine'], () => fetchOrders());
  async function onCancel(id: string) {
    if (!(await confirm({ title: 'Cancel this order?', message: 'Only placed orders can be cancelled.', confirmLabel: 'Cancel order', cancelLabel: 'Keep order', destructive: true }))) return;
    try { await cancelOrder(id); showToast('Order cancelled.', 'success'); await orders.refetch(); }
    catch (error) { showToast(apiErrorMessage(error), 'error'); }
  }
  if (orders.isLoading) return <SafeAreaView style={styles.root}><View style={styles.content}><Skeleton height={90} /><Skeleton height={90} /></View></SafeAreaView>;
  if (orders.isError) return <SafeAreaView style={styles.root}><ErrorState message={apiErrorMessage(orders.error)} onRetry={() => orders.refetch()} /></SafeAreaView>;
  if (!orders.data?.data?.length) return <SafeAreaView style={styles.root}><EmptyState title="No orders yet" message="Your takeaway and dine-in orders will appear here." glyph="🍽" /></SafeAreaView>;
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}><AppText variant="title">My orders</AppText>{orders.data.data.map((order) => <Pressable key={order.id} onPress={() => router.push(`/orders/${order.id}`)}><Card><View style={styles.row}><View><AppText variant="label">{order.orderCode}</AppText><AppText variant="caption">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</AppText></View><Badge label={order.status} tone={order.status === 'ready' ? 'success' : 'neutral'} /></View><AppText variant="caption">LKR {order.totalAmount.toLocaleString()}</AppText>{order.status === 'placed' ? <Button label="Cancel order" variant="dangerOutline" onPress={() => onCancel(order.id)} /> : null}</Card></Pressable>)}</ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.md }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md } });
