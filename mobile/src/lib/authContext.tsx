import React, { createContext, useContext, useEffect, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Api } from "./api";
import { Storage } from "./storage";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isBiometricAvailable: boolean;
  login: (identifier: string, pass: string) => Promise<void>;
  loginWithBiometrics: () => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  useEffect(() => {
    checkInitialState();
  }, []);

  async function checkInitialState() {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricAvailable(hasHardware && isEnrolled);

      const cachedUser = await Storage.getCachedUser();
      if (cachedUser) {
        setUser(cachedUser);
      }

      const token = await Storage.getAccessToken();
      if (token) {
        try {
          const fresh = await Api.getMe();
          setUser(fresh);
          await Storage.setCachedUser(fresh);
          registerForPushNotifications();
        } catch {
          // Token expired or server unreachable
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function registerForPushNotifications() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      const tokenData = await Notifications.getDevicePushTokenAsync();
      if (tokenData?.data) {
        await Api.registerDevice(
          tokenData.data,
          Platform.OS === "ios" ? "ios" : "android"
        );
      }
    } catch {
      // Non-blocking push registration failure
    }
  }

  async function login(identifier: string, pass: string) {
    const res = await Api.login(identifier, pass);
    await Storage.setTokens(res.access_token, res.refresh_token);
    setUser(res.user);
    await Storage.setCachedUser(res.user);
    await Storage.setBiometricEnabled(true);
    registerForPushNotifications();
  }

  async function loginWithBiometrics(): Promise<boolean> {
    if (!isBiometricAvailable) return false;
    const token = await Storage.getAccessToken();
    if (!token) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Sign in to Project Management Platform",
      cancelLabel: "Cancel",
      fallbackLabel: "Use Password",
    });

    if (result.success) {
      try {
        const fresh = await Api.getMe();
        setUser(fresh);
        await Storage.setCachedUser(fresh);
        registerForPushNotifications();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function logout() {
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync().catch(() => null);
      if (tokenData?.data) {
        await Api.unregisterDevice(tokenData.data).catch(() => null);
      }
    } catch {
      // Ignore cleanup error
    }
    await Storage.clearTokens();
    await Storage.clearCachedUser();
    setUser(null);
  }

  async function refreshUser() {
    if (!user) return;
    try {
      const fresh = await Api.getMe();
      setUser(fresh);
      await Storage.setCachedUser(fresh);
    } catch {
      // Ignored
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isBiometricAvailable,
        login,
        loginWithBiometrics,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
