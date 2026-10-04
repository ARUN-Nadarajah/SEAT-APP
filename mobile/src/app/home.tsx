import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';
import { homePathForRole } from './index';

export default function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href={homePathForRole(user?.role) as never} />;
}
