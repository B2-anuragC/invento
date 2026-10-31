import { GSTIN_RULE_MESSAGE, isValidGstin, isValidPhone, normalizeGstin, PHONE_RULE_MESSAGE } from "@invento/shared";

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
  }
  return "";
}
