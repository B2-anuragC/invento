import { PermissionsProvider } from '@/services/permissions';
import { CameraRecoveryNotice } from "@/components/camera-photo";
import { DefaultTheme, ThemeProvider, Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { OfflineSyncStatus } from "@/components/offline-sync-status";
import { appSession, loadSession } from "@/services/api";
import { requiresSignIn } from "@/services/session-loader";
import { pageTitle } from "@/services/page-title";
import { useEffect, useState } from "react";
import "react-native-reanimated";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  // Screens read the session synchronously, so restore it before any route
  // renders. Without this a refreshed deep link starts signed out.
  const [sessionReady, setSessionReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    void loadSession().finally(() => setSessionReady(true));
  }, []);
  useEffect(() => {
    // Opened while signed out: send protected deep links to sign in.
    if (sessionReady && !appSession.current && requiresSignIn(pathname)) router.replace("/auth/login");
  }, [sessionReady, pathname, router]);
  useEffect(() => {
    // Name the browser tab after the open page.
    if (Platform.OS === "web" && typeof document !== "undefined") document.title = pageTitle(pathname);
  }, [pathname]);
  if (!sessionReady) return null;

  return (
    <PermissionsProvider><ThemeProvider value={DefaultTheme}>
      {/* The root owns top/side system insets once, including global notices. */}
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      >
        <View style={{ flex: 1, minHeight: 0 }}>
          <OfflineSyncStatus />
          <CameraRecoveryNotice />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#F5F5F5" },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/login" options={{ headerShown: false }} />
            <Stack.Screen
              name="auth/register"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="business/setup"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="sale/[id]"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="sale/quick"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="sale/create"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="purchase/[id]"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="purchase/create"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="product/[id]"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="inventory/adjust"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="people/[kind]/[id]"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="settings/sync"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="guest/account"
              options={{ headerShown: false, animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="modal"
              options={{ presentation: "modal", title: "Modal" }}
            />
          </Stack>
        </View>
      </SafeAreaView>
      <StatusBar style="dark" />
    </ThemeProvider></PermissionsProvider>
  );
}
