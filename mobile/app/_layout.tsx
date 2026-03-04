import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#fafaf9" },
          headerTintColor: "#0d9488",
          headerTitleStyle: { fontWeight: "600", color: "#1c1917" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="company/[symbol]"
          options={{
            title: "Company",
            headerBackTitle: "Back",
          }}
        />
      </Stack>
    </>
  );
}
