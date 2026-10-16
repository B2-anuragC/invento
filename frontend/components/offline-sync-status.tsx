import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { appSession } from '@/services/api';
import { getSyncStatus, setOfflineConnectivity, subscribeSyncStatus, syncOffline } from '@/services/offline-catalog';

export function OfflineSyncStatus() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const run = () => { if (appSession.current?.businessId) void syncOffline(appSession.current); };
    const unsubscribe = NetInfo.addEventListener((network) => {
      const online = network.isConnected !== false && network.isInternetReachable !== false;
      setOfflineConnectivity(online); if (online) run();
    });
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') run(); }, 30000);
    return () => { unsubscribe(); foreground.remove(); clearInterval(timer); };
  }, []);
  // Routine background refreshes must not insert a banner and move every screen down.
  if (Platform.OS === 'web' || !appSession.current?.businessId || (status.online && !status.pending && !status.message)) return null;
  return <View style={styles.banner}><Pressable accessibilityRole="button" onPress={() => router.push('/settings/sync')} style={styles.button}><Text style={styles.text}>{status.syncing ? 'Syncing…' : status.online ? 'Saved on device' : 'Offline'}{status.pending ? ` · ${status.pending} pending` : ''}{status.conflicts ? ` · ${status.conflicts} need attention` : ''} · View sync</Text></Pressable></View>;
}
const styles = StyleSheet.create({ banner: { backgroundColor: '#FFF3DB' }, button: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 }, text: { color: '#6E4D16', fontSize: 12, fontWeight: '600' } });
