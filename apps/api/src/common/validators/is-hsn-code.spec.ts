import { HSN_RULE_MESSAGE } from '@invento/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateProductDto, UpdateProductDto } from '../../products/dto/product.dto.js';
import { storedHsnCode } from './is-hsn-code.js';

const dtos: Array<[string, new () => object, Record<string, unknown>]> = [
  ['CreateProductDto', CreateProductDto, { name: 'Clear Float Glass 5mm', sku: 'GLASS-5', unit: 'SQUARE_FOOT', purchasePrice: '40.00', sellingPrice: '55.00', minimumStock: '10' }],
  ['UpdateProductDto', UpdateProductDto, {}],
];
const hsnErrors = (dto: new () => object, base: Record<string, unknown>, hsnCode: unknown) =>
  validateSync(plainToInstance(dto, { ...base, hsnCode })).filter((error) => error.property === 'hsnCode');

describe.each(dtos)('%s hsnCode', (_name, dto, base) => {
  it('accepts 4, 6 or 8 digits with or without spaces, blank to clear, or no value', () => {
    for (const hsnCode of ['7005', '700529', '70052910', ' 7005 29 ', '', undefined]) expect(hsnErrors(dto, base, hsnCode)).toHaveLength(0);
  });

  it('rejects other lengths and letters with one clear message', () => {
    for (const hsnCode of ['700', '70052', '7005291', '700529101', 'HSN7005']) {
      const errors = hsnErrors(dto, base, hsnCode);
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0].constraints ?? {})).toEqual([HSN_RULE_MESSAGE]);
    }
    expect(hsnErrors(dto, base, 7005)).toHaveLength(1);
  });
});

describe('storedHsnCode', () => {
  it('stores digits only, clears blanks, and leaves undefined unchanged', () => {
    expect(storedHsnCode(' 7005 29 ')).toBe('700529');
    expect(storedHsnCode('  ')).toBeNull();
    expect(storedHsnCode(undefined)).toBeUndefined();
  });
});
