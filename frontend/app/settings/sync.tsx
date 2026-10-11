import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/components/invento-ui';
import { appSession } from '@/services/api';
import { getSyncStatus, offlineCommands, retryOfflineConflict, subscribeSyncStatus, syncOffline } from '@/services/offline-catalog';
import type { OfflineCommand } from '@/services/offline-model';
export default function SyncScreen() {
  const router = useRouter();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [commands, setCommands] = useState<OfflineCommand[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (appSession.current) void offlineCommands(appSession.current).then((records) => { if (active) setCommands(records); }).catch((reason) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [status]);
  return <AppScreen><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.button}><Text>← Back</Text></Pressable>
    <Text style={styles.title}>Device synchronization</Text>
    <Text>{status.online ? 'API available' : 'Working offline'} · {status.pending} pending changes</Text>
    <Text style={styles.meta}>{status.message || 'Catalog, contacts and opening stock save on this device and upload automatically.'}</Text>
    <Text style={styles.meta}>Last downloaded: {status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Not downloaded yet'}</Text>
    <Pressable accessibilityRole="button" disabled={status.syncing} onPress={() => { if (appSession.current) void syncOffline(appSession.current, true); }} style={styles.primary}><Text style={{ color: '#FFFFFF' }}>{status.syncing ? 'Synchronizing…' : 'Sync now'}</Text></Pressable>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    {commands.map((command) => <View key={command.operationId} style={styles.card}>
      <Text style={styles.name}>{String('name' in command.localRecord ? command.localRecord.name : 'Opening stock')} · {command.action}</Text>
      <Text style={styles.meta}>{command.entity} · {command.state === 'conflict' ? 'Needs attention' : 'Waiting to synchronize'}</Text>
      {command.error ? <Text style={styles.meta}>{command.error}</Text> : null}
      {command.state === 'conflict' ? <><Text style={styles.meta}>Your local change is retained. A conflicting revision or duplicate SKU needs reconciliation; retry will not overwrite another device’s change.</Text><Pressable accessibilityRole="button" onPress={() => { if (appSession.current) void retryOfflineConflict(appSession.current, command.operationId); }} style={styles.button}><Text>Retry unchanged request</Text></Pressable></> : null}
    </View>)}
    {!commands.length ? <Text style={styles.meta}>No queued catalog or contact changes.</Text> : null}
  </ScrollView></AppScreen>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 16 }, title: { fontSize: 24, fontWeight: '800', color: '#24332A' }, meta: { color: '#69766E', fontSize: 13, lineHeight: 20 }, button: { minHeight: 44, justifyContent: 'center' }, primary: { backgroundColor: '#176B50', borderRadius: 12, padding: 16, alignItems: 'center' }, card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, gap: 8 }, name: { fontWeight: '700', color: '#24332A' } });
