import { StoredImage as Image } from '@/components/stored-image';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { fileSource, storePickedFile, type UploadKind } from '@/services/file-storage';

export type ProductPhotoValue = { imageThumbnail: string | null; imageOriginal: string | null };

export function ProductThumbnail({ uri, size = 44 }: { uri?: string | null; size?: number }) {
  return uri ? <Image accessibilityLabel="Product photo" source={fileSource(uri)} style={{ width: size, height: size, borderRadius: 8 }} resizeMode="contain" /> : null;
}

export function ProductPhoto({ value, onChange, disabled, onBusy, kind = 'product' }: { value: ProductPhotoValue; onChange?: (value: ProductPhotoValue) => void; disabled?: boolean; onBusy?: (busy: boolean) => void; kind?: UploadKind }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const choose = async () => {
    if (busy || disabled || !onChange) return;
    setBusy(true); onBusy?.(true); setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[asset.name.split('.').pop()?.toLowerCase() ?? ''];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Choose a JPEG, PNG or WebP image.');
      const stored = await storePickedFile({ uri: asset.uri, name: asset.name, mimeType: mime, size: asset.size, file: asset.file }, kind);
      onChange({ imageOriginal: stored.url, imageThumbnail: stored.thumbnailUrl ?? stored.url });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare the image.'); }
    finally { setBusy(false); onBusy?.(false); }
  };
  if (!onChange && !value.imageThumbnail) return null;
  return <View style={{ padding: 16, marginBottom: 14, borderRadius: 14, backgroundColor: '#FFFFFF', gap: 10 }}>
    <Text style={{ color: '#24332A', fontWeight: '700' }}>{kind === 'customer' ? 'Customer photo' : 'Product photo'}{onChange ? ' · Optional' : ''}</Text>
    {value.imageThumbnail ? <Pressable accessibilityRole="button" accessibilityLabel="View original product image" onPress={() => setPreview(true)}><Image source={fileSource(value.imageThumbnail)} style={{ width: 120, height: 120 }} resizeMode="contain" /><Text>View original image</Text></Pressable> : null}
    {onChange ? <View style={{ flexDirection: 'row', gap: 20 }}>
      <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => void choose()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#176B50' }}>{busy ? 'Preparing image…' : value.imageThumbnail ? 'Replace image' : 'Choose image'}</Text></Pressable>
      {value.imageThumbnail ? <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { onChange({ imageThumbnail: null, imageOriginal: null }); setError(''); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text>Remove image</Text></Pressable> : null}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text> : null}
    <Modal visible={preview} onRequestClose={() => setPreview(false)}><View style={{ flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#FFFFFF' }}><Pressable accessibilityRole="button" onPress={() => setPreview(false)} style={{ minHeight: 44 }}><Text>Close image</Text></Pressable><Image source={fileSource(value.imageOriginal ?? value.imageThumbnail ?? '')} style={{ flex: 1 }} resizeMode="contain" /></View></Modal>
  </View>;
}
