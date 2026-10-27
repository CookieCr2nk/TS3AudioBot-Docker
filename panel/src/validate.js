import { ValidationError } from "./errors.js";

const NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function rejectControls(value, label) {
  if (/[\r\n\0]/.test(value)) throw new ValidationError("{label} is invalid", { label });
  return value;
}

export function parseUsername(value) {
  const username = clean(value);
  if (!USERNAME_RE.test(username)) {
    throw new ValidationError("Username: 3–32 characters, letters, digits, dot, underscore, or hyphen");
  }
  return username;
}

export function parsePassword(value) {
  const password = String(value ?? "");
  if (password.length < 10 || password.length > 200) {
    throw new ValidationError("Password must be at least 10 characters");
  }
  return rejectControls(password, "Password");
}

export function parseOptionalPassword(value) {
  const password = String(value ?? "");
  if (!password) return null;
  return parsePassword(password);
}

export function parseRole(value) {
  const role = clean(value);
  if (role !== "admin" && role !== "user") throw new ValidationError("Invalid role");
  return role;
}

export function parseBotLimit(value) {
  const text = clean(value);
  if (!text || text.toLowerCase() === "unlimited") return null;
  if (!/^\d+$/.test(text)) throw new ValidationError("Bot limit is invalid");
  const number = Number(text);
  if (number > 10000) throw new ValidationError("Bot limit is invalid");
  return number;
}

export function quotePlay(resource) {
  return `!play '${String(resource).replaceAll("'", "\\'")}'`;
}

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal" || host.endsWith(".metadata.google.internal")) return true;
  if (host.includes("metadata")) return true;
  if (host === "::" || host === "0.0.0.0") return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 0 || parts[0] === 255) return true;
  return false;
}

export function assertBaseUrl(value) {
  let url;
  try {
    url = new URL(clean(value));
  } catch {
    throw new ValidationError("API address is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("API address must be http or https");
  }
  if (url.username || url.password) throw new ValidationError("API address must not contain credentials");
  if (url.search || url.hash) throw new ValidationError("API address must not contain a query");
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new ValidationError("API address must contain only a host and a port");
  }
  if (!url.hostname || isBlockedHost(url.hostname)) {
    throw new ValidationError("This API address is not allowed");
  }
  return url.origin;
}

export function parseInstance(mode, ref) {
  if (mode !== "template" && mode !== "id" && mode !== "none") {
    throw new ValidationError("Invalid instance mode");
  }
  if (mode === "none") return { mode, ref: "" };
  const value = clean(ref);
  if (!NAME_RE.test(value)) {
    throw new ValidationError("Instance may contain only letters, digits, dot, underscore, and hyphen");
  }
  return { mode, ref: value };
}

export function parseName(value) {
  const name = rejectControls(clean(value), "Name");
  if (!name || name.length > 120) throw new ValidationError("Name is missing or too long");
  return name;
}

export function parseNotes(value) {
  const notes = rejectControls(clean(value), "Note");
  if (notes.length > 500) throw new ValidationError("Note is too long");
  return notes;
}

export function splitApiCredential(uid, token, { keepExisting = false, clear = false } = {}) {
  if (clear) return { user: "", secret: "" };
  let user = clean(uid);
  let secret = String(token ?? "").trim();
  if (!user && secret.includes(":")) {
    const index = secret.indexOf(":");
    user = secret.slice(0, index).trim();
    secret = secret.slice(index + 1).trim();
  }
  if (!secret && keepExisting) return { user, secret: null };
  if (!user && !secret) return { user: "", secret: "" };
  if (!user || !secret) {
    throw new ValidationError("Set API UID and token together. Format from !api token: uid:token");
  }
  if (user.length > 128 || secret.length > 512) throw new ValidationError("API credentials are too long");
  rejectControls(user, "API UID");
  rejectControls(secret, "API token");
  return { user, secret };
}

export function parseStreamUrl(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 500) throw new ValidationError("Stream address is missing or too long");
  rejectControls(text, "Stream address");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ValidationError("Stream address is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Stream address must be http or https");
  }
  if (url.hash) throw new ValidationError("Stream address is not a valid URL");
  if (!url.hostname || isBlockedHost(url.hostname)) {
    throw new ValidationError("This stream address is not allowed");
  }
  if (url.href.length > 500) throw new ValidationError("Stream address is missing or too long");
  if (url.href.includes("\\")) throw new ValidationError("This stream address is not allowed");
  return url.href;
}

export function parseBotNick(value) {
  const name = rejectControls(clean(value), "Nickname");
  if (!name || name.length > 30) throw new ValidationError("Nickname is missing or too long");
  return name;
}

function parseOptionalSecret(value, label) {
  const text = String(value ?? "");
  if (!clean(text)) return null;
  if (text.length > 128) throw new ValidationError("{label} is invalid", { label });
  return rejectControls(text, label);
}

export function parseHostingSettings(input) {
  const name = parseTemplateName(input.name);
  const nickname = clean(input.nickname) ? parseBotNick(input.nickname) : null;
  const channel = clean(input.channel) ? parseChannel(input.channel) : null;
  const serverPassword = parseOptionalSecret(input.serverPassword, "Server password");
  const channelPassword = parseOptionalSecret(input.channelPassword, "Channel password");
  let bitrate = null;
  if (clean(input.bitrate)) {
    bitrate = parseIndex(input.bitrate, "Bitrate", 98);
    if (bitrate < 8) throw new ValidationError("Bitrate must be between 8 and 98");
  }
  let run = null;
  const runText = clean(input.run);
  if (runText === "on") run = true;
  else if (runText === "off") run = false;
  else if (runText) throw new ValidationError("Start on launch is invalid");
  const clearStartup = input.clearStartup === true || input.clearStartup === "on" || input.clearStartup === "1";
  const startup = clean(input.startup) ? parseStreamUrl(input.startup) : null;
  if (startup && clearStartup) throw new ValidationError("Clear the startup stream or set an address");
  if (!nickname && !channel && !serverPassword && !channelPassword && bitrate == null && run == null && !startup && !clearStartup) {
    throw new ValidationError("Enter at least one connection setting");
  }
  return {
    name,
    nickname,
    channel,
    serverPassword,
    channelPassword,
    bitrate,
    run,
    startup,
    startupCommand: startup ? quotePlay(startup) : null,
    clearStartup,
  };
}

export function parseResource(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 2000) throw new ValidationError("Link is missing or too long");
  return rejectControls(text, "Link");
}

export function parseSearchQuery(value) {
  const text = rejectControls(clean(value), "Search");
  if (!text || text.length > 200) throw new ValidationError("Search is missing or too long");
  return text;
}

export function parseIndex(value, label, max) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) throw new ValidationError("{label} must be a whole number from 0", { label });
  const number = Number(text);
  if (number > max) throw new ValidationError("{label} is too large", { label });
  return number;
}

export function parseVolume(value) {
  return parseIndex(value, "Volume", 100);
}

export function parseListId(value) {
  const id = clean(value);
  if (!NAME_RE.test(id)) {
    throw new ValidationError("Playlist ID may contain only letters, digits, dot, underscore, and hyphen");
  }
  return id;
}

export function parseTitle(value, label = "Title") {
  const title = rejectControls(clean(value), label);
  if (!title || title.length > 120) throw new ValidationError("{label} is missing or too long", { label });
  return title;
}

export function parseTemplateName(value) {
  const name = clean(value);
  if (!NAME_RE.test(name)) {
    throw new ValidationError("Template name may contain only letters, digits, dot, underscore, and hyphen");
  }
  return name;
}

export function parseTsAddress(value) {
  const text = clean(value);
  if (!/^[A-Za-z0-9.:_-]{1,200}$/.test(text)) throw new ValidationError("Server address is invalid");
  return text;
}

export function parseChannel(value) {
  const text = rejectControls(clean(value), "Channel");
  if (!text || text.length > 200 || /[()]/.test(text)) throw new ValidationError("Channel is invalid");
  return text;
}

export function parseUseInstance(body) {
  const name = clean(body.name);
  const instanceId = clean(body.instanceId);
  if (name && NAME_RE.test(name)) return parseInstance("template", name);
  if (instanceId && NAME_RE.test(instanceId)) return parseInstance("id", instanceId);
  throw new ValidationError("This instance has no usable name");
}

export function parseInstanceForm(body, { keepExisting = false } = {}) {
  const credential = splitApiCredential(body.apiUser, body.apiToken, {
    keepExisting,
    clear: body.clearToken === "on",
  });
  const ownerRaw = clean(body.ownerUserId);
  let ownerUserId = null;
  if (ownerRaw) {
    ownerUserId = Number(ownerRaw);
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) throw new ValidationError("Owner is invalid");
  }
  return {
    name: parseName(body.name),
    baseUrl: assertBaseUrl(body.baseUrl),
    ownerUserId,
    apiUser: credential.user,
    apiToken: credential.secret,
    enabled: body.enabled === "on" || body.enabled === "1",
    notes: parseNotes(body.notes),
  };
}

export function parseBotForm(body, { keepExisting = false } = {}) {
  const instance = parseInstance(clean(body.instanceMode), body.instanceRef);
  const credential = splitApiCredential(body.apiUser, body.apiToken, {
    keepExisting,
    clear: body.clearToken === "on",
  });
  return {
    name: parseName(body.name),
    baseUrl: assertBaseUrl(body.baseUrl),
    instanceMode: instance.mode,
    instanceRef: instance.ref,
    apiUser: credential.user,
    apiToken: credential.secret,
    enabled: body.enabled === "on" || body.enabled === "1",
    notes: parseNotes(body.notes),
  };
}

export function parseGrants(body, accounts) {
  const grants = [];
  for (const account of accounts) {
    if (body[`grant_${account.id}`] !== "on") continue;
    grants.push({
      userId: Number(account.id),
      canControl: body[`control_${account.id}`] === "on",
    });
  }
  return grants;
}

export function safeNext(value) {
  const text = String(value || "");
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\") || text.includes("\n")) return "/";
  return text;
}
