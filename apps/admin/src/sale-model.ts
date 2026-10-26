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
export function saleTotals(lines: SaleLine[]) {
  let subtotal = 0n,
    tax = 0n;
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
    tax += (amount * scaled(rate, 2) + 5000n) / 10000n;
  }
  if (subtotal + tax > 99999999999999n)
    throw new Error("This sale total is too large.");
  return {
    subtotal: Number(subtotal) / 100,
    tax: Number(tax) / 100,
    total: Number(subtotal + tax) / 100,
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
