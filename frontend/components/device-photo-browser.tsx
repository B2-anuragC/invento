import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type GalleryPhoto = { uri: string; name: string; mimeType: string; width: number; height: number };
export function DevicePhotoBrowser({ limit, onSelect, onClose, onSystemPicker, embedded = false }: { embedded?: boolean; limit: number; onSelect: (photos: GalleryPhoto[]) => Promise<void>; onClose: () => void; onSystemPicker: () => void }) {
  const insets = useSafeAreaInsets();
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [album, setAlbum] = useState<string>();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selected, setSelected] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const cursor = useRef<string | undefined>(undefined);
  const hasMore = useRef(true);
  const requestPermission = async () => {
    setError('');
    try { setPermission(await MediaLibrary.requestPermissionsAsync(false, ['photo'])); }
    catch { setError('Photo access is unavailable in this build. You can still use the system photo picker.'); }
  };
  useEffect(() => { void requestPermission(); }, []);
  useEffect(() => {
    if (!permission?.granted) return;
    let active = true;
    void MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true }).then((items) => { if (active) setAlbums(items); }).catch(() => { if (active) setError('Could not load albums. You can still browse all photos.'); });
    return () => { active = false; };
  }, [permission]);
  const load = async (reset = false) => {
    if (!permission?.granted || (!reset && (pending.current || !hasMore.current))) return;
    const version = reset ? ++generation.current : generation.current;
    pending.current = true; setLoading(true);
    if (reset) { cursor.current = undefined; hasMore.current = true; setAssets([]); }
    try {
      const page = await MediaLibrary.getAssetsAsync({ first: 48, after: cursor.current, album, mediaType: ['photo'], sortBy: [['creationTime', false]] });
      if (version !== generation.current) return;
      cursor.current = page.endCursor; hasMore.current = page.hasNextPage;
      setAssets((current) => reset ? page.assets : [...current, ...page.assets.filter((asset) => !current.some((item) => item.id === asset.id))]);
    } catch { if (version === generation.current) setError('Could not load photos. Check photo permissions or try the system picker.'); }
    finally { if (version === generation.current) { pending.current = false; setLoading(false); } }
  };
  useEffect(() => {
    void load(true);
    const version = generation.current;
    return () => { generation.current = version + 1; };
    // Each album/permission change starts a fresh paginated query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album, permission]);
  const addSelected = async () => {
    if (saving || !selected.length) return;
    setSaving(true); setError('');
    try {
      const photos: GalleryPhoto[] = [];
      for (const asset of selected) {
        const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
        if (!alive.current) return;
        const uri = info.localUri ?? info.uri;
        if (!uri || uri.startsWith('ph://')) throw new Error('A selected photo is not available locally. Download it to your phone and try again.');
        const extension = asset.filename.split('.').pop()?.toLowerCase();
        photos.push({ uri, name: asset.filename, mimeType: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : extension === 'heic' || extension === 'heif' ? 'image/heic' : 'image/jpeg', width: info.width, height: info.height });
      }
      await onSelect(photos);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add the selected photos.'); }
    finally { setSaving(false); }
  };
  const content = <View accessibilityViewIsModal style={[styles.screen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.header}><Text style={styles.title}>Select photos</Text><Pressable accessibilityRole="button" accessibilityLabel="Close photo browser" disabled={saving} onPress={onClose} style={styles.icon}><Ionicons name="close" size={24} color="#24332A" /></Pressable></View>
      {permission?.granted ? <>
        {permission.accessPrivileges === 'limited' ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void MediaLibrary.presentPermissionsPickerAsync(['photo']).then(() => requestPermission()).catch(() => setError('Change allowed photos in your device settings.')); }} style={styles.link}><Text>Showing allowed photos · Change selection</Text></Pressable> : null}
        <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={styles.albums} showsHorizontalScrollIndicator={false}>
          {[{ id: undefined, title: 'All photos' }, ...albums].map((item) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === album }} key={item.id ?? 'all'} disabled={saving} onPress={() => { setAlbum(item.id); setError(''); }} style={[styles.album, item.id === album && styles.activeAlbum]}><Text style={{ color: item.id === album ? '#FFFFFF' : '#24332A' }}>{item.title}</Text></Pressable>)}
        </ScrollView>
        <FlatList data={assets} numColumns={3} keyExtractor={(asset) => asset.id} contentContainerStyle={{ padding: 12, gap: 4 }} columnWrapperStyle={{ gap: 4 }} initialNumToRender={18} windowSize={5} onEndReached={() => void load()} onEndReachedThreshold={0.5} ListEmptyComponent={!loading ? <Text style={styles.message}>No accessible photos in this album.</Text> : null} ListFooterComponent={loading ? <ActivityIndicator style={{ padding: 16 }} color="#176B50" /> : null} renderItem={({ item }) => {
          const position = selected.findIndex((asset) => asset.id === item.id);
          return <Pressable accessibilityRole="button" accessibilityLabel={`Select ${item.filename}`} accessibilityState={{ selected: position >= 0 }} disabled={saving} onPress={() => {
            if (position >= 0) setSelected((current) => current.filter((asset) => asset.id !== item.id));
            else if (selected.length < limit) { setSelected((current) => [...current, item]); setError(''); }
            else setError(`Choose up to ${limit} photos.`);
          }} style={[styles.tile, position >= 0 && styles.selectedTile]}><Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={item.id} /><View style={[styles.check, position >= 0 && styles.activeAlbum]}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{position >= 0 ? position + 1 : ''}</Text></View></Pressable>;
        }} />
      </> : <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}><Text style={styles.message}>Allow photo access to browse your gallery and albums inside Invento.</Text><Pressable accessibilityRole="button" onPress={() => { if (permission?.canAskAgain === false) void Linking.openSettings(); else void requestPermission(); }} style={styles.link}><Text style={styles.linkText}>{permission?.canAskAgain === false ? 'Open settings' : 'Allow photo access'}</Text></Pressable></View>}
      {error ? <Text accessibilityRole="alert" style={{ color: '#A74737', paddingHorizontal: 16, paddingVertical: 8 }}>{error}</Text> : null}
      <View style={styles.footer}><Pressable accessibilityRole="button" disabled={saving} onPress={onSystemPicker} style={styles.link}><Text style={styles.linkText}>Use system picker</Text></Pressable><Pressable accessibilityRole="button" disabled={saving || !selected.length} onPress={() => void addSelected()} style={[styles.add, (saving || !selected.length) && { opacity: 0.5 }]}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{saving ? 'Adding…' : `Add selected (${selected.length}/${limit})`}</Text></Pressable></View>
    </View>;
  return embedded ? content : <Modal visible animationType="slide" onRequestClose={() => { if (!saving) onClose(); }}>{content}</Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }, title: { fontSize: 18, fontWeight: '700', color: '#24332A' }, icon: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  albums: { gap: 8, padding: 12 }, album: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#EDF2EE' }, activeAlbum: { backgroundColor: '#176B50' },
  tile: { flex: 1, maxWidth: '33.333%', aspectRatio: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' }, selectedTile: { borderColor: '#176B50' }, check: { position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: '#00000055', justifyContent: 'center', alignItems: 'center' },
  message: { color: '#65726A', textAlign: 'center', padding: 16 }, link: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, linkText: { color: '#176B50', fontWeight: '600', fontSize: 12 }, footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#E3EAE5' }, add: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#176B50' },
});
