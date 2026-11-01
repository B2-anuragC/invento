import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NOTHING_RETURNED } from '@invento/shared';
import { planReturn, returnedSoFar, withReturns, type ReturnableBillLine } from './returns.js';

const line = (overrides: Partial<ReturnableBillLine> = {}): ReturnableBillLine => ({
  id: 'a', productId: 'p1', productName: 'Glass', productUnit: 'KG', piecesPerUnit: null,
  quantity: '3', lineTotal: '99.99', discountAmount: '10.00', taxAmount: '16.20', gstRate: '18',
  stockQuantity: '3', returned: NOTHING_RETURNED, ...overrides,
});

describe('planReturn', () => {
  it('reverses each line in proportion and totals the note', () => {
    const plan = planReturn([line(), line({ id: 'b', productId: 'p2', quantity: '1', lineTotal: '50.00', discountAmount: '0', taxAmount: '0', stockQuantity: '1' })], [{ itemId: 'a', quantity: '1' }, { itemId: 'b', quantity: '1' }]);
    expect(plan.lines.map((entry) => [entry.quantity, entry.stockQuantity, entry.lineTotal, entry.discountAmount, entry.taxAmount])).toEqual([['1', '1.000', '33.33', '3.33', '5.40'], ['1', '1.000', '50.00', '0.00', '0.00']]);
    expect(plan).toMatchObject({ subtotal: '83.33', discountTotal: '3.33', taxTotal: '5.40', total: '85.40' });
  });

  it('puts back the share of the stock the line took: a pack of 10 pieces, or pieces of a dozen', () => {
    const pack = line({ productUnit: 'PIECE', quantity: '2', lineTotal: '3400', discountAmount: '0', taxAmount: '0', stockQuantity: '20' });
    expect(planReturn([pack], [{ itemId: 'a', quantity: '1' }]).lines[0].stockQuantity).toBe('10.000');
    expect(() => planReturn([pack], [{ itemId: 'a', quantity: '0.05' }])).toThrow('Glass must be returned in whole pieces.');
    const dozen = line({ productUnit: 'DOZEN', piecesPerUnit: 12, quantity: '2', stockQuantity: '24' });
    expect(planReturn([dozen], [{ itemId: 'a', quantity: '0.5' }]).lines[0].stockQuantity).toBe('6.000');
  });

  it('gives the last return what is left of the stock', () => {
    const weighed = line({ quantity: '3', stockQuantity: '1.5' });
    expect(planReturn([weighed], [{ itemId: 'a', quantity: '2' }]).lines[0].stockQuantity).toBe('1.000');
    expect(planReturn([{ ...weighed, returned: { ...NOTHING_RETURNED, quantity: '2' } }], [{ itemId: 'a', quantity: '1' }]).lines[0].stockQuantity).toBe('0.500');
    // A third of 0.001 kg cannot be put back exactly.
    expect(() => planReturn([line({ stockQuantity: '0.001' })], [{ itemId: 'a', quantity: '1' }])).toThrow(/cannot be returned exactly/);
  });

  it('refuses more than is left, lines not on the bill, repeats and unknown stock', () => {
    expect(() => planReturn([line({ returned: { ...NOTHING_RETURNED, quantity: '2.5' } })], [{ itemId: 'a', quantity: '1' }])).toThrow('Glass: Only 0.5 can be returned.');
    expect(() => planReturn([line()], [{ itemId: 'x', quantity: '1' }])).toThrow(BadRequestException);
    expect(() => planReturn([line()], [{ itemId: 'a', quantity: '1' }, { itemId: 'a', quantity: '1' }])).toThrow(/only once/);
    expect(() => planReturn([line()], [])).toThrow(/at least one/);
    expect(() => planReturn([line({ stockQuantity: null })], [{ itemId: 'a', quantity: '1' }])).toThrow(ConflictException);
  });
});

describe('returnedSoFar and withReturns', () => {
  const decimal = (value: string) => new Prisma.Decimal(value);
  it('adds up earlier return lines', () => {
    expect(returnedSoFar([])).toBe(NOTHING_RETURNED);
    expect(returnedSoFar([{ quantity: decimal('1'), lineTotal: decimal('33.33'), discountAmount: decimal('3.33'), taxAmount: decimal('5.4') }, { quantity: decimal('0.5'), lineTotal: decimal('16.67'), taxAmount: decimal('2.7') }])).toEqual({ quantity: '1.5', lineTotal: '50.00', discountAmount: '3.33', taxAmount: '8.10' });
  });

  it('adds the net amount and the quantity returned of each line', () => {
    const bill = withReturns({ total: decimal('500'), returnedTotal: decimal('120.5'), items: [{ id: 'a', returnItems: [{ quantity: decimal('1') }, { quantity: decimal('0.5') }] }, { id: 'b' }] as Array<{ id: string; returnItems?: { quantity: Prisma.Decimal }[] }> });
    expect(bill.netTotal.toString()).toBe('379.5');
    expect(bill.items.map((item) => [item.id, item.returnedQuantity.toString(), 'returnItems' in item])).toEqual([['a', '1.5', false], ['b', '0', false]]);
  });
});
