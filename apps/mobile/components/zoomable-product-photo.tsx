import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { StoredImage } from './stored-image';
import { fileSource } from '@/services/file-storage';

function clamp(value: number, limit: number) {
  'worklet';
  return Math.max(-limit, Math.min(limit, value));
}

export function ZoomableProductPhoto({ uri, label, onPrevious, onNext }: { uri: string; label: string; onPrevious: () => void; onNext: () => void }) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [percent, setPercent] = useState(100);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const hadPinch = useSharedValue(false);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const factor = imageSize.width && imageSize.height ? Math.min(viewport.width / imageSize.width, viewport.height / imageSize.height) : 1;
  const fittedWidth = imageSize.width ? imageSize.width * factor : viewport.width;
  const fittedHeight = imageSize.height ? imageSize.height * factor : viewport.height;
  const zoomTo = (value: number) => {
    const next = Math.max(1, Math.min(4, value));
    scale.value = next;
    x.value = clamp(x.value, Math.max(0, (fittedWidth * next - viewport.width) / 2));
    y.value = clamp(y.value, Math.max(0, (fittedHeight * next - viewport.height) / 2));
    setPercent(Math.round(next * 100));
  };
  const pinch = Gesture.Pinch()
    .onStart(() => { hadPinch.value = true; startScale.value = scale.value; startX.value = x.value; startY.value = y.value; })
    .onUpdate((event) => {
      const next = Math.max(1, Math.min(4, startScale.value * event.scale));
      const ratio = next / startScale.value;
      scale.value = next;
      x.value = clamp(startX.value * ratio + (event.focalX - viewport.width / 2) * (1 - ratio), Math.max(0, (fittedWidth * next - viewport.width) / 2));
      y.value = clamp(startY.value * ratio + (event.focalY - viewport.height / 2) * (1 - ratio), Math.max(0, (fittedHeight * next - viewport.height) / 2));
    })
    .onFinalize(() => { scheduleOnRN(setPercent, Math.round(scale.value * 100)); });
  const pan = Gesture.Pan().maxPointers(1).minDistance(12)
    .onBegin(() => { hadPinch.value = false; })
    .onStart(() => { panX.value = x.value; panY.value = y.value; })
    .onUpdate((event) => {
      if (hadPinch.value || scale.value <= 1.01) return;
      x.value = clamp(panX.value + event.translationX, Math.max(0, (fittedWidth * scale.value - viewport.width) / 2));
      y.value = clamp(panY.value + event.translationY, Math.max(0, (fittedHeight * scale.value - viewport.height) / 2));
    })
    .onEnd((event) => {
      if (hadPinch.value || scale.value > 1.01 || Math.abs(event.translationX) < Math.abs(event.translationY)) return;
      if (event.translationX < -50) scheduleOnRN(onNext);
      else if (event.translationX > 50) scheduleOnRN(onPrevious);
    });
  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDistance(12)
    .onEnd((_event, success) => {
      if (!success) return;
      scale.value = scale.value > 1 ? 1 : 2;
      x.value = 0; y.value = 0;
      scheduleOnRN(setPercent, scale.value * 100);
    });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return <View style={{ flex: 1 }}>
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <View collapsable={false} style={styles.viewport} onLayout={(event) => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
        <Animated.View style={[styles.image, animatedStyle]}>
          <StoredImage accessibilityLabel={label} source={fileSource(uri)} style={styles.image} resizeMode="contain" onLoad={(event) => { const source = event.nativeEvent.source; if (source.width && source.height) setImageSize({ width: source.width, height: source.height }); }} />
        </Animated.View>
      </View>
    </GestureDetector>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={percent <= 100} onPress={() => zoomTo(scale.value - 0.5)} style={[styles.button, percent <= 100 && styles.disabled]}><Ionicons name="remove" size={24} color="#FFFFFF" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset photo zoom" onPress={() => zoomTo(1)} style={styles.reset}><Text style={styles.text}>{percent}% · Reset</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={percent >= 400} onPress={() => zoomTo(scale.value + 0.5)} style={[styles.button, percent >= 400 && styles.disabled]}><Ionicons name="add" size={24} color="#FFFFFF" /></Pressable>
    </View>
    <Text style={styles.hint}>{percent > 100 ? 'Drag to explore · Reset to swipe photos' : 'Pinch or double-tap to zoom'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', touchAction: 'none' },
  image: { width: '100%', height: '100%' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  reset: { minHeight: 44, minWidth: 110, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  hint: { color: '#B8C2BC', textAlign: 'center', fontSize: 11 }, disabled: { opacity: 0.35 },
});
