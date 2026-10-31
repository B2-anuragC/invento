import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

/**
 * Shown directly above a form's submit button, where the user's eyes are after
 * pressing it. Long forms used to show errors at the top, off-screen.
 */
export function FormError({ message, style }: { message?: string; style?: StyleProp<TextStyle> }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, style]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  error: { color: '#A74737', backgroundColor: '#FBECEA', borderRadius: 11, padding: 12, fontSize: 13, lineHeight: 19, marginBottom: 10 },
});
