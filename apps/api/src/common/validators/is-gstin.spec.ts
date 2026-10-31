import { GSTIN_RULE_MESSAGE } from '@invento/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateBusinessDto } from '../../businesses/dto/business.dto.js';
import { CreateCustomerDto, UpdateCustomerDto } from '../../customers/dto/customer.dto.js';
import { CreateSupplierDto, UpdateSupplierDto } from '../../suppliers/dto/supplier.dto.js';
import { storedGstin } from './is-gstin.js';

const VALID = '27AAPFU0939F1ZV';
const dtos: Array<[string, new () => object, Record<string, unknown>]> = [
  ['CreateCustomerDto', CreateCustomerDto, { name: 'Shree Fabricators' }],
  ['UpdateCustomerDto', UpdateCustomerDto, {}],
  ['CreateSupplierDto', CreateSupplierDto, { name: 'Saint Glass' }],
  ['UpdateSupplierDto', UpdateSupplierDto, {}],
  ['UpdateBusinessDto', UpdateBusinessDto, {}],
];
const gstinErrors = (dto: new () => object, base: Record<string, unknown>, gstin: unknown) =>
  validateSync(plainToInstance(dto, { ...base, gstin })).filter((error) => error.property === 'gstin');

describe.each(dtos)('%s gstin', (_name, dto, base) => {
  it('accepts a valid GSTIN in any case or spacing, and blank to clear', () => {
    for (const gstin of [VALID, '27aapfu0939f1zv', ' 27AAPFU 0939F1ZV ', '']) expect(gstinErrors(dto, base, gstin)).toHaveLength(0);
  });

  it('rejects malformed GSTINs with one clear message', () => {
    for (const gstin of ['27AAPFU0939F1ZW', '27AAPFU0939F1Z', '00AAPFU0939F1ZV', 'GSTIN']) {
      const errors = gstinErrors(dto, base, gstin);
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0].constraints ?? {})).toContain(GSTIN_RULE_MESSAGE);
    }
  });
});

describe('UpdateBusinessDto stateCode and email', () => {
  const errors = (body: Record<string, unknown>) => validateSync(plainToInstance(UpdateBusinessDto, body)).map((error) => error.property);

  it('accepts known GST state codes and blank', () => {
    expect(errors({ stateCode: '27' })).toEqual([]);
    expect(errors({ stateCode: '' })).toEqual([]);
    expect(errors({ stateCode: '39' })).toEqual(['stateCode']);
    expect(errors({ stateCode: 'MH' })).toEqual(['stateCode']);
  });

  it('allows clearing the email with an empty string', () => {
    expect(errors({ email: '' })).toEqual([]);
    expect(errors({ email: 'not-an-email' })).toEqual(['email']);
  });
});

describe('storedGstin', () => {
  it('normalises, clears blanks, and leaves undefined unchanged', () => {
    expect(storedGstin(' 27aapfu0939f1zv ')).toBe(VALID);
    expect(storedGstin('  ')).toBeNull();
    expect(storedGstin(undefined)).toBeUndefined();
  });
});
