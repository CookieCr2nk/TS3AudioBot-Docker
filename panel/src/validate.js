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
  if (password.length < 10) throw new ValidationError("Password must be at least 10 characters");
  // bcrypt keeps only the first 72 bytes. A longer password would match that prefix.
  if (Buffer.byteLength(password) > 72) throw new ValidationError("Password must be at most 72 bytes");
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

function blockedIpv4(parts) {
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = parts;
  if (first === 169 && second === 254) return true;
  if (first === 0 || first === 255) return true;
  return false;
}

function expandIpv6(host) {
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const side = (value) => (value ? value.split(":") : []);
  let head = side(halves[0]);
  let tail = halves.length === 2 ? side(halves[1]) : [];
  const last = (tail.length ? tail : head).at(-1);
  if (last && last.includes(".")) {
    const octets = last.split(".").map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part > 255)) return null;
    const pair = [((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)];
    if (tail.length) tail = [...tail.slice(0, -1), ...pair];
    else head = [...head.slice(0, -1), ...pair];
  }
  const missing = 8 - (head.length + tail.length);
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const parts = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    parts.push(Number.parseInt(group, 16));
  }
  return parts;
}

function blockedIpv6(host) {
  const parts = expandIpv6(host);
  if (!parts) return true;
  if (parts.every((part) => part === 0)) return true;
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && parts[5] === 0 && parts[6] === 0 && parts[7] === 1) {
    return false;
  }
  const linkLocal = (parts[0] & 0xffc0) === 0xfe80;
  if (linkLocal) return true;
  const mapped = parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && (parts[5] === 0xffff || parts[5] === 0);
  if (!mapped || (parts[5] === 0 && parts[6] === 0 && parts[7] <= 1)) return false;
  return blockedIpv4([(parts[6] >> 8) & 255, parts[6] & 255, (parts[7] >> 8) & 255, parts[7] & 255]);
}

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!host || host === "metadata.google.internal" || host.endsWith(".metadata.google.internal") || host.includes("metadata")) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (match) return blockedIpv4(match.slice(1).map(Number));
  if (host.includes(":")) return blockedIpv6(host);
  return false;
}

// The bot API answers on loopback inside its own container. A stream the bot fetches must not point there.
export const BOT_API_PORT = "58913";

function loopbackHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").split("%")[0].replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (match) return Number(match[1]) === 127;
  if (!host.includes(":")) return false;
  const parts = expandIpv6(host);
  if (!parts) return false;
  const zeros = (count) => parts.slice(0, count).every((part) => part === 0);
  if (zeros(7) && parts[7] === 1) return true;
  return zeros(5) && parts[5] === 0xffff && (parts[6] >> 8) === 127;
}

function streamPort(url) {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

// Rejects a stream that would reach a registered bot API. `apiHosts` holds those host names.
export function assertStreamTarget(value, apiHosts = []) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new ValidationError("Stream address is not a valid URL");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const known = new Set([...apiHosts].map((item) => String(item).toLowerCase().replace(/\.$/, "")));
  if (loopbackHost(host) || streamPort(url) === BOT_API_PORT || known.has(host)) {
    throw new ValidationError("This stream address is not allowed");
  }
  return url.href;
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
  return assertStreamTarget(url.href);
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

function optionalClear(input, key, parse) {
  if (!Object.hasOwn(input, key)) return undefined;
  return clean(input[key]) ? parse(input[key]) : null;
}

export function parseHostingSettings(input) {
  const name = parseTemplateName(input.name);
  const nickname = optionalClear(input, "nickname", parseBotNick);
  const channel = optionalClear(input, "channel", parseChannel);
  const serverPassword = parseOptionalSecret(input.serverPassword, "Server password");
  const channelPassword = parseOptionalSecret(input.channelPassword, "Channel password");
  let bitrate = null;
  if (clean(input.bitrate)) {
    bitrate = Number(clean(input.bitrate));
    if (!/^\d+$/.test(clean(input.bitrate)) || bitrate < 8 || bitrate > 98) {
      throw new ValidationError("Bitrate must be between 8 and 98");
    }
  }
  let volume = null;
  if (clean(input.volume)) volume = parseVolume(input.volume);
  let run = null;
  const runText = clean(input.run);
  if (runText === "on") run = true;
  else if (runText === "off") run = false;
  else if (runText) throw new ValidationError("Start on launch is invalid");
  const clearStartup = input.clearStartup === true || input.clearStartup === "on" || input.clearStartup === "1";
  const startup = clean(input.startup) ? parseStreamUrl(input.startup) : null;
  if (startup && clearStartup) throw new ValidationError("Clear the startup stream or set an address");
  if (
    nickname === undefined && channel === undefined && !serverPassword && !channelPassword
    && bitrate == null && volume == null && run == null && !startup && !clearStartup
  ) {
    throw new ValidationError("Enter at least one connection setting");
  }
  return {
    name,
    nickname,
    channel,
    serverPassword,
    channelPassword,
    bitrate,
    volume,
    run,
    startup,
    startupCommand: startup ? quotePlay(startup) : null,
    clearStartup,
  };
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

export function parseInstanceForm(body, { keepExisting = false, weakKey = false } = {}) {
  const credential = splitApiCredential(body.apiUser, body.apiToken, {
    keepExisting,
    clear: body.clearToken === "on",
  });
  // A token encrypted with the public default key is as good as plain text.
  if (credential.secret && weakKey) {
    throw new ValidationError("Set TOKEN_KEY to a long random value before you store an API token.");
  }
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
