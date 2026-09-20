import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "pmp_access_token";
const REFRESH_KEY = "pmp_refresh_token";
const USER_KEY = "pmp_cached_user";
const BIOMETRIC_ENABLED_KEY = "pmp_biometric_enabled";

export const Storage = {
  async getAccessToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return await AsyncStorage.getItem(TOKEN_KEY);
    }
  },

  async setTokens(accessToken: string, refreshToken?: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      if (refreshToken) {
        await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
      }
    } catch {
      await AsyncStorage.setItem(TOKEN_KEY, accessToken);
      if (refreshToken) {
        await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
      }
    }
  },

  async clearTokens(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    } catch {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(REFRESH_KEY);
    }
  },

  async getCachedUser(): Promise<any | null> {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  async setCachedUser(user: any): Promise<void> {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  async clearCachedUser(): Promise<void> {
    await AsyncStorage.removeItem(USER_KEY);
  },

  async isBiometricEnabled(): Promise<boolean> {
    const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return val === "true";
  },

  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
  },
};
