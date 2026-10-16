import { CameraRecoveryNotice } from '@/components/camera-photo';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { OfflineSyncStatus } from '@/components/offline-sync-status';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
      <OfflineSyncStatus />
      <CameraRecoveryNotice />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/register" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="business/setup" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="sale/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="sale/quick" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="sale/create" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="purchase/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="purchase/create" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="people/[kind]/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/sync" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      </View>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
