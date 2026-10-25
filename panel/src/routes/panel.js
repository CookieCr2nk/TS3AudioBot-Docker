import { Router } from "express";
import { runAction } from "../actions.js";
import { callBot, statusParts } from "../ts3ab.js";
import {
  addAudit,
  listBots,
  listBotsForUser,
  mapBot,
  publicBot,
  setFlash,
  updateInstance,
  accessToBot,
} from "../db.js";
import { HttpError } from "../errors.js";
import { numericId, rateLimit, safeReferrer, wantsJson, wrap } from "../http.js";
import {
  needsRightsHint,
  presentBotList,
  presentHistory,
  presentPlaylist,
  presentPlaylists,
  presentSearch,
  presentStatus,
  presentVersion,
  safeHttpUrl,
} from "../present.js";
import { parseListId, parseUseInstance } from "../validate.js";

export const panelRouter = Router();

function authOf(req, access) {
  return { role: req.user.role, canControl: access.canControl };
}

async function openBot(req, res) {
  const id = numericId(req.params.id);
  if (!id) return null;
  const access = await accessToBot(req.user, id);
  if (!access) {
    const message = "Der Bot ist nicht vorhanden oder dir nicht freigegeben.";
    if (wantsJson(req)) res.status(404).json({ ok: false, error: message });
    else res.status(404).render("error", { title: "Nicht gefunden", message });
    return null;
  }
  return access;
}

panelRouter.get(
  "/",
  wrap(async (req, res) => {
    const admin = req.user.role === "admin";
    const rows = admin ? await listBots() : await listBotsForUser(req.user.id);
    const cards = await Promise.all(
      rows.map(async (row) => {
        const canControl = admin ? true : Boolean(row.can_control);
        let bot;
        try {
          bot = mapBot(row, { token: true });
        } catch (err) {
          return {
            id: Number(row.id),
            name: row.name,
            enabled: Boolean(row.enabled),
            notes: row.notes || "",
            baseUrl: admin ? row.base_url : null,
            online: false,
            error: err.message,
            canControl,
            version: null,
          };
        }
        const card = { ...publicBot(bot, { admin }), canControl, online: false, error: null, version: null };
        try {
          card.version = presentVersion(await callBot(bot, ["version"], { timeoutMs: 4000 }));
          card.online = true;
        } catch (err) {
          card.error = err.message;
        }
        return card;
      }),
    );
    res.render("dashboard", { title: "Übersicht", active: "dash", cards, admin });
  }),
);

panelRouter.get(
  "/bots/:id",
  wrap(async (req, res) => {
    const access = await openBot(req, res);
    if (!access) return;
    const { bot, canControl } = access;
    let status = null;
    let statusError = null;
    try {
      status = presentStatus(await callBot(bot, statusParts(bot), { timeoutMs: 12000 }));
    } catch (err) {
      statusError = err.message;
    }

    const query = String(req.query.search || "").trim();
    const factory = ["youtube", "soundcloud", "twitch", "media"].includes(req.query.factory)
      ? req.query.factory
      : "youtube";
    let results = [];
    let searchError = null;
    if (query) {
      if (!canControl) searchError = "Keine Steuerrechte für die Suche.";
      else if (!rateLimit(`search:${req.user.id}`, 20, 60_000)) searchError = "Zu viele Suchen. Bitte kurz warten.";
      else {
        try {
          const { data } = await runAction(bot, "search", { query, factory }, authOf(req, access));
          results = presentSearch(data);
        } catch (err) {
          searchError = err.message;
        }
      }
    }

    res.render("player", {
      title: bot.name,
      tab: "player",
      bot,
      access,
      status,
      statusError,
      rightsHint: needsRightsHint(statusError),
      query,
      factory,
      results,
      searchError,
      safeHttpUrl,
    });
  }),
);

panelRouter.get(
  "/bots/:id/status",
  wrap(async (req, res) => {
    const access = await openBot(req, res);
    if (!access) return;
    try {
      const status = presentStatus(await callBot(access.bot, statusParts(access.bot), { timeoutMs: 8000 }));
      res.json({ ok: true, status });
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message });
    }
  }),
);

panelRouter.get(
  "/bots/:id/history",
  wrap(async (req, res) => {
    const access = await openBot(req, res);
    if (!access) return;
    const query = String(req.query.q || "").trim();
    let rows = [];
    let error = null;
    try {
      const op = query ? "history-search" : "history-last";
      const { data } = await runAction(access.bot, op, { query }, authOf(req, access));
      rows = presentHistory(data);
    } catch (err) {
      error = err.message;
    }
    res.render("history", {
      title: `Verlauf · ${access.bot.name}`,
      tab: "history",
      bot: access.bot,
      access,
      rows,
      query,
      error,
      rightsHint: needsRightsHint(error),
    });
  }),
);

panelRouter.get(
  "/bots/:id/playlists",
  wrap(async (req, res) => {
    const access = await openBot(req, res);
    if (!access) return;
    let lists = [];
    let error = null;
    try {
      const { data } = await runAction(access.bot, "list-list", {}, authOf(req, access));
      lists = presentPlaylists(data);
    } catch (err) {
      error = err.message;
    }
    res.render("playlists", {
      title: `Playlists · ${access.bot.name}`,
      tab: "playlists",
      bot: access.bot,
      access,
      lists,
      error,
      rightsHint: needsRightsHint(error),
    });
  }),
);

panelRouter.get(
  "/bots/:id/playlists/:listId",
  wrap(async (req, res) => {
    const access = await openBot(req, res);
    if (!access) return;
    let listId;
    try {
      listId = parseListId(req.params.listId);
    } catch (err) {
      res.status(400).render("error", { title: "Playlist", message: err.message });
      return;
    }
    const page = Math.max(1, numericId(req.query.page) || 1);
    const perPage = 50;
    let playlist = null;
    let error = null;
    try {
      const { data } = await runAction(
        access.bot,
        "list-show",
        { listId, offset: (page - 1) * perPage, count: perPage },
        authOf(req, access),
      );
      playlist = presentPlaylist(data);
      if (!playlist) throw new HttpError("Die Playlist konnte nicht gelesen werden", 502);
    } catch (err) {
      error = err.message;
    }
    res.render("playlist", {
      title: playlist?.title || listId,
      tab: "playlists",
      bot: access.bot,
      access,
      listId,
      playlist,
      page,
      perPage,
      error,
      safeHttpUrl,
    });
  }),
);

panelRouter.get(
  "/bots/:id/instances",
  wrap(async (req, res) => {
    if (req.user.role !== "admin") throw new HttpError("Nur für Administratoren", 403);
    const access = await openBot(req, res);
    if (!access) return;
    let instances = [];
    let error = null;
    try {
      const { data } = await runAction(access.bot, "bot-list", {}, authOf(req, access));
      instances = presentBotList(data).map((item) => ({
        ...item,
        current:
          (access.bot.instanceMode === "template" && item.name === access.bot.instanceRef) ||
          (access.bot.instanceMode === "id" && String(item.id) === access.bot.instanceRef),
      }));
    } catch (err) {
      error = err.message;
    }
    res.render("instances", {
      title: `Instanzen · ${access.bot.name}`,
      tab: "instances",
      bot: access.bot,
      access,
      instances,
      error,
      rightsHint: needsRightsHint(error),
    });
  }),
);

panelRouter.post(
  "/bots/:id/action",
  wrap(async (req, res) => {
    const access = await openBot(req, res);
    if (!access) return;
    if (!rateLimit(`action:${req.user.id}`, 60, 60_000)) {
      throw new HttpError("Zu viele Aktionen. Bitte kurz warten.", 429);
    }

    if (req.body.op === "use-instance") {
      if (req.user.role !== "admin") throw new HttpError("Nur für Administratoren", 403);
      const instance = parseUseInstance(req.body);
      await updateInstance(access.bot.id, instance);
      await addAudit({
        userId: req.user.id,
        botId: access.bot.id,
        action: "use-instance",
        detail: `${instance.mode} ${instance.ref}`.trim(),
      });
      await setFlash(req.sessionId, "ok", "Diese Instanz steuert jetzt die Wiedergabe.");
      return res.redirect(safeReferrer(req));
    }

    const { action, args } = await runAction(access.bot, String(req.body.op || ""), req.body, authOf(req, access));
    if (action.audit) {
      await addAudit({
        userId: req.user.id,
        botId: access.bot.id,
        action: req.body.op,
        detail: action.detail ? action.detail(args) : null,
      });
    }
    if (wantsJson(req)) return res.json({ ok: true });
    await setFlash(req.sessionId, "ok", action.success || "Erledigt");
    return res.redirect(safeReferrer(req));
  }),
);
