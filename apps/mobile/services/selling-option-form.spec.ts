import { describe, expect, it } from 'vitest';
import type { SellingOption } from './api';
import { chooseOptionUnit, defaultOptionName, newSellingOption, normalizeSellingOptions, optionPriceLabel, optionShape, optionSummary, optionUnitChoices, sellingOptionError, sellingOptionsForSave } from './selling-option-form';

const money = (value: string | null) => value?.replace(/ /g, ' ');
const option = (fields: Partial<SellingOption>): SellingOption => ({ id: 'o1', name: '', unit: 'PACK', quantity: '1', sellingPrice: '', ...fields });

describe('selling option units', () => {
  it('offers pieces, packs, boxes and dozens for counted products, and the same kind of measure otherwise', () => {
    expect(optionUnitChoices('PIECE')).toEqual(['PIECE', 'PACK', 'BOX', 'DOZEN']);
    expect(optionUnitChoices('BOX')).toEqual(['BOX', 'PIECE', 'PACK', 'DOZEN']);
    expect(optionUnitChoices('GRAM')).toEqual(['GRAM', 'KG']);
    expect(optionUnitChoices('SQUARE_FOOT')).toEqual(['SQUARE_FOOT']);
  });
  it('keeps an older option’s unit so it can still be edited', () => {
    expect(optionUnitChoices('KG', 'OTHER')).toEqual(['KG', 'GRAM', 'OTHER']);
    expect(optionShape('KG', option({ unit: 'OTHER' }), null)).toBe('custom');
  });
  it('starts a new option as a pack for products counted in pieces', () => {
    expect(newSellingOption('n', 'PIECE')).toEqual({ id: 'n', name: '', unit: 'PACK', quantity: '1', sellingPrice: '' });
    expect(newSellingOption('n', 'KG')).toEqual({ id: 'n', name: '', unit: 'KG', quantity: '', sellingPrice: '' });
    expect(newSellingOption('n', 'DOZEN').unit).toBe('DOZEN');
  });
  it('makes a pack, box or dozen one unit and clears its size when the unit changes', () => {
    expect(chooseOptionUnit(option({ unit: 'PIECE', quantity: '6', sellingPrice: '60' }), 'BOX', 'PIECE')).toEqual(option({ unit: 'BOX', quantity: '1', sellingPrice: '60' }));
    expect(chooseOptionUnit(option({ piecesPerUnit: 10 }), 'PIECE', 'PIECE')).toEqual(option({ unit: 'PIECE', quantity: '1' }));
    expect(chooseOptionUnit(option({ unit: 'KG', quantity: '5' }), 'GRAM', 'KG')).toMatchObject({ unit: 'GRAM', quantity: '5' });
  });
});

describe('selling option sentence', () => {
  it('reads "1 pack = 10 pieces" with the price per piece', () => {
    const pack = option({ piecesPerUnit: 10, sellingPrice: '1700' });
    expect(optionShape('PIECE', pack, null)).toBe('group');
    expect(money(optionSummary(pack, 'PIECE', null))).toBe('1 pack = 10 pieces for ₹1,700.00 · ₹170.00 per piece');
    expect(defaultOptionName(pack, 'PIECE', null)).toBe('Pack of 10');
    expect(optionPriceLabel(pack, 'PIECE', null)).toBe('Price for 1 pack');
  });
  it('uses the product’s own box size when the option is the stock unit', () => {
    const box = option({ unit: 'BOX', sellingPrice: '480' });
    expect(money(optionSummary(box, 'BOX', 24))).toBe('1 box = 24 pieces for ₹480.00 · ₹20.00 per piece');
    expect(sellingOptionError(box, 'BOX', 24)).toBe('');
    expect(sellingOptionError(option({ unit: 'PACK', sellingPrice: '480' }), 'BOX', null)).toBe('enter how many pieces are in one pack.');
  });
  it('sells a pack or box product with no pieces per pack by count, as the server allows', () => {
    const one = option({ unit: 'PACK', sellingPrice: '120' });
    expect(optionShape('PACK', one, null)).toBe('count');
    expect(sellingOptionError(one, 'PACK', null)).toBe('');
    expect(money(optionSummary(one, 'PACK', null))).toBe('1 pack for ₹120.00');
    expect(optionPriceLabel(one, 'PACK', null)).toBe('Price for 1 pack');
    const two = option({ unit: 'BOX', quantity: '2', sellingPrice: '900' });
    expect(optionShape('BOX', two, null)).toBe('count');
    expect(sellingOptionError(two, 'BOX', null)).toBe('');
    expect(defaultOptionName(two, 'BOX', null)).toBe('2 boxes');
    expect(sellingOptionError(newSellingOption('n', 'PACK'), 'PACK', null)).toBe('enter a price greater than zero.');
    expect(chooseOptionUnit(option({ unit: 'PIECE', quantity: '3' }), 'PACK', 'PACK')).toMatchObject({ unit: 'PACK', quantity: '1' });
    expect(optionShape('PACK', one, 10)).toBe('group');
  });
  it('shows a dozen as 12 pieces and a count of pieces or a measure as it is', () => {
    expect(money(optionSummary(option({ unit: 'DOZEN', sellingPrice: '170' }), 'PIECE', null))).toBe('1 dozen = 12 pieces for ₹170.00 · ₹14.17 per piece');
    expect(defaultOptionName(option({ unit: 'DOZEN' }), 'PIECE', null)).toBe('Dozen');
    const six = option({ unit: 'PIECE', quantity: '6', sellingPrice: '60' });
    expect(optionShape('PIECE', six, null)).toBe('count');
    expect(money(optionSummary(six, 'PIECE', null))).toBe('6 pieces for ₹60.00 · ₹10.00 per piece');
    expect(defaultOptionName(six, 'PIECE', null)).toBe('6 pieces');
    expect(optionPriceLabel(six, 'PIECE', null)).toBe('Price for 6 pieces');
    expect(defaultOptionName(option({ unit: 'PIECE', quantity: '1' }), 'PIECE', null)).toBe('Single piece');
    expect(money(optionSummary(option({ unit: 'KG', quantity: '5', sellingPrice: '250' }), 'KG', null))).toBe('5 kg for ₹250.00 · ₹50.00 per kg');
  });
  it('says nothing until the price and size are filled in', () => {
    expect(optionSummary(option({ sellingPrice: '' , piecesPerUnit: 10 }), 'PIECE', null)).toBeNull();
    expect(optionSummary(option({ sellingPrice: '100' }), 'PIECE', null)).toBeNull();
    expect(defaultOptionName(option({}), 'PIECE', null)).toBe('Pack');
  });
});

describe('older selling options', () => {
  it('rewrites "2 packs of 10" as one pack of 20 and "2 dozen" as 24 pieces, keeping the price', () => {
    expect(normalizeSellingOptions([option({ quantity: '2', piecesPerUnit: 10, sellingPrice: '3000', name: 'Two packs' })], 'PIECE', null)).toEqual([option({ quantity: '1', piecesPerUnit: 20, sellingPrice: '3000', name: 'Two packs' })]);
    expect(normalizeSellingOptions([option({ unit: 'DOZEN', quantity: '2', sellingPrice: '300' })], 'PIECE', null)).toEqual([option({ unit: 'PIECE', quantity: '24', sellingPrice: '300' })]);
    expect(normalizeSellingOptions([option({ unit: 'BOX', quantity: '3' })], 'BOX', 24)[0]).toMatchObject({ quantity: '1', piecesPerUnit: 72 });
  });
  it('leaves options that already fit, or cannot be rewritten, as they are', () => {
    const fits = [option({ piecesPerUnit: 10 }), option({ unit: 'PIECE', quantity: '6' })];
    expect(normalizeSellingOptions(fits, 'PIECE', null)).toEqual(fits);
    const unknownSize = [option({ quantity: '2' })];
    expect(normalizeSellingOptions(unknownSize, 'PIECE', null)).toEqual(unknownSize);
    expect(optionShape('PIECE', unknownSize[0], null)).toBe('custom');
    const measured = [option({ unit: 'KG', quantity: '2.5' })];
    expect(normalizeSellingOptions(measured, 'KG', null)).toBe(measured);
  });
});

describe('saving selling options', () => {
  it('checks the size, quantity, price and whole pieces', () => {
    expect(sellingOptionError(option({ sellingPrice: '100' }), 'PIECE', null)).toBe('enter how many pieces are in one pack.');
    expect(sellingOptionError(option({ piecesPerUnit: 10, sellingPrice: '0' }), 'PIECE', null)).toBe('enter a price greater than zero.');
    expect(sellingOptionError(option({ unit: 'PIECE', quantity: '1.5', sellingPrice: '10' }), 'PIECE', null)).toBe('the quantity must contain whole pieces.');
    expect(sellingOptionError(option({ unit: 'PIECE', quantity: '', sellingPrice: '10' }), 'PIECE', null)).toBe('enter a quantity greater than zero.');
    expect(sellingOptionError(option({ unit: 'PIECE', sellingPrice: '10' }), 'BOX', null)).toBe('enter pieces per box above to sell this product by the piece.');
    expect(sellingOptionError(option({ piecesPerUnit: 10, sellingPrice: '1700' }), 'PIECE', null)).toBe('');
    expect(sellingOptionError(option({ unit: 'GRAM', quantity: '0.5', sellingPrice: '1' }), 'KG', null)).toBe('use a quantity that fits the stock unit’s three-decimal precision.');
  });
  it('names an option without a typed name after its size', () => {
    expect(sellingOptionsForSave([option({ piecesPerUnit: 10, name: '  ' }), option({ unit: 'DOZEN', name: ' Family pack ' })], 'PIECE', null).map((entry) => entry.name)).toEqual(['Pack of 10', 'Family pack']);
  });
});
