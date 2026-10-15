import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import type { ImagePickerResult } from 'expo-image-picker';
import { choosePictureSize } from '@/services/camera-size';

const canceled: ImagePickerResult = { canceled: true, assets: null };

export function InAppCamera({ onResult }: { onResult: (result: ImagePickerResult) => void }) {
  const camera = useRef<CameraView>(null);
  const mounted = useRef(true);
  const capturing = useRef(false);
  const resultHandler = useRef(onResult);
  resultHandler.current = onResult;
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [pictureSize, setPictureSize] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background') resultHandler.current(canceled);
    });
    return () => { mounted.current = false; listener.remove(); };
  }, []);
  const prepare = async () => {
    try {
      const sizes = await camera.current?.getAvailablePictureSizesAsync();
      if (mounted.current) { setPictureSize(choosePictureSize(sizes ?? [])); setReady(true); }
    } catch {
      if (mounted.current) { setError('Could not prepare the camera. Close it and try again.'); setReady(false); }
    }
  };
  const takePhoto = async () => {
    if (!ready || capturing.current || !camera.current) return;
    capturing.current = true; setTaking(true); setError('');
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, base64: false, exif: false });
      if (!mounted.current) return;
      if (!photo) throw new Error('The camera did not return a photo.');
      resultHandler.current({ canceled: false, assets: [{ uri: photo.uri, width: photo.width, height: photo.height, mimeType: 'image/jpeg', fileName: 'camera-photo.jpg', type: 'image' }] });
    } catch {
      if (mounted.current) setError('Could not take the photo. Try again or close the camera.');
    } finally {
      capturing.current = false;
      if (mounted.current) setTaking(false);
    }
  };
  return <Modal visible animationType="slide" onRequestClose={() => onResult(canceled)}>
    <View style={styles.screen}>
      <CameraView key={facing} ref={camera} style={styles.camera} facing={facing} mode="picture" pictureSize={pictureSize} onCameraReady={() => void prepare()} onMountError={() => { setReady(false); setError('Camera unavailable. Close it and check camera permissions.'); }} />
      <View style={styles.controls}>
        {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : null}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={() => onResult(canceled)} style={styles.button}><Text style={styles.text}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Capture photo" disabled={!ready || taking} onPress={() => void takePhoto()} style={[styles.button, (!ready || taking) && styles.disabled]}><Text style={styles.text}>{taking ? 'Taking photo…' : !ready ? 'Starting camera…' : 'Capture photo'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" disabled={!ready || taking} onPress={() => { setReady(false); setPictureSize(undefined); setError(''); setFacing((value) => value === 'back' ? 'front' : 'back'); }} style={[styles.button, (!ready || taking) && styles.disabled]}><Text style={styles.text}>Flip</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' }, camera: { flex: 1 },
  controls: { padding: 20, paddingBottom: 40, backgroundColor: '#111111', gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  button: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 8, backgroundColor: '#176B50' },
  text: { color: '#FFFFFF', fontWeight: '700' }, disabled: { opacity: 0.5 },
});
