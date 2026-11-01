import { billEditBlockReason, billEditSettlement, discountError, WALK_IN_EDIT_MESSAGE } from '@invento/shared';

import type { ProductRecord } from './api';
import { formatDateTime } from './format';
import { saleDiscountInput, transactionTotals } from './transaction-accounting';

// Editing the items of a saved sale or purchase (owners and admins, online
// only). The form starts from the server's copy of the bill; these helpers turn
// it into editable lines, preview the new total and the refund with the same
// arithmetic the API uses, and build the request.

type Value = string | number | null | undefined;
export type EditKind = 'sale' | 'purchase';
/** A line as edited: a sale line is its product, selling option and unit; a purchase has one line per product. */
export type EditLine = { productId: string; optionId?: string; unit?: string; quantity: string; price: string };
export type EditProduct = Pick<ProductRecord, 'id' | 'name' | 'unit' | 'gstRate' | 'sellingPrice' | 'purchasePrice' | 'sellingOptions'> & { status?: string };
export type EditableBill = {
  id: string; status?: string; syncState?: string; total?: Value; returnedTotal?: Value; returns?: unknown[]; amountPaid?: Value; revision?: number;
  chargeGst?: boolean | null; discountTotal?: Value; discountPercent?: Value; isWalkIn?: boolean;
  items: { productId: string; sellingOptionId?: string | null; unit?: string | null; quantity: Value; sellingPrice?: Value; purchasePrice?: Value }[];
};
export type EditForm = { lines: EditLine[]; chargeGst: boolean; discountMode: 'amount' | 'percent'; discountValue: string };

const quantityText = (value: Value) => String(Number(Number(value ?? 0).toFixed(3)));
const priceText = (value: Value) => String(Number(Number(value ?? 0).toFixed(2)));
const typed = (value: string) => value.trim().replace(/\.$/, '');

export const editLineKey = (line: Pick<EditLine, 'productId' | 'optionId' | 'unit'>) => [line.productId, line.optionId ?? '', line.unit ?? ''].join('::');

/** Whether "Edit items" is offered: a saved, completed bill without returns, with prices shown, for a role that may edit. */
export function canEditBill(bill: Pick<EditableBill, 'id' | 'status' | 'syncState' | 'total' | 'returnedTotal' | 'returns'>, mayEdit: boolean): boolean {
  if (!mayEdit || bill.syncState || bill.id.startsWith('local_') || bill.total == null) return false;
  return !billEditBlockReason({ status: bill.status ?? 'COMPLETED', returnedTotal: bill.returnedTotal, returnCount: bill.returns?.length });
}

/** The form for a bill as it is now: its lines, GST choice and (sales) discount as entered. */
export function editFormFromBill(kind: EditKind, bill: EditableBill): EditForm {
  const lines = bill.items.map((item): EditLine => kind === 'sale'
    ? { productId: item.productId, ...(item.sellingOptionId ? { optionId: item.sellingOptionId } : {}), ...(item.unit ? { unit: item.unit } : {}), quantity: quantityText(item.quantity), price: priceText(item.sellingPrice) }
    : { productId: item.productId, quantity: quantityText(item.quantity), price: priceText(item.purchasePrice) });
  const percent = Number(bill.discountPercent ?? 0);
  const amount = Number(bill.discountTotal ?? 0);
  return { lines, chargeGst: bill.chargeGst !== false, discountMode: percent > 0 ? 'percent' : 'amount', discountValue: kind === 'purchase' ? '' : percent > 0 ? String(percent) : amount > 0 ? amount.toFixed(2) : '' };
}

/** Adds a product (in a selling option, for sales) to the form; the same kind of line again adds one to its quantity. */
export function addEditLine(kind: EditKind, lines: EditLine[], product: EditProduct, optionId?: string): EditLine[] {
  const option = kind === 'sale' && optionId ? product.sellingOptions?.find((entry) => entry.id === optionId) : undefined;
  const line: EditLine = kind === 'sale'
    ? { productId: product.id, ...(option ? { optionId: option.id } : {}), unit: option?.unit ?? product.unit, quantity: '1', price: priceText(option?.sellingPrice ?? product.sellingPrice) }
    : { productId: product.id, quantity: '1', price: product.purchasePrice == null ? '' : priceText(product.purchasePrice) };
  const index = lines.findIndex((entry) => editLineKey(entry) === editLineKey(line));
  if (index < 0) return [...lines, line];
  return lines.map((entry, i) => (i === index ? { ...entry, quantity: quantityText(Number(entry.quantity || 0) + 1) } : entry));
}

/** The price a line is charged at: a selling option's current price, otherwise what was typed. */
export function linePrice(line: EditLine, product: EditProduct | undefined): string {
  const option = line.optionId ? product?.sellingOptions?.find((entry) => entry.id === line.optionId) : undefined;
  return option ? priceText(option.sellingPrice) : typed(line.price);
}

/** What is wrong with a line as typed, or ''. */
export function editLineError(line: EditLine, product: EditProduct | undefined): string {
  if (!product) return 'This product could not be loaded. Remove this line.';
  if (line.optionId && !product.sellingOptions?.some((entry) => entry.id === line.optionId)) return 'This selling option is no longer available. Remove this line.';
  const quantity = typed(line.quantity);
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) return 'Enter a quantity greater than zero.';
  if (line.optionId && !Number.isInteger(Number(quantity))) return 'Enter a whole number of options.';
  if (!line.optionId && line.unit === 'PIECE' && !Number.isInteger(Number(quantity))) return 'Enter whole pieces.';
  const price = linePrice(line, product);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0) return 'Enter a price greater than zero.';
  return '';
}

export type EditPreview = {
  subtotal: number; discount: number; tax: number; total: number;
  /** The new total as sent to the API (expectedTotal). */
  totalText: string;
  /** Paid above the new total, refunded on save; what is still due after it. */
  refund: string; balanceDue: string;
  lineErrors: Record<string, string>;
  discountError: string;
  error: string;
};

const discountKey = (kind: EditKind, form: EditForm) => {
  if (kind === 'purchase') return '';
  const input = saleDiscountInput(form.discountMode, form.discountValue);
  const value = Number(input.discountAmount ?? input.discountPercent ?? 0);
  return value > 0 ? `${input.discountPercent !== undefined ? '%' : '₹'}${value}` : '';
};
const sameForm = (kind: EditKind, a: EditForm, b: EditForm) => a.chargeGst === b.chargeGst && discountKey(kind, a) === discountKey(kind, b)
  && a.lines.length === b.lines.length
  && a.lines.every((line, index) => editLineKey(line) === editLineKey(b.lines[index]) && Number(typed(line.quantity)) === Number(typed(b.lines[index].quantity)) && Number(typed(line.price)) === Number(typed(b.lines[index].price)));

/**
 * Previews the edited bill: totals priced exactly as for a new bill (a sale's
 * discount split before GST, GST per line at each product's current rate), and
 * how money already paid is settled. error is the first reason it cannot be saved.
 */
export function billEditPreview(kind: EditKind, bill: EditableBill, form: EditForm, products: Record<string, EditProduct>): EditPreview {
  const discount = kind === 'sale' ? saleDiscountInput(form.discountMode, form.discountValue) : {};
  const items = form.lines.map((line) => ({ quantity: Number(typed(line.quantity)), price: Number(linePrice(line, products[line.productId])), product: { gstRate: products[line.productId]?.gstRate } }));
  const totals = transactionTotals(items, discount, form.chargeGst);
  const totalText = totals.total.toFixed(2);
  const settlement = billEditSettlement({ amountPaid: bill.amountPaid == null ? null : Number(bill.amountPaid).toFixed(2), total: totalText });
  const lineErrors = Object.fromEntries(form.lines.map((line) => [editLineKey(line), editLineError(line, products[line.productId])]).filter(([, error]) => error));
  const invalid = form.lines.find((line) => lineErrors[editLineKey(line)]);
  const problem = kind === 'sale' ? discountError(totals.subtotal.toFixed(2), discount) : '';
  const walkIn = kind === 'sale' && bill.isWalkIn && (bill.amountPaid == null || totals.total > Number(bill.amountPaid) + 1e-9);
  const error = !form.lines.length ? 'Add at least one item.'
    : invalid ? `${products[invalid.productId]?.name ?? 'Item'}: ${lineErrors[editLineKey(invalid)]}`
    : problem || (walkIn ? WALK_IN_EDIT_MESSAGE : sameForm(kind, form, editFormFromBill(kind, bill)) ? 'Change an item, quantity, price, discount or GST to save.' : '');
  return { ...totals, totalText, refund: settlement.refund, balanceDue: settlement.balanceDue, lineErrors, discountError: problem, error };
}

export type SaleEditInput = { requestId: string; revision?: number; reason: string; chargeGst: boolean; discountAmount?: string; discountPercent?: string; expectedTotal: string; expectedRefund: string; refundMethod?: string; items: { productId: string; sellingOptionId?: string; unit?: string; quantity: string; sellingPrice: string }[] };
export type PurchaseEditInput = { requestId: string; revision?: number; reason: string; chargeGst: boolean; expectedTotal: string; expectedRefund: string; refundMethod?: string; items: { productId: string; quantity: string; purchasePrice: string }[] };

/** The request for PUT /sales/:id/items or /purchases/:id/items: the refund shown (the API refuses the edit if a payment since changes it), and the refund method only when money goes back. */
export function billEditInput(kind: EditKind, bill: EditableBill, form: EditForm, products: Record<string, EditProduct>, extra: { requestId: string; reason: string; refundMethod: string }): SaleEditInput | PurchaseEditInput {
  const preview = billEditPreview(kind, bill, form, products);
  const common = { requestId: extra.requestId, ...(bill.revision ? { revision: bill.revision } : {}), reason: extra.reason.trim(), chargeGst: form.chargeGst, expectedTotal: preview.totalText, expectedRefund: preview.refund, ...(Number(preview.refund) > 0 ? { refundMethod: extra.refundMethod } : {}) };
  const price = (line: EditLine) => Number(linePrice(line, products[line.productId])).toFixed(2);
  if (kind === 'purchase') return { ...common, items: form.lines.map((line) => ({ productId: line.productId, quantity: quantityText(typed(line.quantity)), purchasePrice: price(line) })) };
  return {
    ...common,
    ...saleDiscountInput(form.discountMode, form.discountValue),
    items: form.lines.map((line) => ({ productId: line.productId, ...(line.optionId ? { sellingOptionId: line.optionId } : line.unit ? { unit: line.unit } : {}), quantity: quantityText(typed(line.quantity)), sellingPrice: price(line) })),
  };
}

/** "Edited · 1 Nov 2026, 10:12 am" and the reason, for the receipt; null when the bill was never edited. */
export function editedSummary(bill: { editedAt?: string | null; editReason?: string | null }): { title: string; reason: string } | null {
  if (!bill.editedAt) return null;
  const date = formatDateTime(bill.editedAt);
  return { title: date ? `Edited · ${date}` : 'Edited', reason: bill.editReason?.trim() ?? '' };
}
