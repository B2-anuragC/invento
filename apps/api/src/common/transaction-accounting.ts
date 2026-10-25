import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RecordPaymentDto } from './dto/transaction-finance.dto.js';

export function taxFor(subtotal: Prisma.Decimal, value: Prisma.Decimal | string | undefined) {
  const rate = new Prisma.Decimal(value ?? 0);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(100) || rate.decimalPlaces() > 2) throw new BadRequestException('GST rate must be between 0 and 100 with up to two decimal places.');
  return { gstRate: rate, taxAmount: subtotal.times(rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) };
}
export function paidAmount(value: string | undefined, total: Prisma.Decimal) {
  if (value === undefined) return null;
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) throw new BadRequestException('Invalid payment amount.');
  const paid = new Prisma.Decimal(value);
  if (paid.lt(0) || paid.gt(total)) throw new BadRequestException('Payment cannot exceed the transaction total.');
  return paid;
}
export function dueDateFor(value: string | undefined, date: Date) {
  if (!value) return null;
  const due = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== value || value < date.toISOString().slice(0, 10)) throw new BadRequestException('Due date must be a valid date on or after the transaction date.');
  return due;
}

/** Serializes payments with the transaction row lock, so concurrent payments cannot overpay. */
export async function recordTransactionPayment(prisma: PrismaService, kind: 'sale' | 'purchase', businessId: string, userId: string, id: string, input: RecordPaymentDto) {
  const amount = paidAmount(input.amount, new Prisma.Decimal('999999999999.99'))!;
  if (!amount || amount.lte(0)) throw new BadRequestException('Payment must be greater than zero.');
  if (!Object.values(PaymentMethod).includes(input.method)) throw new BadRequestException('Invalid payment method.');
  return prisma.$transaction(async (tx) => {
    const [record] = await tx.$queryRaw<{ total: Prisma.Decimal; amountPaid: Prisma.Decimal | null; status: string }[]>(Prisma.sql`SELECT total, "amountPaid", status FROM ${Prisma.raw(kind === 'sale' ? 'sales' : 'purchases')} WHERE id = ${id} AND "businessId" = ${businessId} FOR UPDATE`);
    if (!record) throw new NotFoundException('Transaction not found.');
    if (record.status !== 'COMPLETED') throw new ConflictException('Payments require a completed transaction.');
    const duplicate = await tx.transactionPayment.findUnique({ where: { businessId_requestId: { businessId, requestId: input.requestId } } });
    if (duplicate) {
      if ((kind === 'sale' ? duplicate.saleId : duplicate.purchaseId) !== id || !duplicate.amount.eq(amount) || duplicate.method !== input.method) throw new ConflictException('This payment request has already been used.');
      return duplicate;
    }
    let alreadyPaid = record.amountPaid;
    if (alreadyPaid === null) {
      if (input.openingAmountPaid === undefined) throw new BadRequestException('Confirm the previously paid amount for this historical transaction first.');
      alreadyPaid = paidAmount(input.openingAmountPaid, record.total)!;
    }
    if (alreadyPaid.plus(amount).gt(record.total)) throw new BadRequestException('Payment exceeds the remaining balance.');
    const link = kind === 'sale' ? { saleId: id } : { purchaseId: id };
    if (record.amountPaid === null && alreadyPaid.gt(0)) await tx.transactionPayment.create({ data: { ...link, businessId, requestId: `${input.requestId}_opening`, amount: alreadyPaid, method: input.method, kind: 'OPENING_BALANCE', createdByUserId: userId } });
    const payment = await tx.transactionPayment.create({ data: { ...link, businessId, requestId: input.requestId, amount, method: input.method, createdByUserId: userId } });
    if (kind === 'sale') await tx.sale.update({ where: { id }, data: { amountPaid: alreadyPaid.plus(amount) } });
    else await tx.purchase.update({ where: { id }, data: { amountPaid: alreadyPaid.plus(amount) } });
    return payment;
  });
}
