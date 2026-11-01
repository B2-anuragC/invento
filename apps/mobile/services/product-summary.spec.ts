import { describe, expect, it } from 'vitest';
import { groupSizeLabel, sellingOptionRows, stockWarning, taxSummary } from './product-summary';

const money = (value: string) => value.replace(/ /g, ' ');

describe('product page stock warning', () => {
  it('says nothing while stock is at or above the minimum level', () => {
    expect(stockWarning(20, 20, 'PIECE')).toBeNull();
    expect(stockWarning(5, 0, 'PIECE')).toBeNull();
  });
  it('warns when stock is below the minimum and says how much reaches it', () => {
    expect(stockWarning(4.9, 20, 'KG')).toEqual({ tone: 'low', title: 'Low stock', message: 'Below the minimum level of 20 kg. Add 15.1 kg to reach it.' });
    expect(stockWarning(1, 2, 'BOX')?.message).toBe('Below the minimum level of 2 boxes. Add 1 box to reach it.');
  });
  it('shows out of stock at zero, even without a minimum level', () => {
    expect(stockWarning(0, 0, 'PIECE')).toMatchObject({ tone: 'out', title: 'Out of stock' });
    expect(stockWarning(0, 10, 'PIECE')?.tone).toBe('out');
  });
});

describe('product page tax details', () => {
  it('shows the rate, the HSN code and the default price with GST added', () => {
    const summary = taxSummary({ gstRate: '18.00', hsnCode: '830241', sellingPrice: '450.00', unit: 'PIECE' });
    expect(summary.gst).toBe('18% GST');
    expect(summary.hsn).toBe('830241');
    expect(money(summary.priceWithGst ?? '')).toBe('₹531.00 / piece with GST');
  });
  it('rounds the GST to the paisa, half up', () => {
    expect(money(taxSummary({ gstRate: '5', hsnCode: null, sellingPrice: '0.10', unit: 'KG' }).priceWithGst ?? '')).toBe('₹0.11 / kg with GST');
    expect(money(taxSummary({ gstRate: '12.5', hsnCode: null, sellingPrice: '99.99', unit: 'PIECE' }).priceWithGst ?? '')).toBe('₹112.49 / piece with GST');
  });
  it('says when there is no GST or HSN code', () => {
    expect(taxSummary({ gstRate: '0.00', hsnCode: '', sellingPrice: '10', unit: 'PIECE' })).toEqual({ gst: 'No GST (0%)', hsn: null, priceWithGst: null });
    expect(taxSummary({ sellingPrice: '10', unit: 'PIECE' }).gst).toBe('No GST (0%)');
  });
});

describe('product page selling options', () => {
  it('describes the size of a group of pieces', () => {
    expect(groupSizeLabel('PACK', 10)).toBe('1 pack = 10 pieces');
    expect(groupSizeLabel('DOZEN', null)).toBe('1 dozen = 12 pieces');
    expect(groupSizeLabel('BOX', null)).toBeNull();
    expect(groupSizeLabel('PIECE', 4)).toBeNull();
  });
  it('lists each option with its price per unit and the stock one sale takes', () => {
    const rows = sellingOptionRows({ unit: 'PIECE', piecesPerUnit: null }, [
      { id: 'a', name: 'Pack of 10', unit: 'PACK', quantity: '1', sellingPrice: '400.00', piecesPerUnit: 10 },
      { id: 'b', name: 'Pair', unit: 'PIECE', quantity: '2', sellingPrice: '90.00' },
    ]).map((row) => ({ ...row, price: money(row.price), perUnit: row.perUnit && money(row.perUnit) }));
    expect(rows).toEqual([
      { id: 'a', name: 'Pack of 10', price: '1 pack for ₹400.00', perUnit: null, stock: 'Takes 10 pieces from stock' },
      { id: 'b', name: 'Pair', price: '2 pieces for ₹90.00', perUnit: '₹45.00 / piece', stock: null },
    ]);
  });
  it('converts measures and treats a custom unit as one stock item', () => {
    const [grams, custom] = sellingOptionRows({ unit: 'KG' }, [
      { id: 'g', name: 'Half kilo', unit: 'GRAM', quantity: '500', sellingPrice: '60' },
      { id: 'c', name: 'Bag', unit: 'OTHER', quantity: '1', sellingPrice: '100' },
    ]);
    expect(grams.stock).toBe('Takes 0.5 kg from stock');
    expect(custom).toMatchObject({ perUnit: null, stock: 'Takes 1 kg from stock' });
  });
  it('returns no rows when the product has no options', () => {
    expect(sellingOptionRows({ unit: 'PIECE' }, undefined)).toEqual([]);
  });
});
