import { chargeGstError, chargesGst, discountAmountFor, discountError, lineGstRate, sellingUnitConversion, splitDiscount, WALK_IN_PAYMENT_MESSAGE } from "@invento/shared";
import type {
  CreateSaleInput,
  CreatePurchaseInput,
  CustomerRecord,
  ProductRecord,
  SupplierRecord,
  SaleRecord,
  PurchaseRecord,
} from "./api";
import type { OfflineSnapshot } from "./offline-model";
import { provisionalSaleGst } from "./gst";
import { validDueDate } from "./transaction-accounting";

export type TransactionKind = "sale" | "purchase";
export type TransactionRecord = SaleRecord | PurchaseRecord;
export type StockMovement = { productId: string; quantity: number };
export type ProductExpectation = { productId: string; signature: string };
const scaled = (value: string, digits: number) => {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0"))
  );
};
const decimal = (cents: bigint) =>
  `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
const rounded = (value: bigint, denominator: bigint) =>
  (value + denominator / 2n) / denominator;
/**
 * What a pending bill relied on for a product. A bill without GST does not
 * depend on the product's GST rate, so changing it does not hold the bill back.
 */
export function productSignature(product: ProductRecord, optionId?: string, chargeGst?: boolean) {
  const option = product.sellingOptions?.find((entry) => entry.id === optionId);
  return JSON.stringify([
    product.status,
    product.unit,
    product.piecesPerUnit ?? null,
    Number(lineGstRate(product.gstRate, chargeGst)),
    ...(optionId
      ? [
          optionId,
          option?.name,
          option?.unit,
          option?.quantity,
          option?.sellingPrice,
          option?.piecesPerUnit ?? null,
        ]
      : []),
  ]);
}

/** Builds a provisional record and stock movement before the atomic SQLite outbox write. */
export function buildOfflineTransaction(
  view: OfflineSnapshot,
  kind: TransactionKind,
  input: CreateSaleInput | CreatePurchaseInput,
) {
  if (!view.access.permissions?.includes(kind === "sale" ? "sales.create" : "purchases.create"))
    throw new Error("Transaction creation permission is unavailable.");
  if (!input.requestId || !/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId))
    throw new Error("A transaction request ID is required.");
  const sale = kind === "sale" ? (input as CreateSaleInput) : undefined;
  const purchase =
    kind === "purchase" ? (input as CreatePurchaseInput) : undefined;
  const contact = sale
    ? view.customers.find((entry) => entry.id === sale.customerId)
    : view.suppliers.find((entry) => entry.id === purchase!.supplierId);
  if (!contact || contact.status !== "ACTIVE")
    throw new Error("Select an active contact downloaded to this device.");
  const date = sale?.saleDate ?? purchase!.purchaseDate;
  if (!Number.isFinite(Date.parse(date)))
    throw new Error("Enter a valid transaction date.");
  if (
    !validDueDate(input.dueDate ?? "") ||
    (input.dueDate && input.dueDate < new Date(date).toISOString().slice(0, 10))
  )
    throw new Error("Due date must be on or after the transaction date.");
  const method = input.paymentMethod ?? "CASH";
  if (!["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"].includes(method))
    throw new Error("Select a valid payment method.");
  if (!input.items.length) throw new Error("Add at least one item.");
  // The same GST choice the server applies: only an explicit false turns it
  // off, and only a shop with a GSTIN may charge GST on a sale.
  if (input.chargeGst !== undefined && typeof input.chargeGst !== "boolean")
    throw new Error("Choose whether this bill charges GST.");
  const gstChoiceError = sale
    ? chargeGstError({ chargeGst: input.chargeGst, sellerGstin: view.business?.gstin })
    : "";
  if (gstChoiceError) throw new Error(gstChoiceError);
  const chargeGst = chargesGst(input.chargeGst);
  // Sales may list a product on separate lines sold differently (a pack and
  // loose pieces), matching the API; purchases keep one line per product.
  const seen = new Set<string>();
  const reserved = new Map<string, number>();
  const movements: StockMovement[] = [];
  const expectations: ProductExpectation[] = [];
  let subtotal = 0n,
    taxTotal = 0n;
  const id = `local_${input.requestId}`;
  const items = input.items.map((line, index) => {
    const lineKey = sale
      ? `${line.productId}|${(line as CreateSaleInput["items"][number]).sellingOptionId ?? ""}|${(line as CreateSaleInput["items"][number]).unit ?? ""}`
      : line.productId;
    if (seen.has(lineKey))
      throw new Error(
        sale
          ? "This product is already on the bill sold the same way. Combine the quantity into one line."
          : "Each product can appear only once in a transaction.",
      );
    seen.add(lineKey);
    const product = view.products.find(
      (entry) => entry.id === line.productId,
    ) as ProductRecord | undefined;
    if (!product || product.status !== "ACTIVE")
      throw new Error("Select active products downloaded to this device.");
    if (purchase) {
      const supplier = view.suppliers.find(
        (entry) => entry.id === purchase.supplierId,
      )! as SupplierRecord;
      if (
        (supplier.categories?.length || supplier.productIds?.length) &&
        !supplier.productIds?.includes(product.id) &&
        !(product.category && supplier.categories?.includes(product.category))
      )
        throw new Error(
          "This product is not assigned to the selected supplier.",
        );
    }
    const saleLine = sale
      ? (line as CreateSaleInput["items"][number])
      : undefined;
    const option = product.sellingOptions?.find(
      (entry) => entry.id === saleLine?.sellingOptionId,
    );
    if (saleLine?.sellingOptionId && !option)
      throw new Error("This selling option is no longer available.");
    const unit = option?.unit ?? saleLine?.unit ?? product.unit;
    const price =
      option?.sellingPrice ??
      (saleLine
        ? saleLine.sellingPrice
        : (line as CreatePurchaseInput["items"][number]).purchasePrice);
    if (
      !/^\d{1,9}(?:\.\d{1,3})?$/.test(line.quantity) ||
      Number(line.quantity) <= 0
    )
      throw new Error(
        "Enter a positive quantity with up to three decimal places.",
      );
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0)
      throw new Error("Enter a positive price with up to two decimal places.");
    if (
      (unit === "PIECE" || option) &&
      !Number.isInteger(Number(line.quantity))
    )
      throw new Error("Enter a whole number of pieces or selling options.");
    let stockQuantity = Number(line.quantity);
    if (sale) {
      if (
        !option &&
        unit !== product.unit &&
        !(unit === "PIECE" && product.piecesPerUnit)
      )
        throw new Error("Unsupported selling unit.");
      const conversion = sellingUnitConversion(
        product.unit,
        product.piecesPerUnit,
        unit,
        option?.piecesPerUnit,
      );
      if (!conversion)
        throw new Error("This selling option needs a valid stock conversion.");
      const movement =
        (stockQuantity *
          (conversion.perOption ? 1 : Number(option?.quantity ?? 1)) *
          conversion.numerator) /
        conversion.denominator;
      const pieces =
        movement *
        (conversion.unit === "PIECE" ? 1 : (product.piecesPerUnit ?? 1));
      if (
        (product.piecesPerUnit || product.unit === "PIECE") &&
        Math.abs(pieces - Math.round(pieces)) > 1e-8
      )
        throw new Error("Quantity must represent whole pieces.");
      if (Math.abs(movement * 1000 - Math.round(movement * 1000)) > 1e-7)
        throw new Error("Quantity exceeds supported stock precision.");
      stockQuantity =
        movement /
        (conversion.unit === "PIECE" ? (product.piecesPerUnit ?? 1) : 1);
      const alreadyReserved = reserved.get(product.id) ?? 0;
      if (
        alreadyReserved + stockQuantity >
        Number(
          view.inventory.find((entry) => entry.productId === product.id)
            ?.quantity ?? 0,
        ) +
          1e-9
      )
        throw new Error(
          `Insufficient stock for ${product.name} on this device.`,
        );
      reserved.set(product.id, alreadyReserved + stockQuantity);
    } else if (
      product.piecesPerUnit &&
      Math.abs(
        stockQuantity * product.piecesPerUnit -
          Math.round(stockQuantity * product.piecesPerUnit),
      ) > 1e-8
    )
      throw new Error("Quantity must represent whole pieces.");
    movements.push({
      productId: product.id,
      quantity: stockQuantity * (sale ? -1 : 1),
    });
    expectations.push({
      productId: product.id,
      signature: productSignature(product, saleLine?.sellingOptionId, input.chargeGst),
    });
    const rate = lineGstRate(product.gstRate, chargeGst);
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(rate) || Number(rate) > 100)
      throw new Error("Invalid product GST rate.");
    const lineTotal = rounded(
      scaled(line.quantity, 3) * scaled(price, 2),
      1000n,
    );
    subtotal += lineTotal;
    return {
      id: `${id}_${index}`,
      productId: product.id,
      quantity: line.quantity,
      unit,
      ...(sale
        ? {
            sellingPrice: price,
            sellingOptionId: saleLine?.sellingOptionId,
            optionName: option?.name,
            unitsPerOption: option?.quantity ?? "1",
            hsnCode: product.hsnCode || null,
            // Stock the line takes, as the server keeps it (pieces for grouped products), for returns.
            stockQuantity: (Math.round(stockQuantity * (product.piecesPerUnit ?? 1) * 1000) / 1000).toFixed(3),
          }
        : { purchasePrice: price }),
      gstRate: rate,
      taxAmount: "0.00",
      lineTotal: decimal(lineTotal),
      product: { name: product.name, sku: product.sku, unit: product.unit },
    };
  });
  // A sale's discount is split across the lines before GST, as the server does,
  // so the provisional total matches the one the server confirms.
  const discount = sale ? { discountAmount: sale.discountAmount, discountPercent: sale.discountPercent } : {};
  const invalidDiscount = discountError(decimal(subtotal), discount);
  if (invalidDiscount) throw new Error(invalidDiscount);
  const discountTotal = discountAmountFor(decimal(subtotal), discount);
  const shares = splitDiscount(items.map((item) => item.lineTotal), discountTotal);
  for (const [index, item] of items.entries()) {
    const tax = rounded((scaled(item.lineTotal, 2) - scaled(shares[index], 2)) * scaled(item.gstRate, 2), 10000n);
    taxTotal += tax;
    Object.assign(item, { taxAmount: decimal(tax) }, sale ? { discountAmount: shares[index] } : {});
  }
  const total = subtotal - scaled(discountTotal, 2) + taxTotal;
  if (sale && (contact as CustomerRecord).isWalkIn && (sale.amountPaid === undefined || scaled(sale.amountPaid, 2) !== total))
    throw new Error(WALK_IN_PAYMENT_MESSAGE);
  if (total > 99999999999999n)
    throw new Error("Transaction total exceeds the supported range.");
  if (
    input.amountPaid !== undefined &&
    (!/^\d{1,12}(?:\.\d{1,2})?$/.test(input.amountPaid) ||
      scaled(input.amountPaid, 2) > total)
  )
    throw new Error("Payment cannot exceed the total.");
  const common = {
    id,
    requestId: input.requestId,
    syncState: "pending" as const,
    subtotal: decimal(subtotal),
    taxTotal: decimal(taxTotal),
    chargeGst,
    total: decimal(total),
    amountPaid: input.amountPaid ?? null,
    dueDate: input.dueDate ?? null,
    paymentMethod: method,
    payments: [],
    items,
  };
  const record = (
    sale
      ? {
          ...common,
          // The same GST details the server copies when this bill syncs.
          ...provisionalSaleGst(view.business, contact as CustomerRecord),
          referenceImage: sale.referenceImage,
          discountTotal,
          discountPercent: sale.discountPercent || null,
          customer: contact,
          saleDate: date,
          invoiceNumber: null,
        }
      : {
          ...common,
          attachment: purchase!.attachment,
          supplier: contact,
          purchaseDate: date,
          invoiceNumber: purchase!.invoiceNumber,
        }
  ) as TransactionRecord;
  return { record, movements, expectations };
}
