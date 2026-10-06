import { router } from 'expo-router';
import { useState } from 'react';

import { useFeedback } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { disconnectSocket } from '@/services/realtime/socket';

/**
 * Shared sign-out flow used by the customer Profile, staff dashboard and
 * manager view, so every role logs out exactly the same way (spec §5):
 *
 *   1. confirm with the user ("Log out of SEAT?"),
 *   2. clear the stored tokens + user state (the auth module owns storage),
 *   3. disconnect the Socket.IO connection,
 *   4. return to the Login screen.
 */
export function useLogout() {
  const { logout, isLoading: authLoading } = useAuth();
  const { confirm, showToast } = useFeedback();
  const [loggingOut, setLoggingOut] = useState(false);

  async function confirmLogout(): Promise<boolean> {
    if (loggingOut || authLoading) return false;

    const accepted = await confirm({
      title: 'Log out of SEAT?',
      message:
        'You will need to sign in again to see your bookings and your place in line.',
      confirmLabel: 'Log out',
      cancelLabel: 'Stay signed in',
      destructive: true,
    });
    if (!accepted) return false;

    setLoggingOut(true);
    try {
      await logout();
      disconnectSocket();
      router.replace('/(auth)/login');
      return true;
    } catch {
      showToast('We could not log you out. Please try again.', 'error');
      return false;
    } finally {
      setLoggingOut(false);
    }
  }

  return { confirmLogout, loggingOut: loggingOut || authLoading };
}
