import { ProductPhotoViewer } from '@/components/product-photo-viewer';
import { Ionicons } from '@expo/vector-icons';
import { CameraPhoto } from '@/components/camera-photo';
import { StoredImage as Image } from '@/components/stored-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { fileSource, storePickedFile, type UploadKind } from '@/services/file-storage';

export type ProductPhotoValue = { images?: { imageOriginal: string; imageThumbnail: string }[]; imageThumbnail: string | null; imageOriginal: string | null };

export function ProductThumbnail({ uri, size = 44 }: { uri?: string | null; size?: number }) {
  return uri ? <Image accessibilityLabel="Product photo" source={fileSource(uri)} style={{ width: size, height: size, borderRadius: 8 }} resizeMode="contain" /> : null;
}

export function ProductPhoto(props: Parameters<typeof SingleProductPhoto>[0]) {
  return props.kind && props.kind !== 'product' ? <SingleProductPhoto {...props} /> : <ProductGallery {...props} />;
}

function ProductGallery({ value, onChange, disabled, onBusy, onEdit }: Parameters<typeof SingleProductPhoto>[0]) {
  const photos = value.images?.length ? value.images : value.imageOriginal ? [{ imageOriginal: value.imageOriginal, imageThumbnail: value.imageThumbnail ?? value.imageOriginal }] : [];
  const [selected, setSelected] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const editable = Boolean(onChange || onEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const index = Math.min(selected, Math.max(0, photos.length - 1));
  const current = photos[index];
  const setProcessing = (next: boolean) => { setBusy(next); onBusy?.(next); };
  const change = (images: typeof photos) => { const next = { images, imageOriginal: images[0]?.imageOriginal ?? null, imageThumbnail: images[0]?.imageThumbnail ?? null }; if (onChange) onChange(next); else onEdit?.(next); };
  const append = (file: { url: string; thumbnailUrl?: string }) => {
    if (photos.some((photo) => photo.imageOriginal === file.url)) return;
    if (photos.length >= 6) { setError('Use at most six product photos.'); return; }
    change([...photos, { imageOriginal: file.url, imageThumbnail: file.thumbnailUrl ?? file.url }]);
    setSelected(photos.length); setAdding(false);
  };
  const choose = async () => {
    if (!editable || disabled || busy || photos.length >= 6) return;
    setProcessing(true); setError('');
    const images = [...photos];
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: true });
      if (result.canceled) return;
      if (result.assets.length > 6 - photos.length) throw new Error(`Choose up to ${6 - photos.length} more photos.`);
      for (const asset of result.assets) {
        const mime = asset.mimeType || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[asset.name.split('.').pop()?.toLowerCase() ?? ''];
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Choose JPEG, PNG or WebP photos.');
        const file = await storePickedFile({ uri: asset.uri, name: asset.name, mimeType: mime, size: asset.size, file: asset.file }, 'product');
        if (!images.some((photo) => photo.imageOriginal === file.url)) images.push({ imageOriginal: file.url, imageThumbnail: file.thumbnailUrl ?? file.url });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add these photos.'); }
    finally { if (images.length !== photos.length) { change(images); setSelected(photos.length); } setProcessing(false); setAdding(false); }
  };
  if (!onChange && !onEdit && !photos.length) return null;
  return <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, marginBottom: 12, gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#24332A' }}>Photos · {photos.length}/6</Text>
      {editable && !current ? <Pressable accessibilityRole="button" accessibilityLabel="Add product photos" disabled={busy || disabled || photos.length >= 6} onPress={() => setAdding(true)} style={[styles.iconButton, (busy || disabled || photos.length >= 6) && { opacity: 0.4 }]}><Ionicons name="add" size={23} color="#176B50" /></Pressable> : null}
    </View>
    {current ? <SingleProductPhoto value={current} onEnlarge={() => setViewing(true)} compact onAdd={editable && !busy && !disabled && photos.length < 6 ? () => setAdding(true) : undefined} onRemove={editable && !disabled && !busy ? () => setRemoving(current.imageOriginal) : undefined} /> : <Text style={{ color: '#737B77' }}>Add up to 6 photos. First photo is the cover.</Text>}
    {photos.length ? <ScrollView horizontal contentContainerStyle={{ gap: 6 }} showsHorizontalScrollIndicator={false}>{photos.map((photo, position) => <Pressable key={photo.imageOriginal} accessibilityRole="button" accessibilityLabel={`View photo ${position + 1}${position === 0 ? ', cover' : ''}`} accessibilityState={{ selected: index === position }} onPress={() => setSelected(position)} style={{ padding: 3, borderWidth: 2, borderColor: index === position ? '#176B50' : '#E3EAE5', borderRadius: 10 }}><Image source={fileSource(photo.imageThumbnail)} style={{ width: 44, height: 44, borderRadius: 6 }} resizeMode="cover" />{position === 0 ? <Text style={{ fontSize: 10, textAlign: 'center', color: '#176B50' }}>Cover</Text> : null}</Pressable>)}</ScrollView> : null}
    {editable && current && index > 0 ? <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { change([current, ...photos.filter((_, position) => position !== index)]); setSelected(0); }} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={styles.addPhotoText}>Make cover</Text></Pressable> : null}
    {viewing && photos.length ? <ProductPhotoViewer photos={photos} initialIndex={index} onSelect={setSelected} onClose={() => setViewing(false)} /> : null}
    <Modal visible={adding} transparent animationType="fade" onRequestClose={() => { if (!busy) setAdding(false); }}>
      <View style={styles.dialogBackdrop}><View accessibilityViewIsModal style={styles.dialog}>
        <Text style={styles.dialogTitle}>Add product photos</Text>
        <CameraPhoto kind="product" disabled={busy || disabled || photos.length >= 6} onBusy={setProcessing} onChange={append} />
        <Pressable accessibilityRole="button" disabled={busy || disabled || photos.length >= 6} onPress={() => void choose()} style={styles.addPhotoButton}><Text style={styles.addPhotoText}>{busy ? 'Preparing photos…' : 'Choose photos'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAdding(false)} style={styles.dialogAction}><Text>Cancel</Text></Pressable>
      </View></View>
    </Modal>
    <Modal visible={Boolean(removing)} transparent animationType="fade" onRequestClose={() => setRemoving(null)}>
      <View style={styles.dialogBackdrop}><View accessibilityViewIsModal style={styles.dialog}>
        <Text style={styles.dialogTitle}>Remove photo?</Text>
        <Text style={{ color: '#65726A' }}>Remove this photo from the product? Save the product to apply the change.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
          <Pressable accessibilityRole="button" onPress={() => setRemoving(null)} style={styles.dialogAction}><Text>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { change(photos.filter((photo) => photo.imageOriginal !== removing)); setSelected(Math.max(0, index - 1)); setRemoving(null); setError(''); }} style={styles.dialogAction}><Text style={{ color: '#A74737', fontWeight: '700' }}>Remove</Text></Pressable>
        </View>
      </View></View>
    </Modal>
    {error ? <Text accessibilityRole="alert" style={{ color: '#A74737' }}>{error}</Text> : null}
  </View>;
}

function SingleProductPhoto({ value, onChange, disabled, onBusy, kind = 'product', compact = false, onRemove, onAdd, onEnlarge }: { value: ProductPhotoValue; onChange?: (value: ProductPhotoValue) => void; disabled?: boolean; onBusy?: (busy: boolean) => void; kind?: UploadKind; compact?: boolean; onEdit?: (value?: ProductPhotoValue) => void; onRemove?: () => void; onAdd?: () => void; onEnlarge?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const imageUri = value.imageThumbnail ?? value.imageOriginal;
  const isProduct = kind === 'product';
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
  if (!onChange && !imageUri) return null;
  return <View style={compact ? { gap: 0 } : { padding: 16, marginBottom: 14, borderRadius: 14, backgroundColor: '#FFFFFF', gap: 10 }}>
    {!compact ? <Text style={{ color: '#24332A', fontWeight: '700' }}>{kind === 'customer' ? 'Customer photo' : 'Product photo'}{onChange ? ' · Optional' : ''}</Text> : null}
    {imageUri ? <View style={isProduct ? styles.photoSection : undefined}>
      <View style={isProduct ? [styles.photoFrame, compact && styles.compactFrame] : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View full ${isProduct ? 'product' : 'customer'} photo`} onPress={() => onEnlarge ? onEnlarge() : setPreview(true)} style={isProduct ? { width: '100%', height: '100%' } : undefined}>
        <Image source={fileSource(isProduct ? value.imageOriginal ?? imageUri : imageUri)} style={isProduct ? styles.photo : { width: 120, height: 120 }} resizeMode="contain" />
        {compact ? <View style={styles.enlargeBadge}><Text style={styles.badgeText}>Enlarge</Text></View> : null}
      </Pressable>
      {onAdd ? <Pressable accessibilityRole="button" accessibilityLabel="Add product photos" onPress={onAdd} style={[styles.iconButton, styles.addOverlay]}><Ionicons name="add" size={23} color="#176B50" /></Pressable> : null}
      {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel="Remove selected product photo" onPress={onRemove} style={[styles.iconButton, styles.removeOverlay]}><Ionicons name="trash-outline" size={18} color="#A74737" /></Pressable> : null}
      </View>
      {!compact ? <Pressable accessibilityRole="button" accessibilityLabel="Enlarge photo" onPress={() => onEnlarge ? onEnlarge() : setPreview(true)} style={isProduct ? styles.enlargeButton : undefined}><Text style={isProduct ? styles.caption : undefined}>{isProduct ? 'Tap photo to view full size' : 'View original image'}</Text></Pressable> : null}
    </View> : null}
    {onChange ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
      <CameraPhoto kind={kind} disabled={busy || disabled} onBusy={(next) => { setBusy(next); onBusy?.(next); }} onChange={(stored) => onChange({ imageOriginal: stored.url, imageThumbnail: stored.thumbnailUrl ?? stored.url })} />
      <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => void choose()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#176B50' }}>{busy ? 'Preparing image…' : value.imageThumbnail ? 'Replace image' : 'Choose image'}</Text></Pressable>
      {value.imageThumbnail ? <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { onChange({ imageThumbnail: null, imageOriginal: null }); setError(''); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text>Remove image</Text></Pressable> : null}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text> : null}
    <Modal visible={preview} onRequestClose={() => setPreview(false)}><View style={{ flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#FFFFFF' }}><Pressable accessibilityRole="button" onPress={() => setPreview(false)} style={{ minHeight: 44 }}><Text>Close image</Text></Pressable><Image source={fileSource(value.imageOriginal ?? value.imageThumbnail ?? '')} style={{ flex: 1 }} resizeMode="contain" /></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#E8F2EC' },
  addOverlay: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(255,255,255,0.95)' },
  removeOverlay: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,255,255,0.95)' },
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 340, borderRadius: 16, padding: 20, gap: 12, backgroundColor: '#FFFFFF' },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: '#24332A' },
  dialogAction: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  addPhotoButton: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#E8F2EC', justifyContent: 'center', alignItems: 'center' },
  addPhotoText: { color: '#176B50', fontWeight: '700', fontSize: 12 },
  compactFrame: { maxWidth: 240, height: 140, aspectRatio: undefined, padding: 6, borderRadius: 10 },
  enlargeBadge: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  badgeText: { color: '#176B50', fontSize: 10, fontWeight: '600' },
  photoSection: { width: '100%', alignItems: 'center' },
  photoFrame: { width: '100%', maxWidth: 360, aspectRatio: 4 / 3, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F5F7F5', borderWidth: 1, borderColor: '#E3EAE5', alignItems: 'center', justifyContent: 'center', padding: 12 },
  photo: { width: '100%', height: '100%' },
  enlargeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  caption: { color: '#176B50', fontSize: 12, fontWeight: '600' },
});
