import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { isApiResponse } from '../dto/api-response.dto.js';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (isApiResponse<T>(data)) {
          return data;
        }

        return {
          success: true,
          data,
          message: 'Request completed successfully.',
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
