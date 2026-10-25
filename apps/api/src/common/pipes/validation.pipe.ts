import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe as NestValidationPipe,
} from '@nestjs/common';

export const globalValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  exceptionFactory: (errors) => {
    const formattedErrors = errors.flatMap((error) => {
      const constraints = error.constraints ? Object.values(error.constraints) : [];
      return constraints.map((message) => ({
        field: error.property,
        message,
      }));
    });

    return new UnprocessableEntityException({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: formattedErrors,
      },
    });
  },
});
