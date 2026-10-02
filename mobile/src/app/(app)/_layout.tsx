import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth/auth-context";

export default function AppLayout() {
  const { isHydrating, isAuthenticated } = useAuth();

  if (isHydrating) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href={"/login" as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
