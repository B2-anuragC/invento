const labels: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};

/** "Bank transfer" rather than the stored code "BANK_TRANSFER". */
export function paymentMethodLabel(method: string): string {
  return labels[method] ?? method.replaceAll('_', ' ').toLowerCase().replace(/^./, (first) => first.toUpperCase());
}

type PaymentLike = { method?: string | null; kind?: string | null };

/**
 * Every method actually used to pay, in the order first used: "UPI + Cash".
 * A confirmed opening balance or a refund is not a payment method. Without recorded
 * payments, falls back to the method chosen when the bill was saved.
 */
export function paymentMethodsSummary(payments: PaymentLike[] | null | undefined, fallback?: string | null): string {
  const used = [...new Set((payments ?? []).filter((payment) => payment.kind !== 'OPENING_BALANCE' && payment.kind !== 'REFUND' && payment.method).map((payment) => payment.method as string))];
  if (used.length) return used.map(paymentMethodLabel).join(' + ');
  return fallback ? paymentMethodLabel(fallback) : '';
}
