import { describe, expect, it } from 'vitest';
import { CreateSaleDto } from '../../sales/dto/sale.dto.js';
import { CreatePurchaseDto } from '../../purchases/dto/purchase.dto.js';
import { globalValidationPipe } from '../pipes/validation.pipe.js';

const shared = { expectedTotal: '118.00', amountPaid: '118.00', requestId: 'request_offline_1' };
describe('Offline transaction request validation', () => {
  it('accepts expectedTotal through the inherited sale DTO with strict whitelisting', async () => {
    const body = { ...shared, customerId: 'customer', saleDate: '2026-10-16T10:00:00Z', paymentMethod: 'CASH', items: [{ productId: 'product', quantity: '1', sellingPrice: '100.00' }] };
    const result = await globalValidationPipe.transform(body, { type: 'body', metatype: CreateSaleDto });
    expect(result.expectedTotal).toBe('118.00');
  });
  it('accepts expectedTotal through the inherited purchase DTO with strict whitelisting', async () => {
    const body = { ...shared, supplierId: 'supplier', purchaseDate: '2026-10-16T10:00:00Z', items: [{ productId: 'product', quantity: '1', purchasePrice: '100.00' }] };
    const result = await globalValidationPipe.transform(body, { type: 'body', metatype: CreatePurchaseDto });
    expect(result.expectedTotal).toBe('118.00');
  });
});
