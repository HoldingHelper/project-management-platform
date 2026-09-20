import React from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import {
  Bell,
  BookOpenText,
  CheckSquare,
  LayoutDashboard,
  MessageSquare,
  User,
} from "lucide-react-native";
import { colors } from "@/theme/colors";

export default function AppTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="(home)/index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(tasks)/index"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => (
            <CheckSquare size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(docs)/index"
        options={{
          title: "Docs",
          tabBarIcon: ({ color, size }) => (
            <BookOpenText size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(chat)/index"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifs",
          tabBarIcon: ({ color, size }) => (
            <Bell size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <User size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
