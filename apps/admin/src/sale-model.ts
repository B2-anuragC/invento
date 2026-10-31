import { discountAmountFor, discountError, splitDiscount, type DiscountInput } from "@invento/shared";

export type SaleProduct = {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  sellingPrice: string;
  gstRate?: string | number;
  sellingOptions?: {
    id: string;
    name: string;
    sellingPrice: string;
    unit: string;
  }[];
};
export type SaleLine = {
  product: SaleProduct;
  quantity: string;
  price: string;
  optionId?: string;
};
const paise = (value: string) => BigInt(value.replace(".", ""));
const decimal = (value: bigint) =>
  `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;

/**
 * Bill totals exactly as the API computes them: each line rounded half-up,
 * a bill discount split across the lines before GST, GST rounded per line.
 */
export function saleTotals(lines: SaleLine[], discount: DiscountInput = {}) {
  let subtotal = 0n,
    tax = 0n;
  const amounts: bigint[] = [];
  const rates: bigint[] = [];
  for (const line of lines) {
    if (
      !/^\d{1,9}(?:\.\d{1,3})?$/.test(line.quantity) ||
      Number(line.quantity) <= 0
    )
      throw new Error("Enter a positive quantity with up to 3 decimal places.");
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(line.price) || Number(line.price) <= 0)
      throw new Error("Enter a positive price with up to 2 decimal places.");
    const scaled = (value: string, digits: number) => {
      const [whole, decimal = ""] = value.split(".");
      return BigInt(whole + decimal.padEnd(digits, "0"));
    };
    const amount =
      (scaled(line.quantity, 3) * scaled(line.price, 2) + 500n) / 1000n;
    const rate = String(line.product.gstRate ?? 0);
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(rate))
      throw new Error("This product has an invalid tax rate.");
    subtotal += amount;
    amounts.push(amount);
    rates.push(scaled(rate, 2));
  }
  const invalid = discountError(decimal(subtotal), discount);
  if (invalid) throw new Error(invalid);
  const discountTotal = discountAmountFor(decimal(subtotal), discount);
  const shares = splitDiscount(amounts.map(decimal), discountTotal);
  amounts.forEach((amount, index) => {
    tax += ((amount - paise(shares[index])) * rates[index] + 5000n) / 10000n;
  });
  const total = subtotal - paise(discountTotal) + tax;
  if (total > 99999999999999n) throw new Error("This sale total is too large.");
  return {
    subtotal: Number(subtotal) / 100,
    discount: Number(paise(discountTotal)) / 100,
    tax: Number(tax) / 100,
    total: Number(total) / 100,
  };
}
export function paymentAmount(mode: string, total: number, paid: string) {
  if (mode === "credit") return "0.00";
  if (mode === "full") return total.toFixed(2);
  if (
    !/^\d{1,12}(?:\.\d{1,2})?$/.test(paid) ||
    Number(paid) <= 0 ||
    Number(paid) >= total
  )
    throw new Error(
      "Partial payment must be greater than zero and less than the total.",
    );
  return Number(paid).toFixed(2);
}
