import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { commanderSaved, ownLiveId, parseBulk, runAction, settingsRecord } from "./actions.js";
import { sha256 } from "./crypto.js";
import {
  accessToBot,
  accessToInstance,
  addAudit,
  countActiveAdmins,
  countOwnedBots,
  createSession,
  createUser,
  deleteInstance,
  deleteOtherSessions,
  deleteSession,
  deleteSessionsForUser,
  deleteStream,
  deleteTsBotByName,
  deleteUser,
  ensureTsBot,
  findTsBotId,
  findUserById,
  getTsBotRow,
  findUserByUsername,
  getInstanceRow,
  getInvite,
  getStream,
  insertInstance,
  insertInvite,
  insertStream,
  instanceClient,
  listAudit,
  listInvites,
  trimAuditLog,
  listGrantIds,
  listGrants,
  listAccessibleBots,
  listApiHosts,
  listInstances,
  listInstancesForUser,
  listStreams,
  listUsers,
  newSessionExpiry,
  publicBot,
  deleteInvite,
  registerWithInvite,
  revokeInvite,
  replaceGrants,
  replaceUserGrants,
  saveBotSettings,
  setBotAssignee,
  setBotLabel,
  setBotLimit,
  setCanCreateBots,
  setPassword,
  setRole,
  setSuspended,
  touchLogin,
  updateInstanceRecord,
} from "./db.js";
import { failureFor, HttpError, Ts3ApiError, ValidationError } from "./errors.js";
import {
  clearSessionCookie,
  cookieOptions,
  csrfProtect,
  newCsrf,
  numericId,
  rateLimit,
  requireAdmin,
  requireUser,
  wrap,
} from "./http.js";
import { applyRequestLanguage, errorText, languages, phrasesFor } from "./i18n.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import {
  hashInviteToken,
  inviteAuditLabel,
  newInviteToken,
  parseInviteForm,
  parseRegistration,
  presentInvite,
} from "./invites.js";
import {
  displayStreamUrl,
  countRunningBots,
  presentBotList,
  presentCommander,
  presentSendMode,
  presentSetting,
  presentTsIdentity,
  presentWhisper,
  presentWhisperTargets,
  presentServerTree,
  presentSearch,
  presentStatus,
  presentVersion,
} from "./present.js";
import { callBot, scope, statusParts } from "./ts3ab.js";
import {
  assertStreamTarget,
  parseBotLimit,
  parseGrants,
  parseInstanceForm,
  parseName,
  parseNotes,
  parseOptionalPassword,
  parsePassword,
  parseRole,
  parseStreamUrl,
  parseTemplateName,
  parseTitle,
  parseUseInstance,
  parseUsername,
} from "./validate.js";
import { toFormBody } from "./form.js";
import { weakTokenKey } from "./config.js";

export const api = Router();

api.use((req, res, next) => {
  applyRequestLanguage(req, res);
  next();
});

const LINE_LOG = new Set(["Bot API timed out", "Bot API is unreachable"]);

export function missingLiveBot(message) {
  return message === "This bot does not exist.";
}

export function serverErrorLog(err) {
  const status = err?.status || 500;
  if (status < 500) return "skip";
  if (err instanceof Ts3ApiError) return LINE_LOG.has(err.message) ? "line" : "skip";
  return "dump";
}

function sendError(err, req, res) {
  const exposed = failureFor(err);
  const status = exposed?.status || 500;
  const logged = serverErrorLog(err);
  if (logged === "line") console.error(`[panel] ${err.message}`);
  else if (logged === "dump") console.error(err);
  const message = exposed ? errorText(exposed, req.t) : (req.t ? req.t("Internal error") : "Internal error");
  res.status(status).json({ ok: false, error: message });
}

function ok(res, body = {}, status = 200) {
  res.status(status).json({ ok: true, ...body });
}

function sessionPayload(req) {
  return {
    user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role, canCreateBots: Boolean(req.user.canCreateBots) } : null,
    csrf: req.csrf || "",
    lang: req.lang,
    choice: req.langChoice || "auto",
    languages,
    phrases: phrasesFor(req.lang),
  };
}

api.get("/session", (req, res) => ok(res, sessionPayload(req)));

export const LOGIN_PER_IP = 30;
const UNKNOWN_LOGIN_AUDIT = 100;

// A failed login for a known account is always written. Unknown names share one budget,
// so random names cannot fill the audit log.
export function auditFailedLogin(user, now = Date.now()) {
  if (user) return true;
  return rateLimit("login-audit-unknown", UNKNOWN_LOGIN_AUDIT, 15 * 60 * 1000, 1, now);
}

export function loginDecision({ user, valid }) {
  if (!user || !valid) return "invalid";
  if (user.suspended) return "suspended";
  return "ok";
}

export function signedInUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    canCreateBots: Boolean(user.can_create_bots),
  };
}

async function startSession(req, res, user) {
  const token = randomBytes(32).toString("base64url");
  const csrf = newCsrf();
  const expiresAt = newSessionExpiry();
  await createSession({ id: sha256(token), userId: user.id, csrf, expiresAt });
  await touchLogin(user.id);
  res.cookie("ts3panel", token, cookieOptions(req));
  req.user = signedInUser(user);
  req.csrf = csrf;
}

api.post(
  "/login",
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim().slice(0, 32);
    const password = String(req.body.password || "");
    // One address may try many names, but not without bound. The per-name limit stays 8.
    if (!rateLimit(`login-ip:${req.ip}`, LOGIN_PER_IP, 15 * 60 * 1000)) {
      throw new HttpError("Too many attempts. Try again later.", 429);
    }
    if (!rateLimit(`login:${req.ip}:${username.toLowerCase()}`, 8, 15 * 60 * 1000)) {
      throw new HttpError("Too many attempts. Try again later.", 429);
    }
    const user = await findUserByUsername(username);
    const valid = await verifyPassword(password, user?.password_hash);
    const decision = loginDecision({ user, valid });
    if (decision === "invalid") {
      if (auditFailedLogin(user)) {
        await addAudit({
          userId: user?.id ?? null,
          action: "login-failed",
          detail: req.t("Login failed for {name} from {ip}", { name: username || req.t("unknown"), ip: req.ip }),
        });
      }
      throw new HttpError("Username or password is wrong.", 401);
    }
    if (decision === "suspended") throw new HttpError("This account is suspended.", 401);
    await startSession(req, res, user);
    await addAudit({ userId: user.id, action: "login", detail: req.ip });
    ok(res, sessionPayload(req));
  }),
);

// Registration runs before the session check, like /login. It needs a valid invite token instead.
api.post(
  "/register",
  wrap(async (req, res) => {
    if (!rateLimit(`register:${req.ip}`, 8, 15 * 60 * 1000)) {
      throw new HttpError("Too many attempts. Try again later.", 429);
    }
    if (req.user) throw new HttpError("Sign out before you register a new account.", 400);
    const input = parseRegistration(req.body);
    const passwordHash = await hashPassword(input.password);
    const result = await registerWithInvite({ tokenHash: hashInviteToken(input.token), username: input.username, passwordHash });
    await addAudit({
      userId: result.userId,
      action: "invite-register",
      detail: `${input.username} via invite ${inviteAuditLabel({ id: result.inviteId, label: result.label })}`,
    });
    const user = await findUserById(result.userId);
    await startSession(req, res, user);
    ok(res, sessionPayload(req));
  }),
);

api.use(csrfProtect);
api.use(requireUser);

api.post(
  "/logout",
  wrap(async (req, res) => {
    if (req.sessionId) await deleteSession(req.sessionId);
    clearSessionCookie(res);
    ok(res);
  }),
);

api.get(
  "/account",
  wrap(async (req, res) => {
    const user = await findUserById(req.user.id);
    if (!user) throw new HttpError("User not found", 404);
    ok(res, {
      botLimit: user.bot_limit == null ? null : Number(user.bot_limit),
      botCount: await countOwnedBots(user.id),
    });
  }),
);

api.post(
  "/account/password",
  wrap(async (req, res) => {
    if (!rateLimit(`password:${req.user.id}`, 8, 15 * 60 * 1000)) {
      throw new HttpError("Too many attempts. Try again later.", 429);
    }
    const user = await findUserById(req.user.id);
    const currentOk = await verifyPassword(req.body.current || "", user?.password_hash);
    if (!currentOk) throw new HttpError("Current password is wrong.", 400);
    const password = parsePassword(req.body.password);
    if (password !== String(req.body.confirm || "")) throw new HttpError("The confirmation does not match.", 400);
    await setPassword(req.user.id, await hashPassword(password));
    await deleteOtherSessions(req.user.id, req.sessionId);
    await addAudit({ userId: req.user.id, action: "password", detail: req.t("Changed own password") });
    ok(res, { message: req.t("Password changed. Other sessions were signed out.") });
  }),
);

function publicInstance(instance, admin) {
  return {
    id: instance.id,
    name: instance.name,
    enabled: instance.enabled,
    notes: instance.notes || "",
    ownerName: instance.ownerName || "",
    ownerUserId: admin ? instance.ownerUserId : null,
    botCount: instance.botCount || 0,
    baseUrl: admin ? instance.baseUrl : "",
    apiUser: admin ? instance.apiUser || "" : "",
    hasToken: admin ? Boolean(instance.hasToken) : false,
  };
}

function accountSummary(accounts) {
  return {
    total: accounts.length,
    active: accounts.filter((account) => !account.suspended).length,
    suspended: accounts.filter((account) => account.suspended).length,
    administrators: accounts.filter((account) => account.role === "admin").length,
    noPassword: accounts.filter((account) => !account.hasPassword).length,
  };
}

// Throws when the API is unreachable. A reachable API without a readable version gives null.
async function readVersion(client, timeoutMs) {
  const version = presentVersion(await callBot(client, ["version"], { timeoutMs }));
  if (version) return version;
  try {
    return presentVersion(await callBot(client, ["print", ["version"]], { timeoutMs }));
  } catch {
    return null;
  }
}

api.get(
  "/overview",
  wrap(async (req, res) => {
    const admin = req.user.role === "admin";
    const rows = admin
      ? await listInstances({ token: true })
      : await listInstancesForUser(req.user.id, { token: true });
    const visible = await listAccessibleBots(req.user, { token: false });
    const namesByInstance = new Map();
    for (const row of visible) {
      const id = row.bot.instanceId;
      if (!namesByInstance.has(id)) namesByInstance.set(id, new Set());
      if (row.bot.instanceRef) namesByInstance.get(id).add(row.bot.instanceRef);
    }
    const cards = await Promise.all(
      rows.map(async (row) => {
        const card = {
          ...publicInstance(row, admin),
          canControl: admin ? true : Boolean(row.canControl),
          online: false,
          version: null,
          error: null,
          running: 0,
        };
        try {
          card.version = await readVersion(instanceClient(row), 4000);
          card.online = true;
        } catch (err) {
          card.error = errorText(err, req.t);
          return card;
        }
        try {
          const listed = presentBotList(await callBot(instanceClient(row), ["bot", "list"], { timeoutMs: 4000 }));
          const names = namesByInstance.get(row.id) || new Set();
          card.running = countRunningBots(listed, names);
          if (admin) card.process = countRunningBots(listed, null);
        } catch {
          card.running = 0;
        }
        return card;
      }),
    );
    const registered = visible.length;
    const running = cards.reduce((total, card) => total + (card.running || 0), 0);
    const bots = {
      registered,
      running,
      stopped: Math.max(0, registered - running),
    };
    if (admin) bots.process = cards.reduce((total, card) => total + (card.process || 0), 0);
    for (const card of cards) delete card.process;
    const summary = {
      instances: {
        total: cards.length,
        online: cards.filter((card) => card.online).length,
        offline: cards.filter((card) => card.enabled && !card.online).length,
        disabled: cards.filter((card) => !card.enabled).length,
      },
      bots,
      users: admin ? accountSummary(await listUsers()) : null,
    };
    ok(res, { cards, summary });
  }),
);

api.get(
  "/instances",
  wrap(async (req, res) => {
    const admin = req.user.role === "admin";
    const rows = admin || req.user.canCreateBots
      ? (await listInstances()).filter((row) => admin || row.enabled)
      : await listInstancesForUser(req.user.id);
    ok(res, {
      instances: rows.map((row) => {
        const canCreate = admin || row.ownerUserId === req.user.id || Boolean(req.user.canCreateBots);
        if (admin) return { ...publicInstance(row, true), canCreate };
        return { id: row.id, name: row.name, enabled: row.enabled, canCreate };
      }),
    });
  }),
);

async function openInstance(req) {
  const id = numericId(req.params.id);
  if (!id) throw new HttpError("That instance does not exist or is not assigned to you.", 404);
  const access = await accessToInstance(req.user, id);
  if (!access) throw new HttpError("That instance does not exist or is not assigned to you.", 404);
  return access;
}

function manageable(access) {
  if (!access.canManage) throw new HttpError("You cannot manage bots on this instance.", 403);
}

function assertCanCreate(req, access) {
  if (access.canManage || req.user.canCreateBots) return;
  throw new HttpError("You cannot create bots. Ask an administrator to assign one.", 403);
}

function chargedUserId(req, instance) {
  if (req.user.role === "admin") return instance.ownerUserId;
  return req.user.id;
}

// Null when no limit applies. Otherwise how many bots count against the limit.
async function userQuota(userId, exceptBotId = null) {
  if (userId == null) return null;
  const owner = await findUserById(userId);
  if (!owner || owner.bot_limit == null) return null;
  return { limit: Number(owner.bot_limit), count: await countOwnedBots(owner.id, exceptBotId) };
}

async function assertUserQuota(userId, exceptBotId = null) {
  const quota = await userQuota(userId, exceptBotId);
  if (quota && quota.count >= quota.limit) throw new HttpError("Bot limit reached ({count}).", 403, { count: quota.limit });
}

async function assertNewBot(instanceId, name) {
  if (await findTsBotId(instanceId, name)) return;
  const instance = await getInstanceRow(instanceId);
  if (instance) await assertUserQuota(instance.ownerUserId);
}

api.get(
  "/instances/:id",
  wrap(async (req, res) => {
    const access = await openInstance(req);
    const admin = req.user.role === "admin";
    const users = admin ? await listUsers() : [];
    const grants = admin ? await listGrants(access.instance.id) : [];
    ok(res, {
      instance: publicInstance(access.instance, admin),
      canManage: access.canManage,
      canCreate: access.canManage || Boolean(req.user.canCreateBots),
      quota: await userQuota(chargedUserId(req, access.instance)),
      users,
      grants,
    });
  }),
);

async function openInstanceForCreate(req) {
  const id = numericId(req.params.id);
  if (!id) throw new HttpError("That instance does not exist or is not assigned to you.", 404);
  const access = await accessToInstance(req.user, id);
  if (access) return access;
  if (!req.user.canCreateBots) throw new HttpError("That instance does not exist or is not assigned to you.", 404);
  const instance = await getInstanceRow(id);
  if (!instance || !instance.enabled) throw new HttpError("That instance does not exist or is not assigned to you.", 404);
  return { instance, canControl: false, canManage: false };
}

api.post(
  "/instances/:id/bots",
  wrap(async (req, res) => {
    const access = await openInstanceForCreate(req);
    assertCanCreate(req, access);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const display = parseName(req.body.name);
    const template = randomUUID().replaceAll("-", "");
    const charged = chargedUserId(req, access.instance);
    await assertUserQuota(charged);
    // The row comes first, inside the limit check. A failed create removes it again, so neither side keeps an orphan.
    const botId = await ensureTsBot(access.instance.id, template, display, charged, { quotaUserId: charged });
    try {
      await callBot(instanceClient(access.instance), ["settings", "create", template]);
    } catch (err) {
      await deleteTsBotByName(access.instance.id, template);
      throw err;
    }
    await addAudit({ userId: req.user.id, botId, instanceId: access.instance.id, action: "bot-create", detail: display });
    ok(res, { message: req.t("Bot created."), botId });
  }),
);

api.post(
  "/instances/:id/bots/attach",
  wrap(async (req, res) => {
    const access = await openInstance(req);
    if (!access.canManage) throw new HttpError("You cannot attach an existing bot.", 403);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const name = parseTemplateName(req.body.name);
    const existing = await findTsBotId(access.instance.id, name);
    if (existing) {
      const visible = await accessToBot(req.user, existing);
      if (!visible) throw new HttpError("That bot is already registered.", 409);
      ok(res, { message: req.t("Bot added."), botId: existing });
      return;
    }
    const charged = chargedUserId(req, access.instance);
    await assertUserQuota(charged);
    const botId = await ensureTsBot(access.instance.id, name, name, charged, { quotaUserId: charged });
    const visible = await accessToBot(req.user, botId);
    if (!visible) throw new HttpError("That bot is already registered.", 409);
    await addAudit({ userId: req.user.id, botId, instanceId: access.instance.id, action: "bot-attach", detail: name });
    ok(res, { message: req.t("Bot added."), botId });
  }),
);

api.post(
  "/instances/:id/bots/delete",
  wrap(async (req, res) => {
    const instanceId = numericId(req.params.id);
    if (!instanceId) throw new HttpError("That bot does not exist or is not granted to you.", 404);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const name = parseTemplateName(req.body.name);
    const typed = String(req.body.confirm || "").trim();
    const rowId = await findTsBotId(instanceId, name);
    const access = rowId ? await accessToBot(req.user, rowId) : null;
    if (!access?.canDelete || access.bot.instanceId !== instanceId) {
      throw new HttpError("That bot does not exist or is not granted to you.", 404);
    }
    const visible = String(access.bot.label || access.bot.name || name).trim();
    if (typed !== name && typed !== visible) throw new HttpError("Type the bot name exactly to confirm.", 400);
    const instance = await getInstanceRow(instanceId);
    if (!instance) throw new HttpError("That bot does not exist or is not granted to you.", 404);
    await callBot(instanceClient(instance), ["settings", "delete", name]);
    await deleteTsBotByName(instanceId, name);
    await addAudit({ userId: req.user.id, instanceId, action: "bot-delete", detail: name });
    ok(res, { message: req.t("Bot removed.") });
  }),
);

async function openBot(req) {
  const id = numericId(req.params.id);
  if (!id) throw new HttpError("That bot does not exist or is not granted to you.", 404);
  const access = await accessToBot(req.user, id);
  if (!access) throw new HttpError("That bot does not exist or is not granted to you.", 404);
  return access;
}

function authOf(req, access) {
  return { role: req.user.role, canControl: access.canControl };
}

function detailText(t, action, args) {
  if (!action.detail) return null;
  const value = action.detail(args);
  if (value && typeof value === "object" && typeof value.key === "string") return t(value.key, value.params);
  return value == null ? null : String(value);
}

function botView(access, admin) {
  return {
    ...publicBot(access.bot, { admin }),
    canControl: access.canControl,
    canManage: access.canManage,
    canDelete: Boolean(access.canDelete),
  };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(Math.max(limit, 1), items.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

async function playbackOf(bot, t) {
  try {
    const status = presentStatus(await callBot(bot, statusParts(bot), { timeoutMs: 2500 }), t);
    return {
      online: true,
      title: status.song?.title || null,
      paused: status.song ? Boolean(status.song.paused) : null,
      volume: status.volume,
      error: status.problems[0] || null,
    };
  } catch (err) {
    const missing = err instanceof Ts3ApiError && missingLiveBot(err.message);
    return {
      online: false,
      title: null,
      paused: null,
      volume: null,
      error: missing ? null : err instanceof HttpError ? errorText(err, t) : t("Action failed"),
    };
  }
}

async function serverByTemplate(rows) {
  const instances = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.bot.instanceId)) continue;
    seen.add(row.bot.instanceId);
    instances.push(row.bot);
  }
  const found = new Map();
  await mapPool(instances, 4, async (bot) => {
    try {
      const data = await callBot({
        baseUrl: bot.baseUrl,
        apiUser: bot.apiUser,
        apiToken: bot.apiToken,
        tokenUnreadable: bot.tokenUnreadable,
        useInstance: false,
        instanceMode: "none",
      }, ["bot", "list"], { timeoutMs: 4000 });
      for (const item of presentBotList(data)) {
        if (item.name && item.server) found.set(`${bot.instanceId}:${item.name}`, item.server);
      }
    } catch {
      /* One instance can be offline without hiding the other rows. */
    }
  });
  return found;
}

api.get(
  "/bots",
  wrap(async (req, res) => {
    const admin = req.user.role === "admin";
    const live = req.query.status !== "0";
    const rows = await listAccessibleBots(req.user, { token: live });
    const servers = live ? await serverByTemplate(rows) : new Map();
    const bots = await mapPool(rows, live ? 4 : rows.length || 1, async (row) => {
      const playback = live ? await playbackOf(row.bot, req.t) : null;
      if (playback?.online) {
        playback.server = servers.get(`${row.bot.instanceId}:${row.bot.instanceRef}`) || "";
      }
      return {
        ...publicBot(row.bot, { admin }),
        canControl: row.canControl,
        canManage: row.canManage,
        canDelete: Boolean(row.canDelete),
        playback,
      };
    });
    const users = live && admin
      ? (await listUsers()).map((account) => ({ id: account.id, username: account.username }))
      : [];
    let canCreate = false;
    if (live) {
      canCreate = admin || Boolean(req.user.canCreateBots) || rows.some((row) => row.canManage);
      if (!canCreate) {
        const owned = await listInstancesForUser(req.user.id);
        canCreate = owned.some((row) => row.ownerUserId === req.user.id);
      }
    }
    ok(res, { bots, users, canCreate });
  }),
);

api.post(
  "/bots/:id/label",
  wrap(async (req, res) => {
    const access = await openBot(req);
    if (req.user.role !== "admin" && !access.canManage && !access.canControl) {
      throw new HttpError("You cannot manage bots on this instance.", 403);
    }
    const label = parseName(req.body.name);
    await setBotLabel(access.bot.id, label);
    await addAudit({
      userId: req.user.id,
      botId: access.bot.id,
      instanceId: access.bot.instanceId,
      action: "bot-label",
      detail: label,
    });
    ok(res, { message: req.t("Bot name saved."), name: label });
  }),
);

api.post(
  "/bots/:id/assignee",
  requireAdmin,
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const row = id ? await getTsBotRow(id) : null;
    if (!row) throw new HttpError("That bot does not exist or is not granted to you.", 404);
    const raw = String(req.body.userId ?? "").trim();
    let userId = null;
    let username = "";
    if (raw) {
      userId = numericId(raw);
      const account = userId ? await findUserById(userId) : null;
      if (!account) throw new HttpError("User not found", 404);
      username = account.username;
    }
    const charged = userId ?? (row.owner_user_id == null ? null : Number(row.owner_user_id));
    await setBotAssignee(id, userId, { quotaUserId: charged });
    await addAudit({
      userId: req.user.id,
      botId: id,
      instanceId: Number(row.instance_id),
      action: "bot-assign",
      detail: username || "unassigned",
    });
    ok(res, { message: req.t("Bot assigned.") });
  }),
);

api.post(
  "/bots/bulk",
  wrap(async (req, res) => {
    const { op, ids } = parseBulk(req.body);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000, ids.length)) {
      throw new HttpError("Too many actions. Wait a moment.", 429);
    }
    const results = await mapPool(ids, 4, async (id) => {
      const access = await accessToBot(req.user, id);
      if (!access) {
        return { id, name: "", ok: false, message: req.t("That bot does not exist or is not granted to you.") };
      }
      const name = access.bot.label || access.bot.name;
      if (!access.canControl) {
        return { id, name, ok: false, message: req.t("No control rights for this bot") };
      }
      try {
        let runOp = op;
        let body = req.body;
        if (op === "start") {
          runOp = "connect";
          body = { name: access.bot.instanceRef };
        } else if (op === "stop") {
          const listed = await callBot(access.bot, ["bot", "list"], { timeoutMs: 15000 });
          const liveId = ownLiveId(listed, access.bot.instanceRef);
          if (!liveId) return { id, name, ok: false, message: req.t("Offline") };
          runOp = "disconnect";
          body = { instanceId: liveId };
        }
        const { action, args } = await runAction(access.bot, runOp, body, authOf(req, access));
        if (action.audit) {
          await addAudit({
            userId: req.user.id,
            botId: access.bot.id,
            instanceId: access.bot.instanceId,
            action: runOp,
            detail: detailText(req.t, action, args),
          });
        }
        return { id, name, ok: true, message: req.t(action.success || "Done") };
      } catch (err) {
        const message = err instanceof HttpError ? errorText(err, req.t) : req.t("Action failed");
        return { id, name, ok: false, message };
      }
    });
    const succeeded = results.filter((item) => item.ok).length;
    ok(res, {
      message: req.t("Applied to {ok} of {total} bots.", { ok: succeeded, total: results.length }),
      results,
    });
  }),
);

api.get(
  "/bots/:id",
  wrap(async (req, res) => {
    const access = await openBot(req);
    ok(res, { bot: botView(access, req.user.role === "admin") });
  }),
);

api.get(
  "/bots/:id/status",
  wrap(async (req, res) => {
    const access = await openBot(req);
    try {
      const status = presentStatus(await callBot(access.bot, statusParts(access.bot), { timeoutMs: 8000 }), req.t);
      ok(res, { status: { ...status, online: true } });
    } catch (err) {
      if (err instanceof Ts3ApiError && missingLiveBot(err.message)) {
        ok(res, {
          status: { online: false, song: null, volume: null, repeat: null, shuffle: null, queue: null, problems: [] },
        });
        return;
      }
      throw err;
    }
  }),
);

// The bot keeps one result list per bot, and search-play picks by position in it. After another
// account searched on the same bot, a position would pick from that account's results.
const lastSearch = new Map();

export function searchStillOwn(searches, botId, userId) {
  return searches.get(botId) === userId;
}

api.get(
  "/bots/:id/search",
  wrap(async (req, res) => {
    const access = await openBot(req);
    if (!access.canControl) throw new HttpError("No control rights for search.", 403);
    if (!rateLimit(`search:${req.user.id}`, 20, 60_000)) throw new HttpError("Too many searches. Wait a moment.", 429);
    const query = String(req.query.q || "").trim();
    const factory = ["youtube", "soundcloud", "twitch", "media"].includes(req.query.factory) ? req.query.factory : "youtube";
    if (!query) return ok(res, { results: [] });
    const { data } = await runAction(access.bot, "search", { query, factory }, authOf(req, access));
    lastSearch.set(access.bot.id, req.user.id);
    ok(res, { results: presentSearch(data, req.t) });
  }),
);

api.post(
  "/bots/:id/action",
  wrap(async (req, res) => {
    const access = await openBot(req);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const op = String(req.body.op || "");
    if (op === "template-address" || op === "template-hosting" || op === "connect") {
      req.body.name = access.bot.instanceRef;
    }
    if (op === "disconnect" && req.user.role !== "admin") {
      const listed = await callBot(access.bot, ["bot", "list"], { timeoutMs: 15000 });
      const liveId = ownLiveId(listed, access.bot.instanceRef);
      if (!liveId || liveId !== String(req.body.instanceId ?? "").trim()) {
        throw new HttpError("You cannot manage bots on this instance.", 403);
      }
    }
    if (op === "use-instance") {
      if (!access.canManage) throw new HttpError("You cannot manage bots on this instance.", 403);
      const picked = parseUseInstance(req.body);
      if (picked.mode !== "template") throw new ValidationError("This instance has no usable name");
      await assertNewBot(access.bot.instanceId, picked.ref);
      const owner = access.bot.ownerUserId ?? null;
      const tsBotId = await ensureTsBot(access.bot.instanceId, picked.ref, picked.ref, owner, { quotaUserId: owner });
      await addAudit({
        userId: req.user.id,
        botId: tsBotId,
        instanceId: access.bot.instanceId,
        action: "use-instance",
        detail: picked.ref,
      });
      return ok(res, { message: req.t("This bot is ready."), botId: tsBotId });
    }
    if ((op === "search-play" || op === "search-add") && !searchStillOwn(lastSearch, access.bot.id, req.user.id)) {
      throw new HttpError("The search results changed. Search again.", 409);
    }
    if (op === "template-create") await assertNewBot(access.bot.instanceId, parseTemplateName(req.body.name));
    if (op === "template-hosting") {
      await useStartupStation(req);
      if (String(req.body.startup ?? "").trim()) await guardStream(parseStreamUrl(req.body.startup));
    }
    if (op === "play" || op === "add") await guardStream(parseStreamUrl(req.body.resource));
    const { action, args, data } = await runAction(access.bot, op, req.body, authOf(req, access));
    if (op === "template-hosting" || op === "template-address") await saveBotSettings(access.bot.id, settingsRecord(args));
    let botId = access.bot.id;
    if (op === "template-create") {
      const owner = access.bot.ownerUserId ?? null;
      botId = await ensureTsBot(access.bot.instanceId, args.name, args.name, owner, { quotaUserId: owner });
    }
    else if (op === "template-delete") await deleteTsBotByName(access.bot.instanceId, args.name);
    if (action.audit) {
      await addAudit({
        userId: req.user.id,
        botId: op === "template-delete" ? null : botId,
        instanceId: access.bot.instanceId,
        action: op,
        detail: detailText(req.t, action, args),
      });
    }
    const redirect = op === "template-delete" && args.name === access.bot.instanceRef ? `/instances/${access.bot.instanceId}` : null;
    const messageKey = typeof data?.messageKey === "string" ? data.messageKey : action.success || "Done";
    ok(res, { message: req.t(messageKey, data?.messageParams), redirect, botId: op === "template-create" ? botId : undefined });
  }),
);

function viewStream(stream, user) {
  return {
    id: stream.id,
    name: stream.name,
    displayUrl: displayStreamUrl(stream.url),
    notes: stream.notes,
    shared: stream.shared,
    ownerName: stream.ownerName,
    canDelete: user.role === "admin" || stream.ownerUserId === user.id,
  };
}

api.get(
  "/bots/:id/streams",
  wrap(async (req, res) => {
    const access = await openBot(req);
    const streams = (await listStreams(req.user)).map((stream) => viewStream(stream, req.user));
    ok(res, { streams, bot: botView(access, req.user.role === "admin") });
  }),
);

api.post(
  "/bots/:id/streams",
  wrap(async (req, res) => {
    const access = await openBot(req);
    if (!access.canControl) throw new HttpError("No control rights for this bot", 403);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const name = parseTitle(req.body.name, "Name");
    const url = parseStreamUrl(req.body.url);
    await guardStream(url);
    const notes = parseNotes(req.body.notes);
    const shared = req.user.role === "admin" && (req.body.shared === true || req.body.shared === "on" || req.body.shared === "1");
    await insertStream({ name, url, notes, shared, ownerUserId: req.user.id });
    await addAudit({ userId: req.user.id, botId: access.bot.id, instanceId: access.bot.instanceId, action: "stream-save", detail: name });
    ok(res, { message: req.t("Station saved.") });
  }),
);

api.post(
  "/bots/:id/streams/:streamId/play",
  wrap(async (req, res) => {
    const access = await openBot(req);
    if (!access.canControl) throw new HttpError("No control rights for this bot", 403);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const streamId = numericId(req.params.streamId);
    const stream = streamId ? await getStream(streamId, req.user) : null;
    if (!stream) throw new HttpError("That stream does not exist.", 404);
    const queue = req.body.op === "add";
    await guardStream(stream.url);
    await runAction(access.bot, queue ? "add" : "play", { resource: stream.url }, authOf(req, access));
    await addAudit({
      userId: req.user.id,
      botId: access.bot.id,
      instanceId: access.bot.instanceId,
      action: queue ? "stream-add" : "stream-play",
      detail: stream.name,
    });
    ok(res, { message: queue ? req.t("Added {name} to the queue", { name: stream.name }) : req.t("Playing {name}", { name: stream.name }) });
  }),
);

api.delete(
  "/bots/:id/streams/:streamId",
  wrap(async (req, res) => {
    const access = await openBot(req);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const streamId = numericId(req.params.streamId);
    const stream = streamId ? await getStream(streamId, req.user) : null;
    if (!stream) throw new HttpError("That stream does not exist.", 404);
    const removed = await deleteStream(stream.id, req.user);
    if (!removed) throw new HttpError("That stream does not exist.", 404);
    await addAudit({ userId: req.user.id, botId: access.bot.id, instanceId: access.bot.instanceId, action: "stream-delete", detail: stream.name });
    ok(res, { message: req.t("Station deleted.") });
  }),
);

// The reads below do not depend on each other, so they run together. A slow bot API then costs
// one timeout instead of the sum of all of them.
function settled(result, t, read) {
  if (result.status === "fulfilled") return { value: read(result.value), error: null };
  return { value: null, error: errorText(result.reason, t) };
}

api.get(
  "/bots/:id/connection",
  wrap(async (req, res) => {
    const access = await openBot(req);
    const bot = access.bot;
    const template = bot.instanceMode === "template" ? bot.instanceRef : "";
    const setting = (path) => (template
      ? callBot(bot, ["settings", "bot", "get", template, path], { timeoutMs: 4000 })
      : Promise.reject(new Error("no template")));
    const [listed, address, onConnect, commanderNow, sendModeStored, identity, streams] = await Promise.allSettled([
      callBot(bot, ["bot", "list"], { timeoutMs: 15000 }),
      setting("connect.address"),
      setting("events.onconnect"),
      callBot(bot, scope(bot, ["bot", "commander"]), { timeoutMs: 4000 }),
      setting("audio.send_mode"),
      readIdentity(bot, req.t),
      listStreams(req.user),
    ]);
    if (streams.status === "rejected") throw streams.reason;
    const list = settled(listed, req.t, (data) => presentBotList(data, req.t).find((item) => item.name === template) || null);
    const live = list.value;
    const listError = list.error;
    let storedAddress = bot.connectAddress || "";
    if (template && !live?.server && address.status === "fulfilled") {
      const fromBot = presentSetting(address.value);
      if (fromBot) storedAddress = fromBot;
    }
    const status = live?.status || (listError ? "unknown" : "offline");
    const botConnection = template
      ? {
          id: live?.id ?? null,
          name: template,
          server: live?.server || storedAddress,
          status,
          statusLabel: live?.statusLabel || (listError ? req.t("Unknown") : req.t("Offline")),
          error: listError,
        }
      : null;
    const saved = template ? settled(onConnect, req.t, (data) => commanderSaved(presentSetting(data))) : { value: null, error: null };
    const commander = settled(commanderNow, req.t, presentCommander);
    const sendMode = template ? settled(sendModeStored, req.t, (data) => presentSendMode(presentSetting(data))) : { value: null, error: null };
    const onServer = status === "connected" || status === "connecting";
    const who = identity.value;
    const whisperLive = { ...who.state, ...(onServer ? await readWhisperLists(bot, req.t, who.ownClientId) : emptyWhisperLists()) };
    const stations = streams.value;
    const hosting = hostingFromBot(bot);
    const startupMatches = hosting.startup
      ? stations.filter((stream) => displayStreamUrl(stream.url) === displayStreamUrl(hosting.startup))
      : [];
    hosting.startupStreamId = startupMatches.length === 1 ? startupMatches[0].id : null;
    ok(res, {
      connection: botConnection,
      bot: botView(access, req.user.role === "admin"),
      hosting,
      stations: stations.map((stream) => ({ id: stream.id, name: stream.name, url: displayStreamUrl(stream.url) })),
      commander: commander.value,
      commanderError: commander.error,
      commanderSaved: saved.value,
      commanderSavedError: saved.error,
      sendMode: sendMode.value,
      sendModeError: sendMode.error,
      ...whisperLive,
    });
  }),
);

// Whisper targets and the server tree change while the page is open, so the client polls this.
api.get(
  "/bots/:id/whisper",
  wrap(async (req, res) => {
    const access = await openBot(req);
    const [listed, who] = await Promise.all([
      callBot(access.bot, ["bot", "list"], { timeoutMs: 8000 })
        .then((data) => presentBotList(data).find((item) => item.name === access.bot.instanceRef)?.status || "offline")
        .catch(() => "unknown"),
      readIdentity(access.bot, req.t),
    ]);
    const onServer = listed === "connected" || listed === "connecting";
    const lists = onServer ? await readWhisperLists(access.bot, req.t, who.ownClientId) : emptyWhisperLists();
    ok(res, { status: listed, ...who.state, ...lists });
  }),
);

// Never rejects. A failure becomes teamspeakError.
async function readIdentity(bot, t) {
  const state = { teamspeakId: "", teamspeakError: null };
  let ownClientId = null;
  try {
    const identity = presentTsIdentity(await callBot(bot, scope(bot, ["bot", "info", "client"]), { timeoutMs: 4000 }));
    state.teamspeakId = identity.uid || identity.clientId || "";
    ownClientId = numericId(identity.clientId);
    if (!state.teamspeakId) state.teamspeakError = t("Unknown");
  } catch (err) {
    state.teamspeakError = errorText(err, t);
  }
  return { state, ownClientId };
}

function emptyWhisperLists() {
  return {
    whisper: null,
    whisperError: null,
    whisperClients: [],
    whisperChannels: [],
    channels: [],
    clients: [],
    treeError: null,
  };
}

async function readWhisperLists(bot, t, ownClientId) {
  const state = emptyWhisperLists();
  const [listed, tree] = await Promise.allSettled([
    callBot(bot, scope(bot, ["whisper", "list"]), { timeoutMs: 4000 }),
    callBot(bot, scope(bot, ["server", "tree"]), { timeoutMs: 8000 }),
  ]);
  if (listed.status === "fulfilled") {
    state.whisper = presentWhisper(listed.value);
    const targets = presentWhisperTargets(listed.value);
    state.whisperClients = targets.clients;
    state.whisperChannels = targets.channels;
  } else {
    state.whisperError = errorText(listed.reason, t);
  }
  if (tree.status === "fulfilled") {
    const present = presentServerTree(tree.value);
    state.channels = present.channels;
    // The bot cannot whisper to itself.
    state.clients = present.clients.filter((client) => client.id !== ownClientId);
  } else {
    state.treeError = errorText(tree.reason, t);
  }
  return state;
}

// A stream the bot fetches must not reach a bot API. parseStreamUrl already refuses loopback and port 58913.
async function guardStream(url) {
  if (!url) return;
  assertStreamTarget(url, await listApiHosts());
}

async function useStartupStation(req) {
  const raw = String(req.body.streamId ?? "").trim();
  delete req.body.streamId;
  if (!raw) return;
  const clear = req.body.clearStartup === true || req.body.clearStartup === "on" || req.body.clearStartup === "1";
  if (clear) return;
  const id = numericId(raw);
  const stream = id ? await getStream(id, req.user) : null;
  if (!stream) throw new HttpError("That stream does not exist.", 404);
  req.body.startup = stream.url;
}

function hostingFromBot(bot) {
  return {
    name: bot.instanceMode === "template" ? bot.instanceRef : bot.name || "",
    nickname: bot.connectNickname || "",
    channel: bot.connectChannel || "",
    bitrate: bot.connectBitrate,
    volume: bot.connectVolume,
    run: bot.connectRun,
    startup: bot.connectStartup || "",
    address: bot.connectAddress || "",
    hasServerPassword: Boolean(bot.hasServerPassword),
    hasChannelPassword: Boolean(bot.hasChannelPassword),
  };
}

api.use("/admin", requireAdmin);

async function assertOwner(ownerUserId) {
  if (ownerUserId == null) return null;
  const owner = await findUserById(ownerUserId);
  if (!owner) throw new ValidationError("Owner is invalid");
  return Number(owner.id);
}

api.post(
  "/admin/instances",
  wrap(async (req, res) => {
    const users = (await listUsers()).filter((account) => account.role !== "admin");
    const fields = parseInstanceForm(toFormBody(req.body), { weakKey: weakTokenKey() });
    fields.ownerUserId = await assertOwner(fields.ownerUserId);
    const grants = parseGrants(toFormBody(req.body), users).filter((grant) => grant.userId !== fields.ownerUserId);
    const id = await insertInstance(fields);
    await replaceGrants(id, grants);
    await addAudit({ userId: req.user.id, instanceId: id, action: "instance-create", detail: fields.name });
    ok(res, { message: req.t("Instance saved."), id });
  }),
);

api.post(
  "/admin/instances/:id",
  wrap(async (req, res) => {
    const existing = await getInstanceRow(numericId(req.params.id));
    if (!existing) throw new HttpError("Instance not found.", 404);
    const users = (await listUsers()).filter((account) => account.role !== "admin");
    const fields = parseInstanceForm(toFormBody(req.body), { keepExisting: true, weakKey: weakTokenKey() });
    fields.ownerUserId = await assertOwner(fields.ownerUserId);
    await updateInstanceRecord(existing.id, fields);
    await replaceGrants(existing.id, parseGrants(toFormBody(req.body), users).filter((grant) => grant.userId !== fields.ownerUserId));
    await addAudit({ userId: req.user.id, instanceId: existing.id, action: "instance-update", detail: fields.name });
    ok(res, { message: req.t("Instance saved.") });
  }),
);

api.post(
  "/admin/instances/:id/test",
  wrap(async (req, res) => {
    const instance = await getInstanceRow(numericId(req.params.id));
    if (!instance) throw new HttpError("Instance not found.", 404);
    const version = await readVersion(instanceClient(instance), 8000);
    ok(res, { message: req.t("API reachable{version}.", { version: version ? ` (${version})` : "" }) });
  }),
);

api.delete(
  "/admin/instances/:id",
  wrap(async (req, res) => {
    const instance = await getInstanceRow(numericId(req.params.id));
    if (!instance) throw new HttpError("Instance not found.", 404);
    if (String(req.body.confirm || "").trim() !== instance.name) {
      throw new HttpError("Type the instance name exactly to confirm.", 400);
    }
    await deleteInstance(instance.id);
    await addAudit({ userId: req.user.id, action: "instance-delete", detail: instance.name });
    ok(res, { message: req.t("Instance deleted.") });
  }),
);

function chosenInstanceIds(raw, known) {
  const ids = [];
  const seen = new Set();
  for (const value of Array.isArray(raw) ? raw : []) {
    const id = numericId(value);
    if (!id || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function assertInstanceMembership(user, instanceIds) {
  if (user.role === "admin" || instanceIds.length > 0) return;
  throw new ValidationError("Assign at least one instance");
}

async function adminDirectory() {
  const grants = await listGrantIds();
  const users = (await listUsers()).map((account) => ({
    ...account,
    instanceIds: grants.filter((grant) => grant.userId === account.id).map((grant) => grant.instanceId),
  }));
  const instances = (await listInstances()).map((row) => ({ id: row.id, name: row.name }));
  return { users, instances };
}

api.get(
  "/admin/users",
  wrap(async (req, res) => {
    ok(res, await adminDirectory());
  }),
);

api.post(
  "/admin/users/:id/instances",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const known = new Set((await listInstances()).map((row) => row.id));
    const instanceIds = chosenInstanceIds(req.body.instanceIds, known);
    await assertInstanceMembership(user, instanceIds);
    await replaceUserGrants(user.id, instanceIds);
    await addAudit({
      userId: req.user.id,
      action: "user-instances",
      detail: `${user.username} → ${instanceIds.join(",") || "none"}`,
    });
    ok(res, { message: req.t("Instances saved."), ...(await adminDirectory()) });
  }),
);

api.post(
  "/admin/users",
  wrap(async (req, res) => {
    const username = parseUsername(req.body.username);
    const password = parseOptionalPassword(req.body.password);
    const role = parseRole(req.body.role || "user");
    const botLimit = parseBotLimit(req.body.botLimit);
    const canCreateBots = req.body.canCreateBots === true || req.body.canCreateBots === "on" || req.body.canCreateBots === "1";
    const known = new Set((await listInstances()).map((row) => row.id));
    const instanceIds = chosenInstanceIds(req.body.instanceIds, known);
    if (role !== "admin" && instanceIds.length === 0) throw new ValidationError("Assign at least one instance");
    const id = await createUser({
      username,
      passwordHash: password ? await hashPassword(password) : null,
      role,
      botLimit,
      canCreateBots,
    });
    await replaceUserGrants(id, instanceIds);
    await addAudit({ userId: req.user.id, action: "user-create", detail: `${username} (${role}) id ${id}` });
    ok(res, { message: req.t("User created."), ...(await adminDirectory()) });
  }),
);

api.post(
  "/admin/users/:id/password",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const password = parsePassword(req.body.password);
    await setPassword(user.id, await hashPassword(password));
    await deleteSessionsForUser(user.id);
    await addAudit({ userId: req.user.id, action: "user-password", detail: user.username });
    if (user.id === req.user.id) {
      clearSessionCookie(res);
      return ok(res, { message: req.t("Password set for {name}. Existing sessions were signed out.", { name: user.username }), signedOut: true });
    }
    ok(res, { message: req.t("Password set for {name}. Existing sessions were signed out.", { name: user.username }), ...(await adminDirectory()) });
  }),
);

api.post(
  "/admin/users/:id/role",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const role = parseRole(req.body.role);
    if (user.role === "admin" && role !== "admin" && !user.suspended && (await countActiveAdmins()) <= 1) {
      throw new HttpError("The last administrator cannot be demoted.", 400);
    }
    if (role !== "admin") {
      const grants = (await listGrantIds()).filter((grant) => grant.userId === Number(user.id));
      await assertInstanceMembership({ role }, grants.map((grant) => grant.instanceId));
    }
    await setRole(user.id, role);
    await addAudit({ userId: req.user.id, action: "user-role", detail: `${user.username} → ${role}` });
    ok(res, { message: req.t("Role saved."), ...(await adminDirectory()) });
  }),
);

api.post(
  "/admin/users/:id/limit",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const botLimit = parseBotLimit(req.body.botLimit);
    await setBotLimit(user.id, botLimit);
    await addAudit({
      userId: req.user.id,
      action: "user-limit",
      detail: `${user.username} → ${botLimit == null ? "unlimited" : botLimit}`,
    });
    ok(res, { message: req.t("Bot limit saved."), ...(await adminDirectory()) });
  }),
);

api.post(
  "/admin/users/:id/create-bots",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const allowed = req.body.canCreateBots === true || req.body.canCreateBots === "on" || req.body.canCreateBots === "1";
    await setCanCreateBots(user.id, allowed);
    await addAudit({
      userId: req.user.id,
      action: "user-create-bots",
      detail: `${user.username} → ${allowed ? "yes" : "no"}`,
    });
    ok(res, { message: req.t("Bot permission saved."), ...(await adminDirectory()) });
  }),
);

api.post(
  "/admin/users/:id/suspend",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    const suspended = req.body.suspended === true || req.body.suspended === "1";
    if (Number(user.id) === req.user.id) throw new HttpError("You cannot suspend yourself.", 400);
    if (suspended && user.role === "admin" && !user.suspended && (await countActiveAdmins()) <= 1) {
      throw new HttpError("The last administrator cannot be suspended.", 400);
    }
    await setSuspended(user.id, suspended);
    if (suspended) await deleteSessionsForUser(user.id);
    await addAudit({ userId: req.user.id, action: suspended ? "user-suspend" : "user-restore", detail: user.username });
    ok(res, { message: suspended ? req.t("Account suspended.") : req.t("Account restored."), ...(await adminDirectory()) });
  }),
);

api.delete(
  "/admin/users/:id",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const user = id ? await findUserById(id) : null;
    if (!user) throw new HttpError("User not found", 404);
    if (user.id === req.user.id) throw new HttpError("You cannot delete yourself.", 400);
    if (req.body.confirm !== true && req.body.confirm !== "on") throw new HttpError("Delete must be confirmed", 400);
    if (user.role === "admin" && !user.suspended && (await countActiveAdmins()) <= 1) {
      throw new HttpError("The last administrator cannot be deleted.", 400);
    }
    await deleteUser(user.id);
    await addAudit({ userId: req.user.id, action: "user-delete", detail: user.username });
    ok(res, { message: req.t("User deleted."), ...(await adminDirectory()) });
  }),
);

async function inviteDirectory() {
  const instances = (await listInstances()).map((row) => ({ id: row.id, name: row.name }));
  const now = Date.now();
  return { invites: (await listInvites()).map((invite) => presentInvite(invite, now)), instances };
}

api.get(
  "/admin/invites",
  wrap(async (req, res) => {
    ok(res, await inviteDirectory());
  }),
);

api.post(
  "/admin/invites",
  wrap(async (req, res) => {
    const known = new Set((await listInstances()).map((row) => row.id));
    const fields = parseInviteForm(req.body, known);
    const { token, hash } = newInviteToken();
    const id = await insertInvite({ ...fields, tokenHash: hash, createdByUserId: req.user.id });
    await addAudit({
      userId: req.user.id,
      action: "invite-create",
      detail: `${inviteAuditLabel({ id, label: fields.label })} uses ${fields.maxUses} instances ${fields.instanceIds.join(",")}`,
    });
    ok(res, { message: req.t("Invite token created. Copy the link now. It is not shown again."), token, id, ...(await inviteDirectory()) });
  }),
);

api.post(
  "/admin/invites/:id/revoke",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const invite = id ? await getInvite(id) : null;
    if (!invite) throw new HttpError("Invite token not found.", 404);
    await revokeInvite(invite.id);
    await addAudit({ userId: req.user.id, action: "invite-revoke", detail: inviteAuditLabel(invite) });
    ok(res, { message: req.t("Invite token revoked."), ...(await inviteDirectory()) });
  }),
);

api.delete(
  "/admin/invites/:id",
  wrap(async (req, res) => {
    const id = numericId(req.params.id);
    const invite = id ? await getInvite(id) : null;
    if (!invite) throw new HttpError("Invite token not found.", 404);
    if (req.body.confirm !== true && req.body.confirm !== "on") throw new HttpError("Delete must be confirmed", 400);
    await deleteInvite(invite.id);
    await addAudit({ userId: req.user.id, action: "invite-delete", detail: inviteAuditLabel(invite) });
    ok(res, { message: req.t("Invite token deleted."), ...(await inviteDirectory()) });
  }),
);

api.get(
  "/admin/audit",
  wrap(async (req, res) => {
    ok(res, { rows: await listAudit(200) });
  }),
);

api.post(
  "/admin/audit/trim",
  wrap(async (req, res) => {
    if (req.body.confirm !== true && req.body.confirm !== "on") throw new HttpError("Delete must be confirmed", 400);
    const removed = await trimAuditLog();
    await addAudit({ userId: req.user.id, action: "audit-trim", detail: String(removed) });
    ok(res, {
      message: req.t("Removed {count} audit entries.", { count: removed }),
      rows: await listAudit(200),
    });
  }),
);

export function apiError(err, req, res, next) {
  if (res.headersSent) return next(err);
  sendError(err, req, res);
}
