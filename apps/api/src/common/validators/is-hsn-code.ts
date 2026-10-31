import { HSN_RULE_MESSAGE, isValidHsnCode, normalizeHsnCode } from '@invento/shared';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/** An HSN code (spaces ignored; services store digits only). Blank strings pass so they can clear the field. */
export function IsHsnCode(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isHsnCode',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && (value.trim() === '' || isValidHsnCode(normalizeHsnCode(value))),
        defaultMessage: () => HSN_RULE_MESSAGE,
      },
    },
    options,
  );
}

/** Stored form of an optional HSN code: undefined leaves it unchanged, blank clears it. */
export function storedHsnCode(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeHsnCode(value);
  return normalized === '' ? null : normalized;
}
