import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0d9488",
        tabBarInactiveTintColor: "#78716c",
        headerStyle: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e7e5e4" },
        headerTitleStyle: { fontWeight: "600", color: "#1c1917" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "NEPSE Research",
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: "Screener",
          tabBarLabel: "Screener",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
