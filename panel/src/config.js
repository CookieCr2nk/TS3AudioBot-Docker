function integer(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return fallback;
  return number;
}

export function databaseConfig() {
  if (process.env.DATABASE_URL) return { uri: process.env.DATABASE_URL };
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: integer(process.env.DB_PORT, 3306, 1, 65535),
    user: process.env.DB_USER || "ts3panel",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME || "ts3panel",
  };
}

// "true" and "false" force the flag. Anything else follows the request: HTTPS, or HTTPS at a trusted proxy.
export function cookieSecureSetting(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return "auto";
}

export function weakTokenKey(key = tokenKey()) {
  return key.startsWith("dev-only") || key.length < 16;
}

export const config = {
  port: integer(process.env.PORT, 8080, 1, 65535),
  trustProxy: process.env.TRUST_PROXY === "1" ? 1 : false,
  cookieSecure: cookieSecureSetting(process.env.COOKIE_SECURE),
  adminUser: process.env.ADMIN_USER || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionIdleHours: integer(process.env.SESSION_IDLE_HOURS, 24, 1, 168),
};

export function tokenKey() {
  return process.env.TOKEN_KEY || "dev-only-token-key";
}

export function runtimeWarnings() {
  const warnings = [];
  if (weakTokenKey()) {
    warnings.push(
      "TOKEN_KEY is weak. The panel refuses to store a new API token until it is set. Changing it later makes stored tokens unreadable.",
    );
  }
  return warnings;
}
