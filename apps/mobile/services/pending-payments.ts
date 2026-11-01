import { formatMoney } from './format';
import { isOverdue, paymentBalance } from './transaction-accounting';

type Bill = Parameters<typeof paymentBalance>[0] & { dueDate?: string | null };

export type PendingPaymentsCard = {
  /** "₹1,180.00 to collect", "Nothing to collect", or "—" while sales load. */
  title: string;
  /** The amount alone ("₹1,180.00", "₹0.00"), or "—" while sales load. */
  amount: string;
  /** "3 unpaid sales · 1 overdue". Empty when nothing is owed. */
  detail: string;
  /** Older sales saved before payments were recorded have no balance and are not counted. */
  note: string | null;
  /** The filter switch is offered while something is owed, or while it is on. */
  showFilter: boolean;
  filterLabel: string;
  /** The quick-filter chip on the Sales tab: "Unpaid · ₹1,180.00", or "Unpaid" while loading or when nothing is owed. */
  chipLabel: string;
  /** What a screen reader hears for the whole card. */
  accessibilityLabel: string;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Sales with money still to collect after returns; cancelled sales owe nothing. */
export function unpaidSales<T extends Bill>(sales: T[]): T[] {
  return sales.filter((sale) => (paymentBalance(sale) ?? 0) > 0);
}

/** The "To collect" card on the Sales tab, which also turns the unpaid-only filter on and off. */
export function pendingPaymentsCard(sales: Bill[], options: { ready: boolean; filterOn: boolean; overdue?: (sale: Bill) => boolean }): PendingPaymentsCard {
  const overdue = options.overdue ?? isOverdue;
  const unpaid = unpaidSales(sales);
  const total = unpaid.reduce((sum, sale) => sum + Math.round((paymentBalance(sale) ?? 0) * 100), 0) / 100;
  const late = unpaid.filter(overdue).length;
  const unknown = sales.filter((sale) => sale.status !== 'CANCELLED' && sale.total != null && sale.amountPaid == null).length;
  const title = !options.ready ? '—' : unpaid.length ? `${formatMoney(total)} to collect` : 'Nothing to collect';
  const detail = !options.ready || !unpaid.length ? '' : [plural(unpaid.length, 'unpaid sale'), late ? `${late} overdue` : ''].filter(Boolean).join(' · ');
  const note = options.ready && unknown ? `${plural(unknown, 'older sale')} without a recorded payment ${unknown === 1 ? 'is' : 'are'} not counted.` : null;
  return {
    title,
    amount: options.ready ? formatMoney(total) : '—',
    detail,
    note,
    showFilter: options.ready && (unpaid.length > 0 || options.filterOn),
    filterLabel: 'Show only unpaid sales',
    chipLabel: options.ready && unpaid.length ? `Unpaid · ${formatMoney(total)}` : 'Unpaid',
    accessibilityLabel: [title === '—' ? 'Payments to collect, loading' : title, detail, note].filter(Boolean).join('. '),
  };
}
