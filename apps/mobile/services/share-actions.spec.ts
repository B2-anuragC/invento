import { describe, expect, it } from 'vitest';
import { receiptShareActions, whatsappNumber } from './share-actions';

describe('WhatsApp number', () => {
  it('adds India’s code to a ten-digit mobile number, with or without a leading 0', () => {
    expect(whatsappNumber('98765 43210')).toBe('919876543210');
    expect(whatsappNumber('098765-43210')).toBe('919876543210');
  });
  it('keeps the country code written with + or 00', () => {
    expect(whatsappNumber('+44 20 7946 0958')).toBe('442079460958');
    expect(whatsappNumber('0044 20 7946 0958')).toBe('442079460958');
    expect(whatsappNumber('+91 98765 43210')).toBe('919876543210');
  });
  it('refuses blank, short and landline-looking numbers without a country code', () => {
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('0123')).toBeNull();
  });
});

describe('print and share buttons', () => {
  const base = { documentName: 'Tax invoice', contact: 'Patil Constructions', canSharePdf: true, canShareText: true };
  it('offers WhatsApp for a sale whose customer has a usable phone number', () => {
    expect(receiptShareActions({ ...base, kind: 'sale', phone: '9876543210' })).toEqual([
      { key: 'print', label: 'Print', accessibilityLabel: 'Print tax invoice' },
      { key: 'pdf', label: 'Share PDF', accessibilityLabel: 'Share tax invoice as PDF' },
      { key: 'whatsapp', label: 'Send on WhatsApp', accessibilityLabel: 'Send tax invoice to Patil Constructions on WhatsApp' },
    ]);
  });
  it('shares text instead when the customer has no usable number, and for purchases', () => {
    expect(receiptShareActions({ ...base, kind: 'sale', phone: '' }).map((action) => action.label)).toEqual(['Print', 'Share PDF', 'Share as text']);
    expect(receiptShareActions({ ...base, kind: 'purchase', documentName: 'Purchase receipt', contact: 'Saint Glass', phone: '9876543210' }).at(-1)).toEqual({ key: 'text', label: 'Share as text', accessibilityLabel: 'Share purchase receipt as text' });
  });
  it('leaves out what the device cannot do', () => {
    expect(receiptShareActions({ ...base, kind: 'purchase', canSharePdf: false, canShareText: false }).map((action) => action.key)).toEqual(['print']);
    expect(receiptShareActions({ ...base, kind: 'sale', phone: '9876543210', canSharePdf: false, canShareText: false }).map((action) => action.key)).toEqual(['print', 'whatsapp']);
  });
});
