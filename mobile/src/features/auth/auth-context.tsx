import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getPendingResetEmail,
  hydrateAuth,
  logout as logoutAuth,
  requestPasswordResetOtp as requestPasswordResetOtpApi,
  requestRegisterOtp as requestRegisterOtpApi,
  verifyPasswordResetOtp as verifyPasswordResetOtpApi,
  verifyRegisterOtp as verifyRegisterOtpApi,
  loginWithPassword as loginWithPasswordApi,
} from "./auth-service";
import type { AuthSession, AuthUser } from "./types";

type AuthFeedback = {
  type: "success" | "warning";
  message: string;
} | null;

type AuthContextValue = {
  user: AuthUser | null;
  session: AuthSession | null;
  isHydrating: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  feedback: AuthFeedback;
  pendingResetEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  requestRegisterOtp: (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<void>;
  verifyRegisterOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordResetOtp: (email: string) => Promise<void>;
  verifyPasswordResetOtp: (
    email: string,
    otp: string,
    newPassword: string,
  ) => Promise<void>;
  clearFeedback: () => void;
  refreshPendingResetEmail: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback>(null);
  const [pendingResetEmail, setPendingResetEmail] = useState<string | null>(
    null,
  );

  async function refreshPendingResetEmail() {
    setPendingResetEmail(await getPendingResetEmail());
  }

  useEffect(() => {
    let isMounted = true;

    hydrateAuth()
      .then(({ session: hydratedSession, user: hydratedUser }) => {
        if (!isMounted) {
          return;
        }

        setSession(hydratedSession);
        setUser(hydratedUser);
      })
      .finally(() => {
        if (isMounted) {
          setIsHydrating(false);
        }
      });

    refreshPendingResetEmail().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  async function runAction(
    action: () => Promise<{
      user: AuthUser | null;
      session: AuthSession | null;
      notice: NonNullable<AuthFeedback>;
    }>,
  ) {
    setIsLoading(true);

    try {
      const result = await action();
      setUser(result.user);
      setSession(result.session);
      setFeedback(result.notice);
      await refreshPendingResetEmail();
    } finally {
      setIsLoading(false);
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isHydrating,
      isLoading,
      isAuthenticated: Boolean(session && user),
      feedback,
      pendingResetEmail,
      login: async (email, password) => {
        await runAction(() => loginWithPasswordApi(email, password));
      },
      requestRegisterOtp: async (input) => {
        setIsLoading(true);
        try {
          const response = await requestRegisterOtpApi(input);
          setFeedback({ type: "success", message: response.message });
        } finally {
          setIsLoading(false);
        }
      },
      verifyRegisterOtp: async (email, otp) => {
        await runAction(() => verifyRegisterOtpApi(email, otp));
      },
      logout: async () => {
        setIsLoading(true);
        try {
          await logoutAuth();
          setUser(null);
          setSession(null);
          setFeedback({
            type: "success",
            message: "You have been signed out.",
          });
          await refreshPendingResetEmail();
        } finally {
          setIsLoading(false);
        }
      },
      requestPasswordResetOtp: async (email) => {
        setIsLoading(true);
        try {
          const response = await requestPasswordResetOtpApi(email);
          setFeedback({ type: "warning", message: response.message });
          await refreshPendingResetEmail();
        } finally {
          setIsLoading(false);
        }
      },
      verifyPasswordResetOtp: async (email, otp, newPassword) => {
        await runAction(() =>
          verifyPasswordResetOtpApi(email, otp, newPassword),
        );
      },
      clearFeedback: () => setFeedback(null),
      refreshPendingResetEmail,
    }),
    [feedback, isHydrating, isLoading, pendingResetEmail, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
