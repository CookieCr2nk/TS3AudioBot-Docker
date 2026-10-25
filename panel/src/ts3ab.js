import { Ts3ApiError, ValidationError } from "./errors.js";

export function buildApiPath(parts) {
  let out = "";
  for (const part of parts) {
    if (Array.isArray(part)) {
      out += `/(${buildApiPath(part)})`;
      continue;
    }
    if (part === null || part === undefined || String(part) === "") {
      throw new Ts3ApiError("Leeres API-Segment");
    }
    out += `/${encodeURIComponent(String(part)).replaceAll("(", "%28").replaceAll(")", "%29")}`;
  }
  return out;
}

export function scope(bot, parts) {
  if (!bot.useInstance || bot.instanceMode === "none") return parts;
  if (!bot.instanceRef) throw new ValidationError("Für diesen Bot ist keine Instanz gesetzt");
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
  if (declared > limit) throw new Ts3ApiError("Antwort des Bots ist zu groß");
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
      throw new Ts3ApiError("Antwort des Bots ist zu groß");
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

function messageFrom(data, status) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (data.ErrorMessage) return String(data.ErrorMessage).slice(0, 400);
    if (data.ErrorName) return String(data.ErrorName).slice(0, 400);
  }
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 300);
  return `Bot-API antwortet mit Status ${status}`;
}

export async function callBot(bot, parts, { timeoutMs = 15000 } = {}) {
  const base = new URL(bot.baseUrl);
  const target = new URL(`/api${buildApiPath(parts)}`, base);
  if (target.origin !== base.origin) throw new Ts3ApiError("Zieladresse abgelehnt");

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
      throw new Ts3ApiError("Weiterleitung der Bot-API wurde abgelehnt");
    }
    const data = parseBody(await readLimited(response, 2_000_000));
    if (!response.ok || isTopLevelError(data)) throw new Ts3ApiError(messageFrom(data, response.status));
    return data;
  } catch (err) {
    if (err instanceof Ts3ApiError) throw err;
    if (err.name === "AbortError") throw new Ts3ApiError("Zeitüberschreitung bei der Bot-API");
    if (err instanceof TypeError) throw new Ts3ApiError("Bot-API nicht erreichbar");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
