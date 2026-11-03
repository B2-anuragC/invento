import { PASSWORD_RULE_MESSAGE } from "@invento/shared";

type ErrorBody = {
  message?: unknown;
  error?: { message?: unknown; details?: unknown };
};

// Field names whose plain wording is not their split camel case.
const fieldNames: Record<string, string> = {
  sku: "SKU",
  gstin: "GSTIN",
  gstRate: "GST rate",
  hsnCode: "HSN code",
  productId: "Product",
  customerId: "Customer",
  supplierId: "Supplier",
  sellingOptionId: "Selling option",
  requestId: "Request reference",
  stateCode: "State",
  imageOriginal: "Image",
  imageThumbnail: "Image",
};

/** "purchasePrice" → "Purchase price"; known short forms keep their capitals. */
export function fieldName(key: string): string {
  if (fieldNames[key]) return fieldNames[key];
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase();
  return words.replace(/\b(gst|hsn|upi|sku)\b/g, (short) => short.toUpperCase()).replace(/^./, (first) => first.toUpperCase());
}

// class-validator's default wording, rewritten. Each gets the field's name and the captured values.
const rules: [RegExp, (name: string, ...values: string[]) => string][] = [
  [/^must be an email$/, () => "Enter a valid email address."],
  [/^is not strong enough$/, () => PASSWORD_RULE_MESSAGE],
  [/^should not be empty$/, (name) => `${name} is required.`],
  [/^(?:is not a valid decimal number\.?|must be a number string|must be a number conforming to the specified constraints)$/, (name) => `${name} must be a number.`],
  [/^must be an integer number$/, (name) => `${name} must be a whole number.`],
  [/^must be a positive number$/, (name) => `${name} must be more than zero.`],
  [/^must not be less than (\S+)$/, (name, min) => `${name} must be at least ${min}.`],
  [/^must not be greater than (\S+)$/, (name, max) => `${name} must be at most ${max}.`],
  [/^must be longer than or equal to (\d+) characters$/, (name, min) => `${name} must be at least ${min} characters.`],
  [/^must be shorter than or equal to (\d+) characters$/, (name, max) => `${name} must be at most ${max} characters.`],
  [/^must match .* regular expression$/, (name) => `${name} is not in the right format.`],
  [/^must be one of the following values: .*$/, (name) => `Choose a valid ${name.toLowerCase()}.`],
  [/^must be a valid enum value$/, (name) => `Choose a valid ${name.toLowerCase()}.`],
  [/^must be a valid ISO 8601 date string$/, (name) => `${name} must be a valid date.`],
  [/^must be a Date instance$/, (name) => `${name} must be a valid date.`],
  [/^must be a boolean value$/, (name) => `${name} must be yes or no.`],
  [/^must be a string$/, (name) => `${name} must be text.`],
  [/^must be a URL address$/, (name) => `${name} must be a web address.`],
  [/^must be an array$/, (name) => `${name} must be a list.`],
  [/^must contain at least (\d+) elements$/, (name, min) => (name === "Items" ? `Add at least ${min} item${min === "1" ? "" : "s"}.` : `${name} needs at least ${min} entries.`)],
  [/^must contain no more than (\d+) elements$/, (name, max) => `${name} can have at most ${max} entries.`],
];

/**
 * One validation reason in plain words. The API names the field by its path
 * ("items.1.quantity" for the second line); a message the API already wrote
 * for people is kept as it is.
 */
export function readableDetail(field: unknown, message: string): string {
  const path = typeof field === "string" && field ? field.split(".") : [];
  const key = path[path.length - 1] ?? "";
  const line = path.length >= 3 && /^\d+$/.test(path[path.length - 2]) ? Number(path[path.length - 2]) + 1 : null;
  const prefix = line ? `Item ${line}: ` : "";
  const unknown = /^property (\S+) should not exist$/.exec(message);
  if (unknown) return `${prefix}${fieldName(unknown[1])} is not accepted here.`;
  if (!key || !message.startsWith(`${key} `)) return prefix + message;
  const rest = message.slice(key.length + 1);
  for (const [pattern, write] of rules) {
    const found = pattern.exec(rest);
    if (found) return prefix + write(fieldName(key), ...found.slice(1));
  }
  // An unknown rule still reads better with the field's name.
  return `${prefix}${fieldName(key)} ${rest}${/[.!?]$/.test(rest) ? "" : "."}`;
}

/**
 * The API wraps validation failures as "Request validation failed." with the
 * reasons in `details`; show those reasons so the user knows what to fix.
 */
export function apiErrorMessage(body: unknown, status: number): string {
  const { error, message } = (body && typeof body === "object" ? body : {}) as ErrorBody;
  // One reason per field: a field failing two rules (a pattern and "a number") reads once.
  const byField = new Map<string, string>();
  if (Array.isArray(error?.details))
    error.details.forEach((detail, index) => {
      if (!detail || typeof detail !== "object") return;
      const { field, message: reason } = detail as { field?: unknown; message?: unknown };
      if (typeof reason !== "string" || !reason) return;
      const key = typeof field === "string" && field ? field : `#${index}`;
      const text = readableDetail(field, reason);
      const previous = byField.get(key);
      if (!previous || (previous.endsWith("is not in the right format.") && !text.endsWith("is not in the right format."))) byField.set(key, text);
    });
  const details = [...byField.values()];
  if (details.length) return [...new Set(details)].join(" ");
  if (typeof error?.message === "string" && error.message) return error.message;
  if (typeof message === "string" && message) return message;
  return `Request failed (${status}).`;
}
