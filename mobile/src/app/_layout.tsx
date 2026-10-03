import { useFonts, Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FeedbackOverlay, FeedbackProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/auth-context';
import { colors } from '@/theme';

/**
 * Root layout — fonts, global providers and the top-level stack (spec §1, §8).
 *
 * Providers are ordered outermost-first:
 *   QueryClient → Auth → Feedback (toasts/dialogs) → navigation
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnReconnect: true,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FeedbackProvider>
            <StatusBar style="dark" />
            {/*
              Every route below is declared by its file under src/app — the
              Stack registers them automatically, so only group boundaries are
              listed explicitly. (Naming a folder that has no _layout.tsx would
              produce "No route named …" warnings.)
            */}
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
            <FeedbackOverlay />
          </FeedbackProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
