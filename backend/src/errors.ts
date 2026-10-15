/**
 * API が返すエラー。status は HTTP のステータス、code はアプリが分岐に使う短い名前。
 * message は人が読む用。内部の事情（テーブル名、スタックトレースなど）は入れない。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string): ApiError => new ApiError(400, code, message);
export const notFound = (code: string, message: string): ApiError => new ApiError(404, code, message);
export const conflict = (code: string, message: string): ApiError => new ApiError(409, code, message);
export const forbidden = (code: string, message: string): ApiError => new ApiError(403, code, message);
