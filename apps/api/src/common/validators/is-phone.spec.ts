import { PHONE_RULE_MESSAGE } from '@invento/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { RegisterDto, UpdateProfileDto } from '../../auth/dto/auth.dto.js';
import { CreateBusinessDto, UpdateBusinessDto } from '../../businesses/dto/business.dto.js';
import { CreateCustomerDto, UpdateCustomerDto } from '../../customers/dto/customer.dto.js';
import { CreateSupplierDto, UpdateSupplierDto } from '../../suppliers/dto/supplier.dto.js';

// Each DTO with a phone field, with the other fields it needs to be valid.
const dtos: Array<[string, new () => object, Record<string, unknown>]> = [
  ['CreateCustomerDto', CreateCustomerDto, { name: 'Shree Fabricators' }],
  ['UpdateCustomerDto', UpdateCustomerDto, {}],
  ['CreateSupplierDto', CreateSupplierDto, { name: 'Saint Glass' }],
  ['UpdateSupplierDto', UpdateSupplierDto, {}],
  ['CreateBusinessDto', CreateBusinessDto, { name: 'QA Glass', slug: 'qa-glass' }],
  ['UpdateBusinessDto', UpdateBusinessDto, {}],
  ['RegisterDto', RegisterDto, { name: 'QA Owner', email: 'owner@example.test', password: 'Valid#Pass1' }],
  ['UpdateProfileDto', UpdateProfileDto, { name: 'QA Owner' }],
];

const phoneErrors = (dto: new () => object, base: Record<string, unknown>, phone: unknown) =>
  validateSync(plainToInstance(dto, { ...base, phone })).filter((error) => error.property === 'phone');

describe.each(dtos)('%s phone', (_name, dto, base) => {
  it('accepts valid numbers', () => {
    for (const phone of ['9876543210', '+91 98765 43210', '(022) 2345-6789']) expect(phoneErrors(dto, base, phone)).toHaveLength(0);
  });

  it('accepts a blank value, which clears the number', () => {
    expect(phoneErrors(dto, base, '')).toHaveLength(0);
    expect(phoneErrors(dto, base, '   ')).toHaveLength(0);
  });

  it('accepts an omitted phone', () => {
    expect(validateSync(plainToInstance(dto, base))).toHaveLength(0);
  });

  it('rejects invalid numbers with the shared message', () => {
    for (const phone of ['abc12', '12345', '98765#43210', '1234567890123456']) {
      const errors = phoneErrors(dto, base, phone);
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0].constraints ?? {})).toContain(PHONE_RULE_MESSAGE);
    }
  });
});
