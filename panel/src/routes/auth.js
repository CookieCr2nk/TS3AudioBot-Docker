import { Router } from "express";
import { randomBytes } from "node:crypto";
import { sha256 } from "../crypto.js";
import {
  addAudit,
  createSession,
  deleteOtherSessions,
  deleteSession,
  findUserByUsername,
  setFlash,
  setPassword,
  touchLogin,
} from "../db.js";
import { clearSessionCookie, cookieOptions, newCsrf, rateLimit, requireUser, wrap } from "../http.js";
import { errorText } from "../i18n.js";
import { hashPassword, verifyPassword } from "../passwords.js";
import { parsePassword, safeNext } from "../validate.js";

export const authRouter = Router();

authRouter.get("/login", (req, res) => {
  if (req.user) return res.redirect("/");
  return res.render("login", {
    title: req.t("Sign in"),
    plain: true,
    next: safeNext(req.query.next),
    error: null,
    username: "",
  });
});

authRouter.post(
  "/login",
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim().slice(0, 32);
    const password = String(req.body.password || "");
    const next = safeNext(req.body.next);
    const fail = (message) =>
      res.status(401).render("login", { title: req.t("Sign in"), plain: true, next, error: message, username });

    if (!rateLimit(`login:${req.ip}:${username.toLowerCase()}`, 8, 15 * 60 * 1000)) {
      return fail(req.t("Too many attempts. Try again later."));
    }

    const user = await findUserByUsername(username);
    const valid = await verifyPassword(password, user?.password_hash);
    if (!user || !valid) {
      await addAudit({
        userId: user?.id ?? null,
        action: "login-failed",
        detail: req.t("Login failed for {name} from {ip}", {
          name: username || req.t("unknown"),
          ip: req.ip,
        }),
      });
      return fail(req.t("Username or password is wrong."));
    }

    const token = randomBytes(32).toString("base64url");
    const csrf = newCsrf();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession({ id: sha256(token), userId: user.id, csrf, expiresAt });
    await touchLogin(user.id);
    await addAudit({ userId: user.id, action: "login", detail: req.ip });
    res.cookie("ts3panel", token, cookieOptions());
    return res.redirect(next);
  }),
);

authRouter.post(
  "/logout",
  wrap(async (req, res) => {
    if (req.sessionId) await deleteSession(req.sessionId);
    clearSessionCookie(res);
    return res.redirect("/login");
  }),
);

authRouter.get("/account", requireUser, (req, res) => {
  res.render("account", { title: req.t("Account"), active: "account", error: null });
});

authRouter.post(
  "/account",
  requireUser,
  wrap(async (req, res) => {
    const renderError = (message) =>
      res.status(400).render("account", { title: req.t("Account"), active: "account", error: message });
    const user = await findUserByUsername(req.user.username);
    const currentOk = await verifyPassword(req.body.current || "", user?.password_hash);
    if (!currentOk) return renderError(req.t("Current password is wrong."));
    let password;
    try {
      password = parsePassword(req.body.password);
    } catch (err) {
      return renderError(errorText(err, req.t));
    }
    if (password !== String(req.body.confirm || "")) return renderError(req.t("The confirmation does not match."));
    await setPassword(req.user.id, await hashPassword(password));
    await deleteOtherSessions(req.user.id, req.sessionId);
    await addAudit({ userId: req.user.id, action: "password", detail: req.t("Changed own password") });
    await setFlash(req.sessionId, "ok", req.t("Password changed. Other sessions were signed out."));
    return res.redirect("/account");
  }),
);

