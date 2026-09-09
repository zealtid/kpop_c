export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "未找到") {
  return new AppError(404, "NOT_FOUND", message);
}

export function unauthorized(message = "请先登录") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, "BAD_REQUEST", message, details);
}
