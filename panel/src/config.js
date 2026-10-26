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

export const config = {
  port: integer(process.env.PORT, 8080, 1, 65535),
  trustProxy: process.env.TRUST_PROXY === "1" ? 1 : false,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  adminUser: process.env.ADMIN_USER || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
};

export function tokenKey() {
  return process.env.TOKEN_KEY || "dev-only-token-key";
}

export function runtimeWarnings() {
  const warnings = [];
  const key = tokenKey();
  if (key.startsWith("dev-only") || key.length < 16) {
    warnings.push(
      "TOKEN_KEY is weak. It is only needed when an optional API token is stored. Changing it later makes stored tokens unreadable.",
    );
  }
  return warnings;
}
