import { Ts3ApiError, ValidationError } from "./errors.js";

export function buildApiPath(parts) {
  let out = "";
  for (const part of parts) {
    if (Array.isArray(part)) {
      out += `/(${buildApiPath(part)})`;
      continue;
    }
    if (part === null || part === undefined || String(part) === "") {
      throw new Ts3ApiError("Empty API segment");
    }
    out += `/${encodeURIComponent(String(part)).replaceAll("(", "%28").replaceAll(")", "%29")}`;
  }
  return out;
}

export function scope(bot, parts) {
  if (!bot.useInstance || bot.instanceMode === "none") return parts;
  if (!bot.instanceRef) throw new ValidationError("This bot has no instance set");
  const command = bot.instanceMode === "id" ? "use" : "template";
  return ["bot", command, bot.instanceRef, parts];
}

export function statusParts(bot) {
  return scope(bot, ["json", "merge", ["song"], ["volume"], ["repeat"], ["random"], ["info"]]);
}

function basicAuth(user, token) {
  return `Basic ${Buffer.from(`${user}:${token}`, "utf8").toString("base64")}`;
}

export function apiHeaders(bot) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "ts3panel",
  };
  if (bot?.apiUser && bot?.apiToken) headers.Authorization = basicAuth(bot.apiUser, bot.apiToken);
  return headers;
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Ts3ApiError("Bot response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Ts3ApiError("Bot response is too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function isTopLevelError(data) {
  return Boolean(
    data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof data.ErrorName === "string" &&
      typeof data.ErrorMessage === "string",
  );
}

function failureFrom(data, status) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (data.ErrorMessage) return new Ts3ApiError(String(data.ErrorMessage).slice(0, 400));
    if (data.ErrorName) return new Ts3ApiError(String(data.ErrorName).slice(0, 400));
  }
  if (typeof data === "string" && data.trim()) return new Ts3ApiError(data.trim().slice(0, 300));
  return new Ts3ApiError("Bot API returned status {status}", { status });
}

export async function callBot(bot, parts, { timeoutMs = 15000 } = {}) {
  const base = new URL(bot.baseUrl);
  const target = new URL(`/api${buildApiPath(parts)}`, base);
  if (target.origin !== base.origin) throw new Ts3ApiError("Target address was rejected");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: apiHeaders(bot),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Ts3ApiError("Bot API redirect was rejected");
    }
    const data = parseBody(await readLimited(response, 2_000_000));
    if (!response.ok || isTopLevelError(data)) throw failureFrom(data, response.status);
    return data;
  } catch (err) {
    if (err instanceof Ts3ApiError) throw err;
    if (err.name === "AbortError") throw new Ts3ApiError("Bot API timed out");
    if (err instanceof TypeError) throw new Ts3ApiError("Bot API is unreachable");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
