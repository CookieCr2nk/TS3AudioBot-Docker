export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export class ValidationError extends HttpError {
  constructor(message) {
    super(message, 400);
  }
}

export class Ts3ApiError extends HttpError {
  constructor(message) {
    super(message, 502);
  }
}
