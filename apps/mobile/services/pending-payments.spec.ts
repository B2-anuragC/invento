import { describe, expect, it } from 'vitest';
import { pendingPaymentsCard, unpaidSales } from './pending-payments';

const money = (value: string) => value.replace(/ /g, ' ');
const sale = (total: string, amountPaid: string | null, extra: Record<string, unknown> = {}) => ({ total, amountPaid, ...extra });
const never = () => false;

describe('payments to collect on the Sales tab', () => {
  it('adds what is still owed after returns and counts overdue sales', () => {
    const sales = [sale('1180.00', '0.00', { id: 'a' }), sale('500.00', '200.00', { id: 'b' }), sale('300.00', '0.00', { returnedTotal: '300.00' }), sale('100.00', '100.00')];
    const card = pendingPaymentsCard(sales, { ready: true, filterOn: false, overdue: (bill) => (bill as { id?: string }).id === 'a' });
    expect(money(card.title)).toBe('₹1,480.00 to collect');
    expect(card.detail).toBe('2 unpaid sales · 1 overdue');
    expect(card.note).toBeNull();
    expect(card.showFilter).toBe(true);
    expect(money(card.accessibilityLabel)).toBe('₹1,480.00 to collect. 2 unpaid sales · 1 overdue');
    expect(money(card.chipLabel)).toBe('Unpaid · ₹1,480.00');
    expect(money(card.amount)).toBe('₹1,480.00');
  });
  it('says one sale, without an overdue count when none is late', () => {
    expect(pendingPaymentsCard([sale('50.00', '0.00')], { ready: true, filterOn: false, overdue: never }).detail).toBe('1 unpaid sale');
  });
  it('leaves out cancelled sales and hidden prices, and says when older sales have no recorded payment', () => {
    const card = pendingPaymentsCard([sale('900.00', '0.00', { status: 'CANCELLED' }), sale('400.00', null), sale('100.00', null), { total: null, amountPaid: null }], { ready: true, filterOn: false, overdue: never });
    expect(card.title).toBe('Nothing to collect');
    expect(card.detail).toBe('');
    expect(card.note).toBe('2 older sales without a recorded payment are not counted.');
    expect(card.showFilter).toBe(false);
    expect(card.chipLabel).toBe('Unpaid');
    expect(money(card.amount)).toBe('₹0.00');
    expect(pendingPaymentsCard([sale('400.00', null)], { ready: true, filterOn: false, overdue: never }).note).toBe('1 older sale without a recorded payment is not counted.');
  });
  it('keeps the filter switch while it is on, so it can be turned off', () => {
    expect(pendingPaymentsCard([], { ready: true, filterOn: true }).showFilter).toBe(true);
  });
  it('shows a dash and no switch while sales load', () => {
    const card = pendingPaymentsCard([sale('50.00', '0.00')], { ready: false, filterOn: true, overdue: never });
    expect(card).toMatchObject({ title: '—', detail: '', note: null, showFilter: false, accessibilityLabel: 'Payments to collect, loading', chipLabel: 'Unpaid', amount: '—' });
  });
  it('lists only the sales with money to collect', () => {
    expect(unpaidSales([sale('10.00', '0.00'), sale('10.00', '10.00'), sale('10.00', null)])).toHaveLength(1);
  });
});
