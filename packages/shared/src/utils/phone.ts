export const PHONE_RULE_MESSAGE = 'Enter a valid phone number: 7 to 15 digits, optionally starting with +.';

/**
 * Accepts the ways shopkeepers write numbers ("+91 98765 43210", "(022) 2345-6789"):
 * an optional leading +, then digits with spaces, dots, hyphens or brackets.
 * E.164 allows at most 15 digits; 7 covers short landlines.
 * Blank values are handled by callers, where they clear the field.
 */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}
