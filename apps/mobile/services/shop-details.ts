import {
  DOCUMENT_PREFIX_RULE_MESSAGE,
  gstinStateCode,
  isGstStateCode,
  isValidDocumentPrefix,
  normalizeDocumentPrefix,
  normalizeGstin,
} from '@invento/shared';

import { gstinError, phoneError } from './contact-validation';

export type ShopDetailsForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  stateCode: string;
  invoicePrefix: string;
  purchasePrefix: string;
};

export type ShopDetailsErrors = Partial<Record<keyof ShopDetailsForm, string>>;

/** The state a GSTIN fixes, or "" when there is no valid GSTIN yet. */
export function stateFromGstin(gstin: string): string {
  const normalized = normalizeGstin(gstin);
  return normalized && !gstinError(normalized) ? gstinStateCode(normalized) : '';
}

/** Field errors shown beside each input; empty when the form can be saved. */
export function shopDetailsErrors(form: ShopDetailsForm): ShopDetailsErrors {
  const errors: ShopDetailsErrors = {};
  if (form.name.trim().length < 2) errors.name = 'Enter the shop name (at least 2 characters).';
  const phone = phoneError(form.phone);
  if (phone) errors.phone = phone;
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  const gstin = gstinError(form.gstin);
  if (gstin) errors.gstin = gstin;
  // A valid GSTIN fixes the state (the picker is locked), so an earlier choice
  // gives way to it instead of blocking the save.
  if (!stateFromGstin(form.gstin) && form.stateCode && !isGstStateCode(form.stateCode)) errors.stateCode = 'Choose a valid state.';
  for (const key of ['invoicePrefix', 'purchasePrefix'] as const) {
    if (!isValidDocumentPrefix(normalizeDocumentPrefix(form[key]))) errors[key] = DOCUMENT_PREFIX_RULE_MESSAGE;
  }
  return errors;
}

/** Request body: trimmed values, normalised GSTIN and prefixes, state taken from a GSTIN. */
export function shopDetailsInput(form: ShopDetailsForm) {
  const gstin = normalizeGstin(form.gstin);
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    address: form.address.trim(),
    gstin,
    stateCode: stateFromGstin(gstin) || form.stateCode,
    invoicePrefix: normalizeDocumentPrefix(form.invoicePrefix),
    purchasePrefix: normalizeDocumentPrefix(form.purchasePrefix),
  };
}
