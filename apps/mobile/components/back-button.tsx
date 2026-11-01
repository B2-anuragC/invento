import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The one back button every screen uses: a bordered square with ‹, named
 * "Go back" for screen readers unless the screen says where it leads.
 * Without a screen to return to (a page opened directly on web), it opens
 * `fallback` instead.
 */
export function BackButton({ label = 'Go back', onPress, fallback = '/(tabs)', disabled = false, style }: { label?: string; onPress?: () => void; fallback?: Href; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const goBack = onPress ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback)));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={4} onPress={goBack} style={[styles.button, disabled && styles.disabled, style]}>
      <Text aria-hidden accessible={false} importantForAccessibility="no-hide-descendants" style={styles.arrow}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexShrink: 0, width: 44, height: 44, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  arrow: { color: '#24332A', fontSize: 29, lineHeight: 32 },
});
