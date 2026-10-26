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

const UNREACHABLE = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_QUIT",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);

const DENIED = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_NO_PASSWORD_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_HOST_NOT_PRIVILEGED",
]);

function exposed(message, status, params) {
  const err = new HttpError(message, status, params);
  err.expose = true;
  return err;
}

function candidates(err) {
  if (!err || typeof err !== "object") return [];
  const list = [err];
  if (Array.isArray(err.errors)) list.push(...err.errors);
  if (err.cause && typeof err.cause === "object") list.push(err.cause);
  return list;
}

function mapOperational(err, startup) {
  const code = err?.code;
  if (UNREACHABLE.has(code)) {
    return exposed(
      startup
        ? "The database is unreachable. Restart the panel once the database is up."
        : "The database is unreachable.",
      503,
    );
  }
  if (DENIED.has(code)) return exposed("The database rejected the panel login.", 503);
  if (code === "ER_BAD_DB_ERROR") return exposed("The panel database does not exist.", 503);
  if (err?.view && String(err.message || "").startsWith("Failed to lookup view")) {
    const name = err.view?.name;
    if (typeof name === "string" && /^[A-Za-z0-9/_-]{1,64}$/.test(name)) {
      return exposed("The page template {name} is missing.", 500, { name });
    }
    return exposed("The page template is missing.", 500);
  }
  return null;
}

function schemaMismatch(err) {
  const message = String(err?.message || "");
  return (
    message === "No database migrations found." ||
    message.startsWith("Migration ") ||
    message.startsWith("Database has migration ")
  );
}

// Known failures become a fixed sentence. Anything else stays hidden.
export function failureFor(err, { startup = false } = {}) {
  if (err instanceof HttpError && (err.expose || err.status < 500 || err instanceof Ts3ApiError)) return err;
  for (const item of candidates(err)) {
    const mapped = mapOperational(item, startup);
    if (mapped) return mapped;
  }
  if (!startup) return null;
  if (schemaMismatch(err)) return exposed("The database schema does not match this panel.", 503);
  return exposed("The panel could not start. The details are in the panel log.", 503);
}
