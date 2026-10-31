import { GSTIN_RULE_MESSAGE, isGstStateCode, isValidGstin, normalizeGstin } from '@invento/shared';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/** A GSTIN (any case or spacing; services store it normalised). Blank strings pass so they can clear the field. */
export function IsGstin(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isGstin',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && (value.trim() === '' || isValidGstin(normalizeGstin(value))),
        defaultMessage: () => GSTIN_RULE_MESSAGE,
      },
    },
    options,
  );
}

/** A GST state code such as "27". Blank strings pass so they can clear the field. */
export function IsGstStateCode(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isGstStateCode',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && (value.trim() === '' || isGstStateCode(value.trim())),
        defaultMessage: () => 'Choose a valid GST state.',
      },
    },
    options,
  );
}

/** Stored form of an optional GSTIN: undefined leaves it unchanged, blank clears it. */
export function storedGstin(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeGstin(value);
  return normalized === '' ? null : normalized;
}
