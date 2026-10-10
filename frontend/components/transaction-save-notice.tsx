import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
export function TransactionSaveNotice({ kind, saving, outcome, error, onEdit, onActivity }: { kind: 'sale' | 'purchase'; saving: boolean; outcome: 'rejected' | 'unknown' | null; error: string; onEdit: () => void; onActivity: () => void }) {
  if (!saving && !outcome) return null;
  const unknown = outcome === 'unknown';
  return <View accessibilityRole={saving ? undefined : 'alert'} style={[styles.card, !saving && !unknown && styles.rejected]}>
    <View style={styles.row}>{saving ? <ActivityIndicator color="#9C640A" /> : <Ionicons name="alert-circle-outline" size={22} color={unknown ? '#9C640A' : '#B54435'} />}<View style={{ flex: 1 }}><Text style={styles.title}>{saving ? 'Saving in progress…' : unknown ? 'Save status needs checking' : `${kind === 'sale' ? 'Sale' : 'Purchase'} was not saved`}</Text><Text style={styles.copy}>{saving ? 'Keep this screen open. Your transaction is not confirmed yet. Please do not submit again.' : unknown ? 'The response could not confirm whether this transaction was saved. Retry this same draft safely, or check Activity before creating another transaction.' : 'The server rejected this save. Your items are retained below. Correct the details and retry the same draft.'}</Text>{!saving && error ? <Text style={styles.copy}>{error}</Text> : null}</View></View>
    {!saving ? <Pressable accessibilityRole="button" onPress={unknown ? onActivity : onEdit} style={styles.action}><Text style={styles.actionText}>{unknown ? 'Check Activity →' : 'Return to editing →'}</Text></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#FFF3DB', padding: 16, borderRadius: 14, marginBottom: 16 }, rejected: { backgroundColor: '#FCEDE9' }, row: { flexDirection: 'row', gap: 10 }, title: { color: '#24332A', fontSize: 14, fontWeight: '700' }, copy: { color: '#68746E', fontSize: 12, lineHeight: 19, marginTop: 5 }, action: { minHeight: 44, justifyContent: 'center', marginTop: 8 }, actionText: { color: '#176B50', fontWeight: '700' } });
