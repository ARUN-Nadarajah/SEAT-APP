import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth/auth-context";
import { homePathForRole } from "../index";

export default function AuthLayout() {
  const { isHydrating, isAuthenticated, user } = useAuth();

  if (isHydrating) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href={(homePathForRole(user?.role) || "/") as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
