import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, useFeedback } from '@/components/ui';
import { apiErrorMessage, createOrder, type CreateOrderInput, type MenuItem } from '@/services/api';
import { EXPLORE_RESTAURANT_ID } from '@/services/restaurant-config';
import { colors, radius, spacing } from '@/theme';

type CartLine = MenuItem & { quantity: number; note?: string };

export default function ReviewOrderScreen() {
  const params = useLocalSearchParams<{ restaurantId: string; orderType: string; reservationId?: string; tableId?: string; cart: string }>();
  const { showToast } = useFeedback();
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  let items: CartLine[] = [];
  try { items = JSON.parse(params.cart || '[]') as CartLine[]; } catch { items = []; }
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  async function place() {
    setPlacing(true);
    try {
      const input: CreateOrderInput = {
        restaurantId: params.restaurantId || EXPLORE_RESTAURANT_ID,
        orderType: params.orderType === 'dine-in' ? 'dine-in' : 'takeaway',
        reservationId: params.reservationId,
        tableId: params.tableId,
        notes,
        items: items.map((item) => ({
          menuItemId: item.menuItemId ?? item.id ?? item.name,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          note: item.note,
        })),
      };
      const result = await createOrder(input);
      showToast('Order placed successfully.', 'success');
      const orderId = result.data?.order.id;
      if (!orderId) throw new Error('The order was created but no order ID was returned.');
      if (input.orderType === 'takeaway') {
        router.replace('/(tabs)/queue');
      } else {
        router.replace({ pathname: '/orders/[id]', params: { id: orderId } });
      }
    } catch (error) { showToast(apiErrorMessage(error), 'error'); }
    finally { setPlacing(false); }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">Review order</AppText>
        {items.map((item) => (
          <Card key={item.menuItemId ?? item.id ?? item.name}>
            <View style={styles.row}><AppText variant="label">{item.quantity} × {item.name}</AppText><AppText variant="label">LKR {(item.price * item.quantity).toLocaleString()}</AppText></View>
            {item.note ? <AppText variant="caption">{item.note}</AppText> : null}
          </Card>
        ))}
        <TextInput value={notes} onChangeText={setNotes} placeholder="Notes for the kitchen (optional)" multiline style={styles.notes} placeholderTextColor={colors.textMuted} />
        <Card><View style={styles.row}><AppText variant="heading">Total</AppText><AppText variant="heading">LKR {total.toLocaleString()}</AppText></View></Card>
        <Button label={params.orderType === 'dine-in' ? 'Place order' : 'Place order & join queue'} onPress={place} loading={placing} disabled={!items.length} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  notes: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, color: colors.textPrimary, textAlignVertical: 'top' },
});
