import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';
import { colors } from '@/theme';

/**
 * Staff group (spec §2 / §5): only `staff` and `manager` roles reach here.
 * The API enforces the same rule server-side (RBAC middleware).
 */
export default function StaffLayout() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (user?.role === 'customer') return <Redirect href="/(tabs)/explore" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="notified" />
    </Stack>
  );
}
