import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';
import { colors } from '@/theme';

/** Manager group (spec §2 / FR10) — manager role only. */
export default function ManagerLayout() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (user?.role !== 'manager') {
    return <Redirect href={(user?.role === 'staff' ? '/(staff)' : '/(tabs)/explore') as never} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
