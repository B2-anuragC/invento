import { LOCAL_ONLY } from '@/services/runtime-mode';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen, ConfirmationDialog } from '@/components/invento-ui';
import { appSession, getApiServerUrl } from '@/services/api';
import { getSyncStatus, prepareOfflineTransactionReview, applyOfflineTransactionReview, offlineCommands, retryOfflineConflict, subscribeSyncStatus, syncOffline } from '@/services/offline-catalog';
import type { OfflineCommand } from '@/services/offline-model';
export default function SyncScreen() {
  const router = useRouter();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [commands, setCommands] = useState<OfflineCommand[]>([]);
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ operationId: string; data: Awaited<ReturnType<typeof prepareOfflineTransactionReview>> } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (appSession.current) void offlineCommands(appSession.current).then((records) => { if (active) setCommands(records); }).catch((reason) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [status]);
  return <AppScreen><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.button}><Text>← Back</Text></Pressable>
    <Text style={styles.title}>{LOCAL_ONLY ? "Device storage" : "Device synchronization"}</Text>
    <Text selectable style={styles.meta}>{LOCAL_ONLY ? "Local-only mode · All business data stays on this device. No server connection is used." : `API server: ${getApiServerUrl()}`}</Text>
    <Text>{LOCAL_ONLY ? 'Local storage ready' : status.online ? 'API available' : 'Working offline'} · {status.pending} pending changes</Text>
    <Text style={styles.meta}>{LOCAL_ONLY ? 'Changes stay in this app’s private device storage. Nothing is uploaded.' : status.message || 'Catalog, contacts, opening stock, sales and purchases save on this device and upload automatically.'}</Text>
    <Text style={styles.meta}>Last downloaded: {status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Not downloaded yet'}</Text>
    <Pressable accessibilityRole="button" disabled={status.syncing} onPress={() => { if (appSession.current) void syncOffline(appSession.current, true); }} style={styles.primary}><Text style={{ color: '#FFFFFF' }}>{status.syncing ? 'Working…' : LOCAL_ONLY ? 'Refresh local records' : 'Sync now'}</Text></Pressable>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    {commands.map((command) => <View key={command.operationId} style={styles.card}>
      <Text style={styles.name}>{String('name' in command.localRecord ? command.localRecord.name : command.entity === 'sale' ? 'Sale bill' : command.entity === 'purchase' ? 'Purchase bill' : 'Opening stock')} · {command.action}</Text>
      <Text style={styles.meta}>{command.entity} · {command.state === 'conflict' ? 'Needs attention' : 'Waiting to synchronize'}</Text>
      {command.entity === 'sale' || command.entity === 'purchase' ? <Pressable accessibilityRole="button" onPress={() => router.push(command.entity === 'sale' ? `/sale/${command.entityId}` : `/purchase/${command.entityId}`)} style={styles.button}><Text>Review provisional bill →</Text></Pressable> : null}
      {command.error ? <Text style={styles.meta}>Last attempt: {command.error}</Text> : null}
      {command.state === 'conflict' && (command.entity === 'sale' || command.entity === 'purchase') ? <Pressable accessibilityRole="button" disabled={reviewBusy} onPress={() => { if (!appSession.current) return; setReviewBusy(true); setError(''); void prepareOfflineTransactionReview(appSession.current, command.operationId).then((data) => setReview({ operationId: command.operationId, data })).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not review bill.')).finally(() => setReviewBusy(false)); }} style={styles.button}><Text>{reviewBusy ? 'Checking item settings…' : 'Recalculate with current item settings →'}</Text></Pressable> : null}
      {command.state === 'conflict' ? <><Text style={styles.meta}>Your local change is retained. Review the error and the bill or catalog record. Retry keeps the original request and will not overwrite another device’s change.</Text><Pressable accessibilityRole="button" onPress={() => { if (appSession.current) void retryOfflineConflict(appSession.current, command.operationId); }} style={styles.button}><Text>Retry unchanged request</Text></Pressable></> : null}
    </View>)}
    {!commands.length ? <Text style={styles.meta}>No pending changes or transactions.</Text> : null}
  </ScrollView><ConfirmationDialog visible={!!review} title="Review recalculated bill" message={review ? `Original total: ₹${review.data.originalTotal}
Updated total: ₹${review.data.record.total}
Payment recorded: ₹${review.data.record.amountPaid ?? 0}
Quantities are unchanged. Current GST and selling-option settings will be used. Approve this bill to retry synchronization.` : ''} confirmLabel={reviewBusy ? 'Updating…' : 'Approve and retry'} cancelLabel="Cancel" onCancel={() => { if (!reviewBusy) setReview(null); }} onConfirm={() => { if (!review || !appSession.current || reviewBusy) return; setReviewBusy(true); void applyOfflineTransactionReview(appSession.current, review.operationId, review.data.token).then(() => setReview(null)).catch((reason) => { setReview(null); setError(reason instanceof Error ? reason.message : 'Could not update bill.'); }).finally(() => setReviewBusy(false)); }} /></AppScreen>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 16 }, title: { fontSize: 24, fontWeight: '800', color: '#24332A' }, meta: { color: '#69766E', fontSize: 13, lineHeight: 20 }, button: { minHeight: 44, justifyContent: 'center' }, primary: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', backgroundColor: '#176B50', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' }, card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, gap: 8 }, name: { fontWeight: '700', color: '#24332A' } });
