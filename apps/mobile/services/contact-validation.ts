import { isValidPhone, PHONE_RULE_MESSAGE } from '@invento/shared';

/**
 * Checked before saving locally as well as on the server: an offline save with
 * an invalid number would otherwise only fail later, during synchronization.
 * Returns an empty string when the value is blank or valid.
 */
export function phoneError(value: string): string {
  return value.trim() === '' || isValidPhone(value) ? '' : PHONE_RULE_MESSAGE;
}
