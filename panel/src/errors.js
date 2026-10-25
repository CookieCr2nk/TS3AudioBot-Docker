export class HttpError extends Error {
  constructor(message, status = 400, params) {
    super(message);
    this.status = status;
    this.params = params;
  }
}

export class ValidationError extends HttpError {
  constructor(message, params) {
    super(message, 400, params);
  }
}

export class Ts3ApiError extends HttpError {
  constructor(message, params) {
    super(message, 502, params);
  }
}
