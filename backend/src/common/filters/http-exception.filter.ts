import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : new InternalServerErrorException('Internal server error').getResponse();

    const errorBody =
      typeof errorResponse === 'object' && errorResponse !== null
        ? (errorResponse as {
            error?: { code?: string; message?: string | string[]; details?: unknown };
            message?: string | string[];
            code?: string;
            details?: unknown;
          })
        : {};

    const nestedMessage = errorBody.error?.message ?? errorBody.message ?? 'Unexpected error';
    const details = errorBody.error?.details ?? errorBody.details;

    response.status(status).json({
      success: false,
      error: {
        code:
          status === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'INTERNAL_SERVER_ERROR'
            : errorBody.error?.code ?? 'HTTP_EXCEPTION',
        message: Array.isArray(nestedMessage) ? nestedMessage.join(', ') : nestedMessage,
        details,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
