/**
 * The print and share buttons under a saved bill, with the same words on every
 * bill: "Print", "Share PDF", and either "Send on WhatsApp" (a sale whose
 * customer has a usable phone number) or "Share as text". Screen readers hear
 * what is printed or sent, and to whom.
 */
export type ShareActionKey = 'print' | 'pdf' | 'whatsapp' | 'text';
export type ShareAction = { key: ShareActionKey; label: string; accessibilityLabel: string };

/**
 * The number WhatsApp needs (country code and digits only), or null. Ten-digit
 * Indian mobile numbers, with or without a leading 0, get 91 added; numbers
 * written with + or 00 keep their own country code.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? '';
  let phone = text.replace(/\D/g, '');
  if (text.startsWith('00')) phone = phone.slice(2);
  if (!text.startsWith('+') && !text.startsWith('00')) {
    if (/^0[6-9]\d{9}$/.test(phone)) phone = phone.slice(1);
    if (/^[6-9]\d{9}$/.test(phone)) phone = `91${phone}`;
  }
  return /^[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

export function receiptShareActions(input: {
  kind: 'sale' | 'purchase';
  /** The bill's heading, such as "Tax invoice" or "Purchase receipt". */
  documentName: string;
  contact: string;
  phone?: string | null;
  canSharePdf: boolean;
  canShareText: boolean;
}): ShareAction[] {
  const name = input.documentName.toLowerCase();
  const actions: ShareAction[] = [{ key: 'print', label: 'Print', accessibilityLabel: `Print ${name}` }];
  if (input.canSharePdf) actions.push({ key: 'pdf', label: 'Share PDF', accessibilityLabel: `Share ${name} as PDF` });
  if (input.kind === 'sale' && whatsappNumber(input.phone)) {
    actions.push({ key: 'whatsapp', label: 'Send on WhatsApp', accessibilityLabel: `Send ${name} to ${input.contact} on WhatsApp` });
  } else if (input.canShareText) {
    actions.push({ key: 'text', label: 'Share as text', accessibilityLabel: `Share ${name} as text` });
  }
  return actions;
}
