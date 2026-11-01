import { Ionicons as VectorIonicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * Icons are drawn with a font, so each one is a private-use character that
 * screen readers would read out as part of a button's name. Every icon here
 * is decorative: the button or text beside it carries the meaning, so the
 * icon is hidden from assistive technology on phones and on web.
 */
export function Ionicons(props: ComponentProps<typeof VectorIonicons>) {
  return <VectorIonicons aria-hidden accessible={false} importantForAccessibility="no-hide-descendants" {...props} />;
}
