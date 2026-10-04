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
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          minWidth: 0,
        },
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={19} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Items',
          tabBarIcon: ({ color }) => <IconSymbol size={19} name="cube.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: 'Sales',
          tabBarIcon: ({ color }) => <IconSymbol size={19} name="dollarsign.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Stock',
          tabBarIcon: ({ color }) => <IconSymbol size={19} name="shippingbox.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <IconSymbol size={19} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: 'Purchases',
          href: null,
        }}
      />
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
