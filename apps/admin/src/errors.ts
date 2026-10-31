type ErrorBody = {
  message?: unknown;
  error?: { message?: unknown; details?: unknown };
};

/**
 * The API wraps validation failures as "Request validation failed." with the
 * reasons in `details`; show those reasons so the user knows what to fix.
 */
export function apiErrorMessage(body: unknown, status: number): string {
  const { error, message } = (body && typeof body === "object" ? body : {}) as ErrorBody;
  const details = Array.isArray(error?.details)
    ? error.details
        .map((detail) => (detail && typeof detail === "object" ? (detail as { message?: unknown }).message : undefined))
        .filter((detail): detail is string => typeof detail === "string" && detail.length > 0)
    : [];
  if (details.length) return [...new Set(details)].join(" ");
  if (typeof error?.message === "string" && error.message) return error.message;
  if (typeof message === "string" && message) return message;
  return `Request failed (${status}).`;
}
