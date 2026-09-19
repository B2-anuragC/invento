export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetails;
  timestamp: string;
  path: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function isApiResponse<T>(value: unknown): value is ApiSuccessResponse<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'success' in value && 'timestamp' in value && 'data' in value;
}
