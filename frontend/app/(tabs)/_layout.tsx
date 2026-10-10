import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { appColors } from '@/components/invento-ui';
import { appSession, restoreSession } from '@/services/api';

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = appSession.current ?? await restoreSession();
      if (!active) return;
      if (!session?.accessToken || !session.businessId) {
        appSession.current = session;
        router.replace(session?.accessToken ? '/business/setup' : '/auth/login');
        return;
      }
      appSession.current = session;
      setCheckingSession(false);
    })();

    return () => { active = false; };
  }, [router]);

  if (checkingSession) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={appColors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarButton: Platform.OS === 'web' ? undefined : HapticTab,
        tabBarActiveTintColor: appColors.primary,
        tabBarInactiveTintColor: '#777E7B',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarItemStyle: {
          minWidth: 0,
        },
        tabBarStyle: {
          height: 76 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E2E2',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="square.grid.2x2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Catalog',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="cube.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          href: null,
          title: 'Sales',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="dollarsign.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ color }) => <IconSymbol size={23} name="arrow.left.arrow.right" color={color} /> }} />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          href: null,
          title: 'Purchases',
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="cart.fill" color={color} />,
        }}
      />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
});
