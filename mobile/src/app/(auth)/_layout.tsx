import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth/auth-context";

export default function AuthLayout() {
  const { isHydrating, isAuthenticated } = useAuth();

  if (isHydrating) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href={"/home" as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
