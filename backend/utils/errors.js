export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function toHttpError(error) {
  if (error instanceof HttpError) {
    return error;
  }

  const unknown = new HttpError(500, 'Internal server error');
  unknown.cause = error;
  return unknown;
}
