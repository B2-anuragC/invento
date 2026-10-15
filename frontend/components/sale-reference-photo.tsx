import { CameraPhoto } from '@/components/camera-photo';
import { StoredImage as Image } from '@/components/stored-image';
import { fileSource, thumbnailFor, storePickedFile } from '@/services/file-storage';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export function SaleReferencePhoto({ value, onChange, disabled = false, onBusy }: { value?: string | null; onChange?: (value: string | undefined) => void; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const pick = async () => {
    if (!onChange || busy || disabled) return;
    setBusy(true); onBusy?.(true); setError('');
    try {
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
      const result = await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const file = await storePickedFile({ uri: asset.uri, name: asset.fileName ?? 'sale-photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize, width: asset.width, height: asset.height, file: asset.file }, 'sale');
      onChange(file.url);
    } catch { setError('Could not attach the photo. Please try again.'); }
    finally { setBusy(false); onBusy?.(false); }
  };
  if (!onChange && !value) return null;
  return <View style={styles.card}>
    <Text style={styles.title}>Bill/reference photo{onChange ? ' · Optional' : ''}</Text>
    {onChange ? <Text style={styles.hint}>Attach a physical bill or another reference to this sale.</Text> : null}
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="Open bill/reference photo" onPress={() => setPreview(true)}><Image source={fileSource(thumbnailFor(value))} style={styles.thumbnail} resizeMode="contain" /><Text style={styles.link}>Tap to view photo</Text></Pressable> : null}
    {onChange ? <View style={styles.actions}>
      <CameraPhoto kind="sale" disabled={busy || disabled} onBusy={(next) => { setBusy(next); onBusy?.(next); }} onChange={(file) => onChange(file.url)} />
      <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => void pick()} style={styles.button}><Text style={styles.link}>Choose photo</Text></Pressable>
      {value ? <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { onChange(undefined); setError(''); }} style={styles.button}><Text style={styles.link}>Remove</Text></Pressable> : null}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Modal visible={preview} animationType="fade" onRequestClose={() => setPreview(false)}><View style={styles.preview}><Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setPreview(false)} style={styles.close}><Text style={{ color: '#FFFFFF', fontSize: 18 }}>Close ✕</Text></Pressable>{value ? <Image source={fileSource(value)} style={{ flex: 1, width: '100%' }} resizeMode="contain" /> : null}</View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 16, marginVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#DEE6E1', backgroundColor: '#FFFFFF' }, title: { color: '#24332A', fontSize: 16, fontWeight: '700' }, hint: { color: '#737B77', marginTop: 6, lineHeight: 20 }, thumbnail: { height: 180, width: '100%', marginTop: 12, backgroundColor: '#F3F5F4', borderRadius: 10 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }, button: { minHeight: 44, justifyContent: 'center' }, link: { color: '#176B50', fontWeight: '700', paddingVertical: 8 }, error: { color: '#A74737', marginTop: 8 }, preview: { flex: 1, backgroundColor: '#111111', paddingTop: 50, paddingBottom: 24 }, close: { minHeight: 44, alignSelf: 'flex-end', paddingHorizontal: 24, justifyContent: 'center' },
});
