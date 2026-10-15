import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ZoomableProductPhoto } from './zoomable-product-photo';

type Photo = { imageOriginal: string; imageThumbnail: string };

export function ProductPhotoViewer({ photos, initialIndex, onSelect, onClose }: { photos: Photo[]; initialIndex: number; onSelect: (index: number) => void; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(Math.min(initialIndex, photos.length - 1));
  const move = (next: number) => {
    if (next < 0 || next >= photos.length) return;
    setPage(next); onSelect(next);
  };
  return <Modal visible animationType="fade" onRequestClose={onClose}>
    <GestureHandlerRootView accessibilityViewIsModal style={[styles.screen, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.header}>
        <Text accessibilityLiveRegion="polite" style={styles.text}>{page + 1} / {photos.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo gallery" onPress={onClose} style={styles.button}><Ionicons name="close" size={26} color="#FFFFFF" /></Pressable>
      </View>
      <ZoomableProductPhoto key={`${photos[page].imageOriginal}:${width}`} uri={photos[page].imageOriginal} label={`Product photo ${page + 1} of ${photos.length}`} onPrevious={() => move(page - 1)} onNext={() => move(page + 1)} />
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous photo" disabled={page === 0} onPress={() => move(page - 1)} style={[styles.button, page === 0 && styles.disabled]}><Ionicons name="chevron-back" size={26} color="#FFFFFF" /></Pressable>
        <Text style={styles.text}>{photos.length > 1 ? 'Swipe to browse photos' : 'Product photo'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next photo" disabled={page === photos.length - 1} onPress={() => move(page + 1)} style={[styles.button, page === photos.length - 1 && styles.disabled]}><Ionicons name="chevron-forward" size={26} color="#FFFFFF" /></Pressable>
      </View>
    </GestureHandlerRootView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111111' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  text: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.25 },
});
