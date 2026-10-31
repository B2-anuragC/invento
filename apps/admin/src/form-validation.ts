import { GSTIN_RULE_MESSAGE, HSN_RULE_MESSAGE, isValidGstin, isValidHsnCode, isValidPhone, normalizeGstin, normalizeHsnCode, PHONE_RULE_MESSAGE } from "@invento/shared";

export const GST_RATE_RULE_MESSAGE = "Enter a GST rate from 0 to 100%, with up to two decimals.";

type CheckedField = { key: string; type?: string };

/**
 * First problem the API would also reject, checked before sending so the
 * message appears at once. Blank values pass: they clear optional fields.
 */
export function firstFieldError(fields: CheckedField[], values: Record<string, unknown>): string {
  for (const field of fields) {
    const value = String(values[field.key] ?? "").trim();
    if (!value) continue;
    if (field.type === "tel" && !isValidPhone(value)) return PHONE_RULE_MESSAGE;
    if (field.type === "gstin" && !isValidGstin(normalizeGstin(value))) return GSTIN_RULE_MESSAGE;
    if (field.type === "hsn" && !isValidHsnCode(normalizeHsnCode(value))) return HSN_RULE_MESSAGE;
    if (field.type === "gst-rate" && (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value) || Number(value) > 100)) return GST_RATE_RULE_MESSAGE;
  }
  return "";
}
