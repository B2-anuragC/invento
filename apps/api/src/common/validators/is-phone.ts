import { isValidPhone, PHONE_RULE_MESSAGE } from '@invento/shared';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/** Validates a phone number with the shared client/server rule. Blank strings pass so they can clear the field. */
export function IsPhone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isPhone',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && (value.trim() === '' || isValidPhone(value)),
        defaultMessage: () => PHONE_RULE_MESSAGE,
      },
    },
    options,
  );
}
