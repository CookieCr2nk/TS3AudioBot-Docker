import { Router } from "express";
import { callBot, statusParts } from "../ts3ab.js";
import {
  addAudit,
  countAdmins,
  createUser,
  deleteBot,
  deleteSessionsForUser,
  deleteUser,
  findUserById,
  getBotRow,
  insertBot,
  listAudit,
  listBotSummaries,
  listGrants,
  listUsers,
  mapBot,
  replaceGrants,
  setFlash,
  setPassword,
  setRole,
  updateBot,
} from "../db.js";
import { HttpError } from "../errors.js";
import { clearSessionCookie, numericId, wrap } from "../http.js";
import { hashPassword } from "../passwords.js";
import { presentStatus, presentVersion } from "../present.js";
import { parseBotForm, parseGrants, parsePassword, parseRole, parseUsername } from "../validate.js";

export const adminRouter = Router();

function customerAccounts(users) {
  return users.filter((account) => account.role !== "admin");
}

function grantMap(grants) {
  const map = {};
  for (const grant of grants) map[grant.userId] = grant;
  return map;
}

function formBot(body, fallback = {}, { submitted = false } = {}) {
  const enabled = submitted
    ? body.enabled === "on" || body.enabled === "1"
    : fallback.enabled !== false;
  return {
    id: fallback.id || null,
    name: body.name ?? fallback.name ?? "",
    baseUrl: body.baseUrl ?? fallback.baseUrl ?? "http://ts3audiobot:58913",
    instanceMode: body.instanceMode ?? fallback.instanceMode ?? "template",
    instanceRef: body.instanceRef ?? fallback.instanceRef ?? "default",
    apiUser: body.apiUser ?? fallback.apiUser ?? "",
    hasToken: Boolean(fallback.hasToken),
    enabled,
    notes: body.notes ?? fallback.notes ?? "",
  };
}

async function renderBotForm(res, { bot, grants, error, status = error ? 400 : 200 }) {
  const users = customerAccounts(await listUsers());
  return res.status(status).render("bot-form", {
    title: bot.id ? bot.name : "Bot anlegen",
    active: "bots",
    bot,
    users,
    grantMap: grantMap(grants),
    error,
    editing: Boolean(bot.id),
  });
}

adminRouter.get(
  "/bots",
  wrap(async (req, res) => {
    res.render("bots", { title: "Bots", active: "bots", bots: await listBotSummaries() });
  }),
);

adminRouter.get("/bots/new", wrap(async (req, res) => {
  await renderBotForm(res, { bot: formBot({}), grants: [], error: null, status: 200 });
}));

adminRouter.post(
  "/bots",
  wrap(async (req, res) => {
    const users = customerAccounts(await listUsers());
    try {
      const fields = parseBotForm(req.body);
      const grants = parseGrants(req.body, users);
      const id = await insertBot(fields);
      await replaceGrants(id, grants);
      await addAudit({ userId: req.user.id, botId: id, action: "bot-create", detail: fields.name });
      await setFlash(req.sessionId, "ok", "Bot gespeichert.");
      return res.redirect(`/admin/bots/${id}`);
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      return renderBotForm(res, {
        bot: formBot(req.body, {}, { submitted: true }),
        grants: parseGrants(req.body, users),
        error: err.message,
      });
    }
  }),
);

async function loadOwnedBot(req, res) {
  const id = numericId(req.params.id);
  if (!id) {
    res.status(404).render("error", { title: "Bot", message: "Bot nicht gefunden." });
    return null;
  }
  const row = await getBotRow(id);
  if (!row) {
    res.status(404).render("error", { title: "Bot", message: "Bot nicht gefunden." });
    return null;
  }
  return mapBot(row, { token: false });
}

adminRouter.get(
  "/bots/:id",
  wrap(async (req, res) => {
    const bot = await loadOwnedBot(req, res);
    if (!bot) return;
    await renderBotForm(res, { bot, grants: await listGrants(bot.id), error: null, status: 200 });
  }),
);

adminRouter.post(
  "/bots/:id",
  wrap(async (req, res) => {
    const existing = await loadOwnedBot(req, res);
    if (!existing) return;
    const users = customerAccounts(await listUsers());
    try {
      const fields = parseBotForm(req.body, { keepExisting: true });
      await updateBot(existing.id, fields);
      await replaceGrants(existing.id, parseGrants(req.body, users));
      await addAudit({ userId: req.user.id, botId: existing.id, action: "bot-update", detail: fields.name });
      await setFlash(req.sessionId, "ok", "Bot gespeichert.");
      return res.redirect(`/admin/bots/${existing.id}`);
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      return renderBotForm(res, {
        bot: { ...formBot(req.body, existing, { submitted: true }), id: existing.id },
        grants: parseGrants(req.body, users),
        error: err.message,
      });
    }
  }),
);

adminRouter.post(
  "/bots/:id/delete",
  wrap(async (req, res) => {
    const bot = await loadOwnedBot(req, res);
    if (!bot) return;
    if (String(req.body.confirm || "").trim() !== bot.name) {
      throw new HttpError("Zur Bestätigung den Bot-Namen exakt eingeben.", 400);
    }
    await deleteBot(bot.id);
    await addAudit({ userId: req.user.id, action: "bot-delete", detail: bot.name });
    await setFlash(req.sessionId, "ok", "Bot gelöscht.");
    return res.redirect("/admin/bots");
  }),
);

adminRouter.post(
  "/bots/:id/test",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const row = id ? await getBotRow(id) : null;
    if (!row) throw new HttpError("Bot nicht gefunden", 404);
    const bot = mapBot(row, { token: true });
    const version = presentVersion(await callBot(bot, ["version"], { timeoutMs: 8000 }));
    let playback = "Kontext erreichbar";
    try {
      presentStatus(await callBot(bot, statusParts(bot), { timeoutMs: 8000 }));
    } catch (err) {
      playback = err.message;
    }
    await setFlash(req.sessionId, "ok", `API erreichbar${version ? ` (${version})` : ""}. Wiedergabe: ${playback}`);
    return res.redirect(`/admin/bots/${bot.id}`);
  }),
);

adminRouter.get(
  "/users",
  wrap(async (req, res) => {
    res.render("users", { title: "Benutzer", active: "users", users: await listUsers(), error: null });
  }),
);

adminRouter.post(
  "/users",
  wrap(async (req, res) => {
    try {
      const username = parseUsername(req.body.username);
      const password = parsePassword(req.body.password);
      const role = parseRole(req.body.role || "user");
      const id = await createUser({ username, passwordHash: await hashPassword(password), role });
      await addAudit({ userId: req.user.id, action: "user-create", detail: `${username} (${role}) id ${id}` });
      await setFlash(req.sessionId, "ok", "Benutzer angelegt.");
      return res.redirect("/admin/users");
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      return res.status(err.status).render("users", {
        title: "Benutzer",
        active: "users",
        users: await listUsers(),
        error: err.message,
      });
    }
  }),
);

adminRouter.post(
  "/users/:id/password",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("Benutzer nicht gefunden", 404);
    const password = parsePassword(req.body.password);
    await setPassword(user.id, await hashPassword(password));
    await addAudit({ userId: req.user.id, action: "user-password", detail: user.username });
    if (user.id === req.user.id) {
      await deleteSessionsForUser(user.id);
      clearSessionCookie(res);
      return res.redirect("/login");
    }
    await deleteSessionsForUser(user.id);
    await setFlash(req.sessionId, "ok", `Passwort für ${user.username} gesetzt. Bestehende Sitzungen sind abgemeldet.`);
    return res.redirect("/admin/users");
  }),
);

adminRouter.post(
  "/users/:id/role",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("Benutzer nicht gefunden", 404);
    const role = parseRole(req.body.role);
    if (user.role === "admin" && role !== "admin" && (await countAdmins()) <= 1) {
      throw new HttpError("Der letzte Administrator kann nicht herabgestuft werden.", 400);
    }
    await setRole(user.id, role);
    await addAudit({ userId: req.user.id, action: "user-role", detail: `${user.username} → ${role}` });
    await setFlash(req.sessionId, "ok", "Rolle gespeichert.");
    return res.redirect("/admin/users");
  }),
);

adminRouter.post(
  "/users/:id/delete",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("Benutzer nicht gefunden", 404);
    if (user.id === req.user.id) throw new HttpError("Du kannst dich nicht selbst löschen.", 400);
    if (req.body.confirm !== "on") throw new HttpError("Löschen muss bestätigt werden.", 400);
    if (user.role === "admin" && (await countAdmins()) <= 1) {
      throw new HttpError("Der letzte Administrator kann nicht gelöscht werden.", 400);
    }
    await deleteUser(user.id);
    await addAudit({ userId: req.user.id, action: "user-delete", detail: user.username });
    await setFlash(req.sessionId, "ok", "Benutzer gelöscht.");
    return res.redirect("/admin/users");
  }),
);

adminRouter.get(
  "/audit",
  wrap(async (req, res) => {
    res.render("audit", { title: "Protokoll", active: "audit", rows: await listAudit(200) });
  }),
);
