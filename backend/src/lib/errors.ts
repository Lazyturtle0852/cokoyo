import type { Context } from "hono";
import type { ApiErrorType } from "../../../shared/api-types.js";

const statusByType: Record<ApiErrorType, 400 | 401 | 429 | 500 | 502> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  UPSTREAM_ERROR: 502,
};

export class ApiFailure extends Error {
  constructor(
    readonly type: ApiErrorType,
    message: string,
  ) {
    super(message);
  }
}

export function fail(type: ApiErrorType, message: string): never {
  throw new ApiFailure(type, message);
}

export function errorResponse(c: Context, type: ApiErrorType, message: string) {
  return c.json({ error: { type, message } }, statusByType[type]);
}
