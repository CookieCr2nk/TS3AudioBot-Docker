import { HttpError, Ts3ApiError, ValidationError } from "./errors.js";
import { presentBotList } from "./present.js";
import { callBot, scope } from "./ts3ab.js";
import {
  parseChannel,
  parseHostingSettings,
  parseIndex,
  parseListId,
  parsePrivilegeKey,
  parseResource,
  parseSearchQuery,
  parseTemplateName,
  parseTitle,
  parseTsAddress,
  parseVolume,
} from "./validate.js";

const SLOW = 90000;

function choice(value, allowed, label) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!allowed.includes(text)) throw new ValidationError("{label} is invalid", { label });
  return text;
}

function listTarget(input) {
  const id = parseListId(input.listId);
  if (input.index === undefined || input.index === "") return { id, index: null };
  return { id, index: parseIndex(input.index, "Position", 100000) };
}

export const actions = {
  pause: { control: true, audit: true, success: "Playback paused", build: () => ["pause"] },
  resume: { control: true, audit: true, success: "Playback resumed", build: () => ["play"] },
  stop: { control: true, audit: true, success: "Playback stopped", build: () => ["stop"] },
  next: { control: true, audit: true, success: "Next track", timeoutMs: SLOW, build: () => ["next"] },
  previous: { control: true, audit: true, success: "Previous track", timeoutMs: SLOW, build: () => ["previous"] },
  clear: { control: true, audit: true, success: "Queue cleared", build: () => ["clear"] },
  volume: {
    control: true,
    audit: true,
    success: "Volume set",
    parse: (input) => ({ volume: parseVolume(input.volume) }),
    build: (args) => ["volume", String(args.volume)],
    detail: (args) => ({ key: "Volume {volume}", params: { volume: args.volume } }),
  },
  seek: {
    control: true,
    audit: true,
    success: "Position set",
    parse: (input) => ({ seconds: parseIndex(input.seconds, "Position", 86400) }),
    build: (args) => ["seek", String(args.seconds)],
    detail: (args) => ({ key: "Position {seconds}s", params: { seconds: args.seconds } }),
  },
  nudge: {
    control: true,
    audit: true,
    success: "Position set",
    parse: (input) => {
      const delta = Number(input.delta);
      if (![-30, -10, 10, 30].includes(delta)) throw new ValidationError("That seek is invalid");
      return { delta };
    },
    async run(bot, args, call) {
      const song = await call(scope(bot, ["song"]), 15000);
      const position = song && typeof song === "object" ? Number(song.Position) || 0 : 0;
      const seconds = Math.max(0, Math.min(86400, Math.floor(position + args.delta)));
      await call(scope(bot, ["seek", String(seconds)]), 15000);
      return { seconds };
    },
    detail: (args) => ({ key: "Seek {delta}s", params: { delta: args.delta } }),
  },
  repeat: {
    control: true,
    audit: true,
    success: "Repeat set",
    parse: (input) => ({ mode: choice(input.mode, ["off", "one", "all"], "Repeat") }),
    build: (args) => ["repeat", args.mode],
    detail: (args) => ({ key: "Repeat {mode}", params: { mode: args.mode } }),
  },
  random: {
    control: true,
    audit: true,
    success: "Shuffle set",
    parse: (input) => ({ mode: choice(input.mode, ["on", "off"], "Shuffle") }),
    build: (args) => ["random", args.mode],
    detail: (args) => ({ key: "Shuffle {mode}", params: { mode: args.mode } }),
  },
  play: {
    control: true,
    audit: true,
    success: "Playback started",
    timeoutMs: SLOW,
    parse: (input) => ({ resource: parseResource(input.resource) }),
    build: (args) => ["play", args.resource],
    detail: (args) => args.resource.slice(0, 180),
  },
  add: {
    control: true,
    audit: true,
    success: "Added to the queue",
    timeoutMs: SLOW,
    parse: (input) => ({ resource: parseResource(input.resource) }),
    build: (args) => ["add", args.resource],
    detail: (args) => args.resource.slice(0, 180),
  },
  jump: {
    control: true,
    audit: true,
    success: "Jumped in the queue",
    timeoutMs: SLOW,
    parse: (input) => ({ index: parseIndex(input.index, "Position", 100000) }),
    build: (args) => ["jump", String(args.index)],
    detail: (args) => `Index ${args.index}`,
  },
  move: {
    admin: true,
    audit: true,
    success: "Bot moved",
    parse: (input) => ({ channel: parseChannel(input.channel) }),
    build: (args) => ["bot", "move", args.channel],
    detail: (args) => args.channel,
  },
  "history-last": {
    parse: () => ({}),
    build: () => ["history", "last", "40"],
  },
  "history-search": {
    parse: (input) => ({ query: parseSearchQuery(input.query) }),
    build: (args) => ["history", "title", args.query],
  },
  "history-play": {
    control: true,
    audit: true,
    success: "Started from history",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseIndex(input.historyId, "History ID", 1_000_000_000) }),
    build: (args) => ["history", "play", String(args.id)],
    detail: (args) => ({ key: "History {id}", params: { id: args.id } }),
  },
  search: {
    control: true,
    timeoutMs: SLOW,
    parse: (input) => ({
      factory: choice(input.factory || "youtube", ["youtube", "soundcloud", "twitch", "media"], "Source"),
      query: parseSearchQuery(input.query),
    }),
    build: (args) => ["search", "from", args.factory, args.query],
  },
  "search-play": {
    control: true,
    audit: true,
    success: "Playing search result",
    timeoutMs: SLOW,
    parse: (input) => ({ index: parseIndex(input.index, "Result", 1000) }),
    build: (args) => ["search", "play", String(args.index)],
    detail: (args) => ({ key: "Result {index}", params: { index: args.index } }),
  },
  "search-add": {
    control: true,
    audit: true,
    success: "Search result added to the queue",
    timeoutMs: SLOW,
    parse: (input) => ({ index: parseIndex(input.index, "Result", 1000) }),
    build: (args) => ["search", "add", String(args.index)],
    detail: (args) => ({ key: "Result {index}", params: { index: args.index } }),
  },
  "list-list": {
    build: () => ["list", "list"],
  },
  "list-show": {
    parse: (input) => ({
      id: parseListId(input.listId),
      offset: parseIndex(input.offset ?? 0, "Offset", 1_000_000),
      count: parseIndex(input.count ?? 50, "Count", 100),
    }),
    build: (args) => ["list", "show", args.id, String(args.offset), String(args.count)],
  },
  "list-create": {
    control: true,
    audit: true,
    success: "Playlist created",
    parse: (input) => ({ id: parseListId(input.listId), title: parseTitle(input.title) }),
    build: (args) => ["list", "create", args.id, args.title],
    detail: (args) => args.id,
  },
  "list-rename": {
    control: true,
    audit: true,
    success: "Playlist renamed",
    parse: (input) => ({ id: parseListId(input.listId), title: parseTitle(input.title) }),
    build: (args) => ["list", "name", args.id, args.title],
    detail: (args) => `${args.id} → ${args.title}`,
  },
  "list-delete": {
    control: true,
    audit: true,
    success: "Playlist deleted",
    parse: (input) => {
      if (input.confirm !== "on") throw new ValidationError("Delete must be confirmed");
      return { id: parseListId(input.listId) };
    },
    build: (args) => ["list", "delete", args.id],
    detail: (args) => args.id,
  },
  "list-add": {
    control: true,
    audit: true,
    success: "Track added to the playlist",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseListId(input.listId), resource: parseResource(input.resource) }),
    build: (args) => ["list", "add", args.id, args.resource],
    detail: (args) => `${args.id}: ${args.resource.slice(0, 140)}`,
  },
  "list-import": {
    control: true,
    audit: true,
    success: "Playlist imported",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseListId(input.listId), resource: parseResource(input.resource) }),
    build: (args) => ["list", "import", args.id, args.resource],
    detail: (args) => `${args.id}: ${args.resource.slice(0, 140)}`,
  },
  "list-play": {
    control: true,
    audit: true,
    success: "Playlist started",
    timeoutMs: SLOW,
    parse: listTarget,
    build: (args) => (args.index === null ? ["list", "play", args.id] : ["list", "play", args.id, String(args.index)]),
    detail: (args) => (args.index === null ? args.id : { key: "{id} from {index}", params: { id: args.id, index: args.index } }),
  },
  "list-queue": {
    control: true,
    audit: true,
    success: "Playlist appended to the queue",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseListId(input.listId) }),
    build: (args) => ["list", "queue", args.id],
    detail: (args) => args.id,
  },
  "list-item-delete": {
    control: true,
    audit: true,
    success: "Track removed from the playlist",
    parse: (input) => ({ id: parseListId(input.listId), index: parseIndex(input.index, "Position", 100000) }),
    build: (args) => ["list", "item", "delete", args.id, String(args.index)],
    detail: (args) => `${args.id} #${args.index}`,
  },
  "bot-list": {
    admin: true,
    scoped: false,
    build: () => ["bot", "list"],
  },
  connect: {
    admin: true,
    audit: true,
    scoped: false,
    success: "Instance is starting",
    timeoutMs: 30000,
    parse: (input) => ({ name: parseTemplateName(input.name) }),
    build: (args) => ["bot", "connect", "template", args.name],
    detail: (args) => args.name,
  },
  disconnect: {
    admin: true,
    audit: true,
    scoped: false,
    success: "Instance is disconnecting",
    timeoutMs: 20000,
    parse: (input) => ({ instanceId: String(parseIndex(input.instanceId, "Instance ID", 1_000_000)) }),
    build: (args) => ["bot", "use", args.instanceId, ["bot", "disconnect"]],
    detail: (args) => `ID ${args.instanceId}`,
  },
  "template-create": {
    admin: true,
    audit: true,
    scoped: false,
    success: "Template created",
    parse: (input) => ({ name: parseTemplateName(input.name) }),
    build: (args) => ["settings", "create", args.name],
    detail: (args) => args.name,
  },
  "template-delete": {
    admin: true,
    audit: true,
    scoped: false,
    success: "Template deleted",
    parse: (input) => {
      const name = parseTemplateName(input.name);
      if (String(input.confirm ?? "").trim() !== name) {
        throw new ValidationError("Type the instance name exactly to confirm");
      }
      return { name };
    },
    build: (args) => ["settings", "delete", args.name],
    detail: (args) => args.name,
  },
  "template-address": {
    admin: true,
    audit: true,
    scoped: false,
    success: "Server address saved",
    parse: (input) => ({ name: parseTemplateName(input.name), address: parseTsAddress(input.address) }),
    build: (args) => ["settings", "bot", "set", args.name, "connect.address", args.address],
    detail: (args) => `${args.name} → ${args.address}`,
  },
  "template-hosting": {
    admin: true,
    audit: true,
    scoped: false,
    success: "Connection settings saved",
    parse: (input) => parseHostingSettings(input),
    async run(bot, args, call) {
      for (const parts of hostingCalls(args)) {
        await call(parts, 15000);
      }
      if (!args.nickname) return undefined;
      let connected = false;
      try {
        connected = templateIsConnected(await call(["bot", "list"], 15000), args.name);
      } catch (err) {
        if (!(err instanceof Ts3ApiError)) throw err;
        connected = true;
      }
      if (!connected) return { messageKey: "Connection settings saved. The nickname changes when this bot connects." };
      try {
        await call(liveRenameParts(args.name, args.nickname), 15000);
      } catch (err) {
        if (!(err instanceof Ts3ApiError)) throw err;
        return { messageKey: "Connection settings saved. The connected name could not be changed." };
      }
      return { messageKey: "Connection settings saved. The nickname is updated." };
    },
    detail: (args) => ({ key: "Connection settings for {name}", params: { name: args.name } }),
  },
  commander: {
    admin: true,
    audit: true,
    success: "Channel commander updated",
    parse: (input) => ({ mode: choice(input.mode, ["on", "off"], "Channel commander") }),
    build: (args) => ["bot", "commander", args.mode],
    async run(bot, args, call) {
      await call(scope(bot, ["bot", "commander", args.mode]), 15000);
      return { messageKey: args.mode === "on" ? "Channel commander is on" : "Channel commander is off" };
    },
    detail: (args) => ({ key: args.mode === "on" ? "Channel commander is on" : "Channel commander is off" }),
  },
  "bot-setup": {
    admin: true,
    audit: true,
    success: "Privilege key applied",
    parse: (input) => ({ key: parsePrivilegeKey(input.key) }),
    build: (args) => ["bot", "setup", args.key],
    detail: () => ({ key: "Applied a privilege key" }),
  },
};

export function hostingCalls(args) {
  const calls = [];
  if (args.nickname) calls.push(["settings", "bot", "set", args.name, "connect.name", args.nickname]);
  if (args.channel) calls.push(["settings", "bot", "set", args.name, "connect.channel", args.channel]);
  if (args.serverPassword) calls.push(["settings", "bot", "set", args.name, "connect.server_password.pw", args.serverPassword]);
  if (args.channelPassword) calls.push(["settings", "bot", "set", args.name, "connect.channel_password.pw", args.channelPassword]);
  if (args.bitrate != null) calls.push(["settings", "bot", "set", args.name, "audio.bitrate", String(args.bitrate)]);
  if (args.run != null) calls.push(["settings", "bot", "set", args.name, "run", args.run ? "true" : "false"]);
  if (args.startupCommand) calls.push(["settings", "bot", "set", args.name, "events.onconnect", args.startupCommand]);
  if (args.clearStartup) calls.push(["settings", "bot", "set", args.name, "events.onconnect"]);
  return calls;
}

export function liveRenameParts(name, nickname) {
  return ["bot", "template", name, ["bot", "name", nickname]];
}

export function templateIsConnected(data, name) {
  return presentBotList(data).some((item) => item.name === name && item.status === "connected");
}

const BULK_OPS = ["pause", "resume", "stop", "next", "previous", "clear", "volume", "play", "add"];
const SLOW_BULK = new Set(["play", "add", "next", "previous"]);

function bulkId(raw) {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string" || !/^[1-9]\d{0,9}$/.test(raw.trim())) return null;
  const id = Number(raw.trim());
  return Number.isSafeInteger(id) ? id : null;
}

export function parseBulk(input) {
  const op = String(input?.op ?? "").trim().toLowerCase();
  if (!BULK_OPS.includes(op)) throw new ValidationError("Unknown action");
  const rawIds = input?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) throw new ValidationError("Select at least one bot");
  const limit = SLOW_BULK.has(op) ? 10 : 25;
  if (rawIds.length > limit) throw new ValidationError("Select at most {count} bots", { count: limit });
  const ids = [];
  const seen = new Set();
  for (const raw of rawIds) {
    const id = bulkId(raw);
    if (!id) throw new ValidationError("A selected bot is invalid");
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (actions[op].parse) actions[op].parse(input || {});
  return { op, ids };
}

export function buildActionRequest(bot, name, input, auth) {
  const action = actions[name];
  if (!action) throw new ValidationError("Unknown action");
  if (action.admin && auth.role !== "admin") throw new HttpError("Administrators only", 403);
  if (action.control && !auth.canControl) throw new HttpError("No control rights for this bot", 403);
  const args = action.parse ? action.parse(input || {}) : {};
  const parts = action.build ? (action.scoped === false ? action.build(args) : scope(bot, action.build(args))) : null;
  return { action, args, parts };
}

export async function runAction(bot, name, input, auth) {
  const built = buildActionRequest(bot, name, input, auth);
  if (built.action.run) {
    const data = await built.action.run(bot, built.args, (parts, timeoutMs) => callBot(bot, parts, { timeoutMs }));
    return { ...built, data };
  }
  const data = await callBot(bot, built.parts, { timeoutMs: built.action.timeoutMs || 15000 });
  return { ...built, data };
}
