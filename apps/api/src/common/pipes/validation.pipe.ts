import type { ValidationError } from 'class-validator';
import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe as NestValidationPipe,
} from '@nestjs/common';

/**
 * Every failed rule with the path of its field. Nested lines (a bill's items)
 * keep their position, as in "items.0.quantity", so the reason reaches the user
 * instead of only "Request validation failed.".
 */
export function validationDetails(errors: ValidationError[], parent = ''): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...validationDetails(error.children ?? [], field)];
  });
}

export const globalValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  exceptionFactory: (errors) => {
    return new UnprocessableEntityException({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: validationDetails(errors),
      },
    });
  },
});
