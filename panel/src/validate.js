import { ValidationError } from "./errors.js";

const NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function rejectControls(value, label) {
  if (/[\r\n\0]/.test(value)) throw new ValidationError(`${label} ist ungültig`);
  return value;
}

export function parseUsername(value) {
  const username = clean(value);
  if (!USERNAME_RE.test(username)) {
    throw new ValidationError("Benutzername: 3–32 Zeichen, Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich");
  }
  return username;
}

export function parsePassword(value) {
  const password = String(value ?? "");
  if (password.length < 10 || password.length > 200) {
    throw new ValidationError("Das Passwort muss mindestens 10 Zeichen haben");
  }
  return rejectControls(password, "Das Passwort");
}

export function parseRole(value) {
  const role = clean(value);
  if (role !== "admin" && role !== "user") throw new ValidationError("Ungültige Rolle");
  return role;
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
    throw new ValidationError("Die API-Adresse ist keine gültige URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Die API-Adresse muss http oder https sein");
  }
  if (url.username || url.password) throw new ValidationError("Die API-Adresse darf keine Zugangsdaten enthalten");
  if (url.search || url.hash) throw new ValidationError("Die API-Adresse darf keine Query enthalten");
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new ValidationError("Die API-Adresse darf nur Host und Port enthalten");
  }
  if (!url.hostname || isBlockedHost(url.hostname)) {
    throw new ValidationError("Diese API-Adresse ist nicht erlaubt");
  }
  return url.origin;
}

export function parseInstance(mode, ref) {
  if (mode !== "template" && mode !== "id" && mode !== "none") {
    throw new ValidationError("Ungültiger Instanzmodus");
  }
  if (mode === "none") return { mode, ref: "" };
  const value = clean(ref);
  if (!NAME_RE.test(value)) {
    throw new ValidationError("Die Instanz darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten");
  }
  return { mode, ref: value };
}

export function parseName(value) {
  const name = rejectControls(clean(value), "Der Name");
  if (!name || name.length > 120) throw new ValidationError("Der Name fehlt oder ist zu lang");
  return name;
}

export function parseNotes(value) {
  const notes = rejectControls(clean(value), "Die Notiz");
  if (notes.length > 500) throw new ValidationError("Die Notiz ist zu lang");
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
    throw new ValidationError("API-UID und Token müssen zusammen gesetzt werden. Format von !api token: uid:token");
  }
  if (user.length > 128 || secret.length > 512) throw new ValidationError("Die API-Zugangsdaten sind zu lang");
  rejectControls(user, "Die API-UID");
  rejectControls(secret, "Der API-Token");
  return { user, secret };
}

export function parseResource(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 2000) throw new ValidationError("Link fehlt oder ist zu lang");
  return rejectControls(text, "Der Link");
}

export function parseSearchQuery(value) {
  const text = rejectControls(clean(value), "Die Suche");
  if (!text || text.length > 200) throw new ValidationError("Die Suche fehlt oder ist zu lang");
  return text;
}

export function parseIndex(value, label, max) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) throw new ValidationError(`${label} muss eine ganze Zahl ab 0 sein`);
  const number = Number(text);
  if (number > max) throw new ValidationError(`${label} ist zu groß`);
  return number;
}

export function parseVolume(value) {
  return parseIndex(value, "Lautstärke", 100);
}

export function parseListId(value) {
  const id = clean(value);
  if (!NAME_RE.test(id)) {
    throw new ValidationError("Die Playlist-ID darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten");
  }
  return id;
}

export function parseTitle(value, label = "Der Titel") {
  const title = rejectControls(clean(value), label);
  if (!title || title.length > 120) throw new ValidationError(`${label} fehlt oder ist zu lang`);
  return title;
}

export function parseTemplateName(value) {
  const name = clean(value);
  if (!NAME_RE.test(name)) {
    throw new ValidationError("Der Instanzname darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten");
  }
  return name;
}

export function parseTsAddress(value) {
  const text = clean(value);
  if (!/^[A-Za-z0-9.:_-]{1,200}$/.test(text)) throw new ValidationError("Die Serveradresse ist ungültig");
  return text;
}

export function parseChannel(value) {
  const text = rejectControls(clean(value), "Der Channel");
  if (!text || text.length > 200 || /[()]/.test(text)) throw new ValidationError("Der Channel ist ungültig");
  return text;
}

export function parseUseInstance(body) {
  const name = clean(body.name);
  const instanceId = clean(body.instanceId);
  if (name && NAME_RE.test(name)) return parseInstance("template", name);
  if (instanceId && NAME_RE.test(instanceId)) return parseInstance("id", instanceId);
  throw new ValidationError("Diese Instanz hat keinen verwendbaren Namen");
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
