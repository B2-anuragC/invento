import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { CreateProductDto } from './product.dto.js';

const productWithUnit = (unit: string) => Object.assign(new CreateProductDto(), {
  name: 'Window Mesh',
  sku: 'MESH-001',
  unit,
  purchasePrice: '10.00',
  sellingPrice: '15.00',
  minimumStock: '1.000',
});

describe('CreateProductDto', () => {
  it.each(['SQUARE_FOOT', 'FOOT'])('accepts %s as a product unit', (unit) => {
    expect(validateSync(productWithUnit(unit))).toHaveLength(0);
  });

  it('rejects units outside the supported API list', () => {
    const errors = validateSync(productWithUnit('INVALID_UNIT'));
    expect(errors.some((error) => error.property === 'unit')).toBe(true);
  });
  it('validates nested gallery file references and the six-photo limit', () => {
    const base = productWithUnit('PIECE');
    const image = { imageOriginal: `/files/${'a'.repeat(64)}/original` };
    expect(validateSync(plainToInstance(CreateProductDto, { ...base, images: [image] }))).toHaveLength(0);
    for (const images of [null, [{ imageOriginal: 'https://other/file' }], [{}], Array(7).fill(image)]) {
      expect(validateSync(plainToInstance(CreateProductDto, { ...base, images })).some((error) => error.property === 'images')).toBe(true);
    }
  });

});
