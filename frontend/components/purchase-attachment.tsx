import { CameraPhoto } from '@/components/camera-photo';
import { StoredImage as Image } from '@/components/stored-image';
import { fileSource, storePickedFile, downloadStoredFile, cachedImageFile } from '@/services/file-storage';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { FileAttachment } from '@/services/api';

export function PurchaseAttachment({ value, onChange, onBusy, disabled }: { value?: FileAttachment | null; onChange?: (value: FileAttachment | undefined) => void; onBusy?: (busy: boolean) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async () => {
    if (!onChange || disabled || busy) return;
    setBusy(true); onBusy?.(true); setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      onChange(await storePickedFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', size: asset.size, file: asset.file }, 'purchase'));
    } catch { setError('Could not attach this file. Please try again.'); }
    finally { setBusy(false); onBusy?.(false); }
  };
  const open = async () => {
    if (!value || busy) return;
    setError(''); setBusy(true);
    try {
      const name = value.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'attachment';
      if (Platform.OS === 'web') {
        const bytes = Uint8Array.from(atob(value.base64 ?? ''), (char) => char.charCodeAt(0));
        const url = URL.createObjectURL(value.url ? await downloadStoredFile(value.url) : new Blob([bytes], { type: 'application/octet-stream' }));
        const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        if (!(await Sharing.isAvailableAsync())) { setError('File sharing is unavailable on this device.'); return; }
        const uri = `${FileSystem.cacheDirectory}purchase-${Date.now()}-${name}`;
        if (value.url?.startsWith('file:')) await FileSystem.copyAsync({ from: value.url, to: uri });
        else if (value.url) await FileSystem.copyAsync({ from: await cachedImageFile(value.url), to: uri });
        else await FileSystem.writeAsStringAsync(uri, value.base64 ?? '', { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(uri, { mimeType: value.mimeType, dialogTitle: value.name });
      }
    } catch { setError('Could not open this attachment. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!value && !onChange) return null;
  return <View style={styles.card}>
    <Text style={styles.title}>Purchase attachment{onChange ? ' · Optional' : ''}</Text>
    {onChange ? <Text style={styles.hint}>PDF, image, or another reference file · up to 10 MB</Text> : null}
    {value ? <><Text style={styles.name}>{value.name}</Text>{value.thumbnailUrl || ['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType) ? <Image source={fileSource(value.thumbnailUrl ?? value.url ?? `data:${value.mimeType};base64,${value.base64}`)} style={styles.image} resizeMode="contain" /> : null}<Pressable accessibilityRole="button" disabled={busy} onPress={() => void open()} style={styles.button}><Text style={styles.link}>{Platform.OS === 'web' ? 'Download file' : 'Open / save file'}</Text></Pressable></> : null}
    {onChange ? <View style={styles.row}><CameraPhoto kind="purchase" disabled={busy || disabled} onBusy={(next) => { setBusy(next); onBusy?.(next); }} onChange={onChange} /><Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => void pick()} style={styles.button}><Text style={styles.link}>{busy ? 'Preparing file…' : value ? 'Replace file' : 'Choose file'}</Text></Pressable>{value ? <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => onChange(undefined)} style={styles.button}><Text style={styles.link}>Remove</Text></Pressable> : null}</View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DEE6E1', borderRadius: 14, padding: 16, marginVertical: 12 }, title: { color: '#24332A', fontWeight: '700', fontSize: 16 }, hint: { color: '#737B77', marginTop: 6 }, name: { color: '#24332A', marginTop: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 }, button: { minHeight: 44, justifyContent: 'center' }, link: { color: '#176B50', fontWeight: '700' }, error: { color: '#A74737' }, image: { width: '100%', height: 180, marginTop: 12 } });
