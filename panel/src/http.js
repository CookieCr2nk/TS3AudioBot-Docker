import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { sha256, tokensEqual } from "./crypto.js";
import { deleteSession, getSession, takeFlash } from "./db.js";
import { HttpError } from "./errors.js";
import { safeNext } from "./validate.js";

const hits = new Map();

export function wrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function wantsJson(req) {
  return req.get("accept")?.includes("application/json") || req.get("x-requested-with") === "fetch";
}

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
  };
}

export function cookieOptions() {
  return { ...cookieBase(), maxAge: 7 * 24 * 60 * 60 * 1000 };
}

export function clearSessionCookie(res) {
  res.clearCookie("ts3panel", cookieBase());
}

export function numericId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

export function safeReferrer(req) {
  const header = req.get("referer");
  if (!header) return "/";
  try {
    const url = new URL(header);
    if (url.host !== req.get("host")) return "/";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const fresh = (hits.get(key) || []).filter((time) => now - time < windowMs);
  if (fresh.length >= limit) {
    hits.set(key, fresh);
    return false;
  }
  fresh.push(now);
  hits.set(key, fresh);
  if (hits.size > 5000) {
    for (const [entry, times] of hits) {
      if (times.every((time) => now - time >= windowMs)) hits.delete(entry);
    }
  }
  return true;
}

export function newCsrf() {
  return randomBytes(32).toString("hex");
}

export const loadSession = wrap(async (req, res, next) => {
  res.locals.user = null;
  res.locals.csrf = null;
  res.locals.flash = null;
  const token = req.cookies?.ts3panel;
  if (!token) return next();
  const id = sha256(token);
  const session = await getSession(id);
  if (!session) {
    clearSessionCookie(res);
    return next();
  }
  req.user = { id: session.userId, username: session.username, role: session.role };
  req.sessionId = id;
  req.csrf = session.csrf;
  res.locals.user = req.user;
  res.locals.csrf = session.csrf;
  res.locals.flash = await takeFlash(id);
  return next();
});

export function requireUser(req, res, next) {
  if (req.user) return next();
  const say = req.t || ((message) => message);
  if (wantsJson(req)) return res.status(401).json({ ok: false, error: say("Not signed in") });
  return res.redirect(`/login?next=${encodeURIComponent(safeNext(req.originalUrl))}`);
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  next(new HttpError("Administrators only", 403));
}

export function csrfProtect(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (req.path === "/login") return next();
  const sent = req.get("x-csrf-token") || req.body?.csrf || "";
  if (!req.csrf || !tokensEqual(sent, req.csrf)) {
    next(new HttpError("Reload the page. The form is no longer valid.", 403));
    return;
  }
  next();
}
