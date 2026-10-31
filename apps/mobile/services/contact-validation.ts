import { GSTIN_RULE_MESSAGE, isValidGstin, isValidPhone, normalizeGstin, PHONE_RULE_MESSAGE } from '@invento/shared';

/**
 * Checked before saving locally as well as on the server: an offline save with
 * an invalid number would otherwise only fail later, during synchronization.
 * Returns an empty string when the value is blank or valid.
 */
export function phoneError(value: string): string {
  return value.trim() === '' || isValidPhone(value) ? '' : PHONE_RULE_MESSAGE;
}

/** Empty when blank (clears the GSTIN) or valid; checked before an offline save for the same reason as phones. */
export function gstinError(value: string): string {
  const normalized = normalizeGstin(value);
  return normalized === '' || isValidGstin(normalized) ? '' : GSTIN_RULE_MESSAGE;
}

/** GSTIN as sent to the API: uppercase without spaces; "" clears it. */
export function gstinInput(value: string): string {
  return normalizeGstin(value);
}
