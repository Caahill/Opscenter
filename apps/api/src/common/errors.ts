import { HttpException } from '@nestjs/common';

/** Error with a stable code. Messages must never contain restricted values (TechSpec 6.3). */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
  ) {
    super(message, status);
  }
}

export const Errors = {
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue'),
  forbidden: (message = 'You do not have access to this') => new AppError(403, 'FORBIDDEN', message),
  notFound: (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  validation: (message: string) => new AppError(400, 'VALIDATION_FAILED', message),
  invalidState: (message: string) => new AppError(422, 'INVALID_STATE', message),
};
