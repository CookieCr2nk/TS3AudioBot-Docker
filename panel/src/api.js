import { Router } from "express";
import { randomBytes } from "node:crypto";
import { commanderSaved, parseBulk, runAction } from "./actions.js";
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
  getStream,
  insertInstance,
  insertStream,
  instanceClient,
  listAudit,
  listGrantIds,
  listGrants,
  listAccessibleBots,
  listInstances,
  listInstancesForUser,
  listStreams,
  listUsers,
  publicBot,
  replaceGrants,
  replaceUserGrants,
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
import { HttpError, ValidationError } from "./errors.js";
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
import { de, errorText, languageFromHeader, translator } from "./i18n.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import {
  displayStreamUrl,
  presentBotList,
  presentCommander,
  presentSetting,
  presentTsIdentity,
  presentHistory,
  presentPlaylist,
  presentPlaylists,
  presentSearch,
  presentStatus,
  presentVersion,
} from "./present.js";
import { callBot, scope, statusParts } from "./ts3ab.js";
import {
  parseBotLimit,
  parseGrants,
  parseInstanceForm,
  parseListId,
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

export const api = Router();

api.use((req, res, next) => {
  const lang = languageFromHeader(req.get("accept-language"));
  req.lang = lang;
  req.t = translator(lang);
  next();
});

function sendError(err, req, res) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ ok: false, error: errorText(err, req.t) });
}

function ok(res, body = {}, status = 200) {
  res.status(status).json({ ok: true, ...body });
}

function sessionPayload(req) {
  return {
    user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role, canCreateBots: Boolean(req.user.canCreateBots) } : null,
    csrf: req.csrf || "",
    lang: req.lang,
    phrases: req.lang === "de" ? de : {},
  };
}

api.get("/session", (req, res) => ok(res, sessionPayload(req)));

api.post(
  "/login",
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim().slice(0, 32);
    const password = String(req.body.password || "");
    if (!rateLimit(`login:${req.ip}:${username.toLowerCase()}`, 8, 15 * 60 * 1000)) {
      throw new HttpError("Too many attempts. Try again later.", 429);
    }
    const user = await findUserByUsername(username);
    const valid = await verifyPassword(password, user?.password_hash);
    if (user?.suspended) throw new HttpError("This account is suspended.", 401);
    if (!user || !valid) {
      await addAudit({
        userId: user?.id ?? null,
        action: "login-failed",
        detail: req.t("Login failed for {name} from {ip}", { name: username || req.t("unknown"), ip: req.ip }),
      });
      throw new HttpError("Username or password is wrong.", 401);
    }
    const token = randomBytes(32).toString("base64url");
    const csrf = newCsrf();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createSession({ id: sha256(token), userId: user.id, csrf, expiresAt });
    await touchLogin(user.id);
    await addAudit({ userId: user.id, action: "login", detail: req.ip });
    res.cookie("ts3panel", token, cookieOptions());
    req.user = { id: user.id, username: user.username, role: user.role };
    req.csrf = csrf;
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
    const user = await findUserByUsername(req.user.username);
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

api.get(
  "/overview",
  wrap(async (req, res) => {
    const admin = req.user.role === "admin";
    const rows = admin ? await listInstances() : await listInstancesForUser(req.user.id);
    const cards = await Promise.all(
      rows.map(async (row) => {
        const card = { ...publicInstance(row, admin), canControl: admin ? true : Boolean(row.canControl), online: false, version: null, error: null };
        try {
          const full = await getInstanceRow(row.id);
          card.version = presentVersion(await callBot(instanceClient(full), ["version"], { timeoutMs: 4000 }));
          card.online = true;
        } catch (err) {
          card.error = errorText(err, req.t);
        }
        return card;
      }),
    );
    ok(res, { cards });
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
      instances: rows.map((row) => ({
        ...publicInstance(row, admin),
        canCreate: admin || row.ownerUserId === req.user.id || Boolean(req.user.canCreateBots),
      })),
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

async function assertUserQuota(userId, exceptBotId = null) {
  if (userId == null) return;
  const owner = await findUserById(userId);
  if (!owner || owner.bot_limit == null) return;
  const limit = Number(owner.bot_limit);
  const count = await countOwnedBots(owner.id, exceptBotId);
  if (count >= limit) throw new HttpError("Bot limit reached ({count}).", 403, { count: limit });
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
    const name = parseTemplateName(req.body.name);
    const charged = chargedUserId(req, access.instance);
    if (!(await findTsBotId(access.instance.id, name))) await assertUserQuota(charged);
    await callBot(instanceClient(access.instance), ["settings", "create", name]);
    const botId = await ensureTsBot(access.instance.id, name, charged);
    await addAudit({ userId: req.user.id, botId, instanceId: access.instance.id, action: "bot-create", detail: name });
    ok(res, { message: req.t("Bot created."), botId });
  }),
);

api.post(
  "/instances/:id/bots/attach",
  wrap(async (req, res) => {
    const access = await openInstanceForCreate(req);
    assertCanCreate(req, access);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const name = parseTemplateName(req.body.name);
    const charged = chargedUserId(req, access.instance);
    if (!(await findTsBotId(access.instance.id, name))) await assertUserQuota(charged);
    const botId = await ensureTsBot(access.instance.id, name, charged);
    await addAudit({ userId: req.user.id, botId, instanceId: access.instance.id, action: "bot-attach", detail: name });
    ok(res, { message: req.t("Bot added."), botId });
  }),
);

api.post(
  "/instances/:id/bots/delete",
  wrap(async (req, res) => {
    const access = await openInstance(req);
    manageable(access);
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    const name = parseTemplateName(req.body.name);
    const typed = String(req.body.confirm || "").trim();
    const rowId = await findTsBotId(access.instance.id, name);
    const row = rowId ? await getTsBotRow(rowId) : null;
    const visible = (row?.label || name).trim();
    if (typed !== name && typed !== visible) throw new HttpError("Type the bot name exactly to confirm.", 400);
    await callBot(instanceClient(access.instance), ["settings", "delete", name]);
    await deleteTsBotByName(access.instance.id, name);
    await addAudit({ userId: req.user.id, instanceId: access.instance.id, action: "bot-delete", detail: name });
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
  return { ...publicBot(access.bot, { admin }), canControl: access.canControl, canManage: access.canManage };
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
    return { online: false, title: null, paused: null, volume: null, error: err instanceof HttpError ? errorText(err, t) : t("Action failed") };
  }
}

api.get(
  "/bots",
  wrap(async (req, res) => {
    const admin = req.user.role === "admin";
    const live = req.query.status !== "0";
    const rows = await listAccessibleBots(req.user);
    const bots = await mapPool(rows, live ? 4 : rows.length || 1, async (row) => ({
      ...publicBot(row.bot, { admin }),
      canControl: row.canControl,
      canManage: row.canManage,
      playback: live ? await playbackOf(row.bot, req.t) : null,
    }));
    const users = admin ? (await listUsers()).map((account) => ({ id: account.id, username: account.username })) : [];
    let canCreate = admin || Boolean(req.user.canCreateBots) || rows.some((row) => row.canManage);
    if (!canCreate) {
      const owned = await listInstancesForUser(req.user.id);
      canCreate = owned.some((row) => row.ownerUserId === req.user.id);
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
    await assertUserQuota(charged, id);
    await setBotAssignee(id, userId);
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
    for (const id of ids) {
      if (!id || !rateLimit(`action:${req.user.id}`, 60, 60_000)) throw new HttpError("Too many actions. Wait a moment.", 429);
    }
    const results = await mapPool(ids, 4, async (id) => {
      const access = await accessToBot(req.user, id);
      if (!access) {
        return { id, name: "", ok: false, message: req.t("That bot does not exist or is not granted to you.") };
      }
      if (!access.canControl) {
        return { id, name: access.bot.name, ok: false, message: req.t("No control rights for this bot") };
      }
      try {
        const { action, args } = await runAction(access.bot, op, req.body, authOf(req, access));
        if (action.audit) {
          await addAudit({
            userId: req.user.id,
            botId: access.bot.id,
            instanceId: access.bot.instanceId,
            action: op,
            detail: detailText(req.t, action, args),
          });
        }
        return { id, name: access.bot.name, ok: true, message: req.t(action.success || "Done") };
      } catch (err) {
        const message = err instanceof HttpError ? errorText(err, req.t) : req.t("Action failed");
        return { id, name: access.bot.name, ok: false, message };
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
    const status = presentStatus(await callBot(access.bot, statusParts(access.bot), { timeoutMs: 8000 }), req.t);
    ok(res, { status });
  }),
);

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
      req.body.name = access.bot.name;
    }
    if (op === "use-instance") {
      if (!access.canManage) throw new HttpError("You cannot manage bots on this instance.", 403);
      const picked = parseUseInstance(req.body);
      if (picked.mode !== "template") throw new ValidationError("This instance has no usable name");
      await assertNewBot(access.bot.instanceId, picked.ref);
      const tsBotId = await ensureTsBot(access.bot.instanceId, picked.ref, access.bot.ownerUserId ?? null);
      await addAudit({
        userId: req.user.id,
        botId: tsBotId,
        instanceId: access.bot.instanceId,
        action: "use-instance",
        detail: picked.ref,
      });
      return ok(res, { message: req.t("This bot is ready."), botId: tsBotId });
    }
    if (op === "template-create") await assertNewBot(access.bot.instanceId, parseTemplateName(req.body.name));
    const { action, args, data } = await runAction(access.bot, op, req.body, authOf(req, access));
    let botId = access.bot.id;
    if (op === "template-create") botId = await ensureTsBot(access.bot.instanceId, args.name, access.bot.ownerUserId ?? null);
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
    const redirect = op === "template-delete" && args.name === access.bot.name ? `/instances/${access.bot.instanceId}` : null;
    const messageKey = typeof data?.messageKey === "string" ? data.messageKey : action.success || "Done";
    ok(res, { message: req.t(messageKey), redirect, botId: op === "template-create" ? botId : undefined });
  }),
);

api.get(
  "/bots/:id/history",
  wrap(async (req, res) => {
    const access = await openBot(req);
    const query = String(req.query.q || "").trim();
    const op = query ? "history-search" : "history-last";
    const { data } = await runAction(access.bot, op, { query }, authOf(req, access));
    ok(res, { rows: presentHistory(data, req.t), bot: botView(access, req.user.role === "admin") });
  }),
);

api.get(
  "/bots/:id/playlists",
  wrap(async (req, res) => {
    const access = await openBot(req);
    const { data } = await runAction(access.bot, "list-list", {}, authOf(req, access));
    ok(res, { lists: presentPlaylists(data), bot: botView(access, req.user.role === "admin") });
  }),
);

api.get(
  "/bots/:id/playlists/:listId",
  wrap(async (req, res) => {
    const access = await openBot(req);
    const listId = parseListId(req.params.listId);
    const page = Math.max(1, numericId(req.query.page) || 1);
    const perPage = 50;
    const { data } = await runAction(
      access.bot,
      "list-show",
      { listId, offset: (page - 1) * perPage, count: perPage },
      authOf(req, access),
    );
    const playlist = presentPlaylist(data, req.t);
    if (!playlist) throw new HttpError("The playlist could not be read", 502);
    ok(res, { playlist, page, perPage, bot: botView(access, req.user.role === "admin") });
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

api.get(
  "/bots/:id/connection",
  requireAdmin,
  wrap(async (req, res) => {
    const access = await openBot(req);
    const template = access.bot.instanceMode === "template" ? access.bot.instanceRef : "";
    const { data } = await runAction(access.bot, "bot-list", {}, authOf(req, access));
    const live = presentBotList(data, req.t).find((item) => item.name === template) || null;
    let storedAddress = "";
    if (template && !live?.server) {
      try {
        storedAddress = presentSetting(await callBot(access.bot, ["settings", "bot", "get", template, "connect.address"], { timeoutMs: 4000 }));
      } catch {
        storedAddress = "";
      }
    }
    const botConnection = template
      ? {
          id: live?.id ?? null,
          name: template,
          server: live?.server || storedAddress,
          status: live?.status || "offline",
          statusLabel: live?.statusLabel || req.t("Offline"),
        }
      : null;
    let commanderSavedValue = null;
    let commanderSavedError = null;
    if (template) {
      try {
        const stored = presentSetting(await callBot(access.bot, ["settings", "bot", "get", template, "events.onconnect"], { timeoutMs: 4000 }));
        commanderSavedValue = commanderSaved(stored);
      } catch (err) {
        commanderSavedError = errorText(err, req.t);
      }
    }
    let commander = null;
    let commanderError = null;
    try {
      commander = presentCommander(await callBot(access.bot, scope(access.bot, ["bot", "commander"]), { timeoutMs: 4000 }));
    } catch (err) {
      commanderError = errorText(err, req.t);
    }
    let teamspeakId = "";
    let teamspeakError = null;
    try {
      const identity = presentTsIdentity(await callBot(access.bot, scope(access.bot, ["bot", "info", "client"]), { timeoutMs: 4000 }));
      teamspeakId = identity.uid || identity.clientId || "";
      if (!teamspeakId) teamspeakError = req.t("Unknown");
    } catch (err) {
      teamspeakError = errorText(err, req.t);
    }
    ok(res, {
      connection: botConnection,
      bot: botView(access, true),
      hosting: parseHostingPreview(access.bot),
      commander,
      commanderError,
      commanderSaved: commanderSavedValue,
      commanderSavedError,
      teamspeakId,
      teamspeakError,
    });
  }),
);

function parseHostingPreview(bot) {
  return { name: bot.instanceMode === "template" ? bot.instanceRef : bot.name || "" };
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
    const fields = parseInstanceForm(toFormBody(req.body));
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
    const fields = parseInstanceForm(toFormBody(req.body), { keepExisting: true });
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
    const version = presentVersion(await callBot(instanceClient(instance), ["version"], { timeoutMs: 8000 }));
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
    const raw = Array.isArray(req.body.instanceIds) ? req.body.instanceIds : [];
    const instanceIds = [...new Set(raw.map((value) => numericId(value)).filter((value) => known.has(value)))];
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
    const id = await createUser({
      username,
      passwordHash: password ? await hashPassword(password) : null,
      role,
      botLimit,
      canCreateBots,
    });
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

api.get(
  "/admin/audit",
  wrap(async (req, res) => {
    ok(res, { rows: await listAudit(200) });
  }),
);

export function apiError(err, req, res, next) {
  if (res.headersSent) return next(err);
  sendError(err, req, res);
}
