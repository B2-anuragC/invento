import { chargesGst } from '@invento/shared';

import { formatDate, formatMoney } from './format';
import { taxTotalRows, type SaleGstDetails } from './gst';
import { paymentBalance } from './transaction-accounting';

export type ReceiptTextSource = {
  kind: 'sale' | 'purchase';
  date: string;
  contact: string;
  gst?: SaleGstDetails | null;
  chargeGst?: boolean | null;
  total?: string | number | null;
  subtotal?: string | number;
  discountTotal?: string | number;
  taxTotal?: string | number;
  amountPaid?: string | number | null;
  status?: string;
  paymentMethod?: string;
  items: { name: string; quantity: number; label: string; price?: number; gstRate?: string | number; taxAmount?: string | number; lineTotal?: string | number }[];
};

/**
 * The plain-text receipt sent on WhatsApp (sales) or the share sheet
 * (purchases). A bill without GST lists no GST rows.
 */
export function receiptShareText(data: ReceiptTextSource, heading: { title: string; identifier: string; shopName?: string }): string {
  const money = formatMoney;
  const balance = paymentBalance(data);
  const gstRows = !chargesGst(data.chargeGst) ? [] : data.taxTotal == null ? ['GST: Restricted'] : taxTotalRows(data.items, data.gst?.taxType, data.taxTotal).map((row) => `${row.label}: ${money(row.amount)}`);
  return [
    `${heading.title} · ${heading.identifier}`,
    ...(heading.shopName ? [heading.shopName] : []),
    ...(data.gst?.sellerGstin ? [`GSTIN ${data.gst.sellerGstin}`] : []),
    formatDate(data.date),
    `${data.kind === 'sale' ? 'Customer' : 'Supplier'}: ${data.contact}${data.gst?.buyerGstin ? ` · GSTIN ${data.gst.buyerGstin}` : ''}`,
    ...data.items.map((item) => `${item.name} · ${item.quantity} ${item.label}${item.price == null ? '' : ` × ${money(item.price)} = ${money(Number((item.quantity * item.price).toFixed(2)))}`}`),
    `Subtotal: ${data.subtotal == null ? 'Restricted' : money(Number(data.subtotal))}`,
    ...(Number(data.discountTotal ?? 0) > 0 ? [`Discount: −${money(Number(data.discountTotal))}`] : []),
    ...gstRows,
    `Total: ${data.total == null ? 'Restricted price' : money(Number(data.total))}`,
    ...(balance == null ? [] : [`Paid: ${money(Number(data.amountPaid))}`, `Balance: ${money(balance)}`]),
    ...(data.paymentMethod ? [`Payment method: ${data.paymentMethod.replaceAll('_', ' ')}`] : []),
  ].join('\n');
}
