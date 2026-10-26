import { Router } from "express";
import { callBot } from "../ts3ab.js";
import {
  addAudit,
  countActiveAdmins,
  createUser,
  deleteInstance,
  deleteSessionsForUser,
  deleteUser,
  findUserById,
  getInstanceRow,
  insertInstance,
  instanceClient,
  listAudit,
  listGrants,
  listInstances,
  listUsers,
  replaceGrants,
  setFlash,
  setPassword,
  setRole,
  setSuspended,
  updateInstanceRecord,
} from "../db.js";
import { HttpError, ValidationError } from "../errors.js";
import { clearSessionCookie, numericId, wrap } from "../http.js";
import { errorText } from "../i18n.js";
import { hashPassword } from "../passwords.js";
import { presentVersion } from "../present.js";
import { parseGrants, parseInstanceForm, parsePassword, parseRole, parseUsername } from "../validate.js";

export const adminRouter = Router();

function customerAccounts(users) {
  return users.filter((account) => account.role !== "admin");
}

function grantMap(grants) {
  const map = {};
  for (const grant of grants) map[grant.userId] = grant;
  return map;
}

function formInstance(body, fallback = {}, { submitted = false } = {}) {
  const enabled = submitted ? body.enabled === "on" || body.enabled === "1" : fallback.enabled !== false;
  const ownerFallback = fallback.ownerUserId == null ? "" : String(fallback.ownerUserId);
  return {
    id: fallback.id || null,
    name: body.name ?? fallback.name ?? "",
    baseUrl: body.baseUrl ?? fallback.baseUrl ?? "http://ts3audiobot:58913",
    ownerUserId: body.ownerUserId ?? ownerFallback,
    apiUser: body.apiUser ?? fallback.apiUser ?? "",
    hasToken: Boolean(fallback.hasToken),
    enabled,
    notes: body.notes ?? fallback.notes ?? "",
  };
}

function viewInstance(instance) {
  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.baseUrl,
    ownerUserId: instance.ownerUserId == null ? "" : String(instance.ownerUserId),
    apiUser: instance.apiUser,
    hasToken: instance.hasToken,
    enabled: instance.enabled,
    notes: instance.notes,
  };
}

async function renderInstanceForm(res, { instance, grants, error, status = error ? 400 : 200, t }) {
  const users = await listUsers();
  return res.status(status).render("bot-form", {
    title: instance.id ? instance.name : t("Add instance"),
    active: "instances",
    instance,
    users,
    grantMap: grantMap(grants),
    error,
    editing: Boolean(instance.id),
  });
}

async function assertOwner(ownerUserId) {
  if (ownerUserId == null) return null;
  const owner = await findUserById(ownerUserId);
  if (!owner) throw new ValidationError("Owner is invalid");
  return Number(owner.id);
}

adminRouter.get(
  "/instances",
  wrap(async (req, res) => {
    res.render("bots", {
      title: req.t("Instances"),
      active: "instances",
      bots: await listInstances(),
    });
  }),
);

adminRouter.get(
  "/instances/new",
  wrap(async (req, res) => {
    await renderInstanceForm(res, {
      instance: formInstance({}),
      grants: [],
      error: null,
      status: 200,
      t: req.t,
    });
  }),
);

adminRouter.post(
  "/instances",
  wrap(async (req, res) => {
    const users = customerAccounts(await listUsers());
    try {
      const fields = parseInstanceForm(req.body);
      fields.ownerUserId = await assertOwner(fields.ownerUserId);
      const grants = parseGrants(req.body, users).filter((grant) => grant.userId !== fields.ownerUserId);
      const id = await insertInstance(fields);
      await replaceGrants(id, grants);
      await addAudit({ userId: req.user.id, instanceId: id, action: "instance-create", detail: fields.name });
      await setFlash(req.sessionId, "ok", req.t("Instance saved."));
      return res.redirect(`/admin/instances/${id}`);
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      return renderInstanceForm(res, {
        instance: formInstance(req.body, {}, { submitted: true }),
        grants: parseGrants(req.body, users),
        error: errorText(err, req.t),
        t: req.t,
      });
    }
  }),
);

async function loadInstance(req, res) {
  const id = numericId(req.params.id);
  if (!id) {
    res.status(404).render("error", { title: req.t("Not found"), message: req.t("Instance not found.") });
    return null;
  }
  const instance = await getInstanceRow(id);
  if (!instance) {
    res.status(404).render("error", { title: req.t("Not found"), message: req.t("Instance not found.") });
    return null;
  }
  return instance;
}

adminRouter.get(
  "/instances/:id",
  wrap(async (req, res) => {
    const instance = await loadInstance(req, res);
    if (!instance) return;
    await renderInstanceForm(res, {
      instance: viewInstance(instance),
      grants: await listGrants(instance.id),
      error: null,
      status: 200,
      t: req.t,
    });
  }),
);

adminRouter.post(
  "/instances/:id",
  wrap(async (req, res) => {
    const existing = await loadInstance(req, res);
    if (!existing) return;
    const users = customerAccounts(await listUsers());
    try {
      const fields = parseInstanceForm(req.body, { keepExisting: true });
      fields.ownerUserId = await assertOwner(fields.ownerUserId);
      await updateInstanceRecord(existing.id, fields);
      await replaceGrants(
        existing.id,
        parseGrants(req.body, users).filter((grant) => grant.userId !== fields.ownerUserId),
      );
      await addAudit({
        userId: req.user.id,
        instanceId: existing.id,
        action: "instance-update",
        detail: fields.name,
      });
      await setFlash(req.sessionId, "ok", req.t("Instance saved."));
      return res.redirect(`/admin/instances/${existing.id}`);
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      return renderInstanceForm(res, {
        instance: { ...formInstance(req.body, viewInstance(existing), { submitted: true }), id: existing.id },
        grants: parseGrants(req.body, users),
        error: errorText(err, req.t),
        t: req.t,
      });
    }
  }),
);

adminRouter.post(
  "/instances/:id/delete",
  wrap(async (req, res) => {
    const instance = await loadInstance(req, res);
    if (!instance) return;
    if (String(req.body.confirm || "").trim() !== instance.name) {
      throw new HttpError("Type the instance name exactly to confirm.", 400);
    }
    await deleteInstance(instance.id);
    await addAudit({ userId: req.user.id, action: "instance-delete", detail: instance.name });
    await setFlash(req.sessionId, "ok", req.t("Instance deleted."));
    return res.redirect("/admin/instances");
  }),
);

adminRouter.post(
  "/instances/:id/test",
  wrap(async (req, res) => {
    const instance = await loadInstance(req, res);
    if (!instance) return;
    const version = presentVersion(await callBot(instanceClient(instance), ["version"], { timeoutMs: 8000 }));
    await setFlash(
      req.sessionId,
      "ok",
      req.t("API reachable{version}.", { version: version ? ` (${version})` : "" }),
    );
    return res.redirect(`/admin/instances/${instance.id}`);
  }),
);

adminRouter.get(
  "/users",
  wrap(async (req, res) => {
    res.render("users", { title: req.t("Users"), active: "users", users: await listUsers(), error: null });
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
      await setFlash(req.sessionId, "ok", req.t("User created."));
      return res.redirect("/admin/users");
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      return res.status(err.status).render("users", {
        title: req.t("Users"),
        active: "users",
        users: await listUsers(),
        error: errorText(err, req.t),
      });
    }
  }),
);

adminRouter.post(
  "/users/:id/password",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const password = parsePassword(req.body.password);
    await setPassword(user.id, await hashPassword(password));
    await addAudit({ userId: req.user.id, action: "user-password", detail: user.username });
    if (user.id === req.user.id) {
      await deleteSessionsForUser(user.id);
      clearSessionCookie(res);
      return res.redirect("/login");
    }
    await deleteSessionsForUser(user.id);
    await setFlash(
      req.sessionId,
      "ok",
      req.t("Password set for {name}. Existing sessions were signed out.", { name: user.username }),
    );
    return res.redirect("/admin/users");
  }),
);

adminRouter.post(
  "/users/:id/role",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const role = parseRole(req.body.role);
    if (user.role === "admin" && role !== "admin" && !user.suspended && (await countActiveAdmins()) <= 1) {
      throw new HttpError("The last administrator cannot be demoted.", 400);
    }
    await setRole(user.id, role);
    await addAudit({ userId: req.user.id, action: "user-role", detail: `${user.username} → ${role}` });
    await setFlash(req.sessionId, "ok", req.t("Role saved."));
    return res.redirect("/admin/users");
  }),
);

adminRouter.post(
  "/users/:id/suspend",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const suspended = req.body.suspended === "1";
    if (Number(user.id) === req.user.id) throw new HttpError("You cannot suspend yourself.", 400);
    if (suspended && user.role === "admin" && !user.suspended && (await countActiveAdmins()) <= 1) {
      throw new HttpError("The last administrator cannot be suspended.", 400);
    }
    await setSuspended(user.id, suspended);
    if (suspended) await deleteSessionsForUser(user.id);
    await addAudit({
      userId: req.user.id,
      action: suspended ? "user-suspend" : "user-restore",
      detail: user.username,
    });
    await setFlash(req.sessionId, "ok", suspended ? req.t("Account suspended.") : req.t("Account restored."));
    return res.redirect("/admin/users");
  }),
);

adminRouter.post(
  "/users/:id/delete",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    if (user.id === req.user.id) throw new HttpError("You cannot delete yourself.", 400);
    if (req.body.confirm !== "on") throw new HttpError("Delete must be confirmed", 400);
    if (user.role === "admin" && !user.suspended && (await countActiveAdmins()) <= 1) {
      throw new HttpError("The last administrator cannot be deleted.", 400);
    }
    await deleteUser(user.id);
    await addAudit({ userId: req.user.id, action: "user-delete", detail: user.username });
    await setFlash(req.sessionId, "ok", req.t("User deleted."));
    return res.redirect("/admin/users");
  }),
);

adminRouter.get(
  "/audit",
  wrap(async (req, res) => {
    res.render("audit", { title: req.t("Audit"), active: "audit", rows: await listAudit(200) });
  }),
);
