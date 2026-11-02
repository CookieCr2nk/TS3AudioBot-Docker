import { HttpError, Ts3ApiError, ValidationError } from "./errors.js";
import { displayStreamUrl, presentBotList, presentSetting } from "./present.js";
import { callBot, scope } from "./ts3ab.js";
import {
  parseChannel,
  parseHostingSettings,
  parseIndex,
  parseResource,
  parseSearchQuery,
  parseTemplateName,
  parseTsAddress,
  parseVolume,
} from "./validate.js";

const SLOW = 90000;

function choice(value, allowed, label) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!allowed.includes(text)) throw new ValidationError("{label} is invalid", { label });
  return text;
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
    audit: false,
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
    control: true,
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
  "bot-list": {
    admin: true,
    scoped: false,
    build: () => ["bot", "list"],
  },
  connect: {
    control: true,
    audit: true,
    scoped: false,
    success: "Bot is connecting",
    timeoutMs: 30000,
    parse: (input) => ({ name: parseTemplateName(input.name) }),
    build: (args) => ["bot", "connect", "template", args.name],
    detail: (args) => args.name,
  },
  disconnect: {
    control: true,
    audit: true,
    scoped: false,
    success: "Bot is disconnecting",
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
    control: true,
    audit: true,
    scoped: false,
    success: "Server address saved",
    parse: (input) => ({ name: parseTemplateName(input.name), address: parseTsAddress(input.address) }),
    build: (args) => ["settings", "bot", "set", args.name, "connect.address", args.address],
    detail: (args) => `${args.name} → ${args.address}`,
  },
  "template-hosting": {
    control: true,
    audit: true,
    scoped: false,
    success: "Connection settings saved",
    parse: (input) => parseHostingSettings(input),
    async run(bot, args, call) {
      for (const parts of hostingCalls(args)) {
        await call(parts, 15000);
      }
      if (args.startupCommand || args.clearStartup) {
        let current = "";
        try {
          current = presentSetting(await call(["settings", "bot", "get", args.name, "events.onconnect"], 15000));
        } catch (err) {
          if (!(err instanceof Ts3ApiError)) throw err;
        }
        const next = withPlay(current, args.clearStartup ? null : args.startupCommand);
        const parts = ["settings", "bot", "set", args.name, "events.onconnect"];
        if (next) parts.push(next);
        await call(parts, 15000);
      }
      if (!args.nickname && !args.channel) return undefined;
      let connected = false;
      try {
        connected = templateIsConnected(await call(["bot", "list"], 15000), args.name);
      } catch (err) {
        if (!(err instanceof Ts3ApiError)) throw err;
        connected = true;
      }
      if (!connected) {
        return { messageKey: hostingLiveMessage({ nickname: Boolean(args.nickname), channel: Boolean(args.channel), connected: false }) };
      }
      let nicknameOk = !args.nickname;
      let moveOk = !args.channel;
      if (args.nickname) {
        try {
          await call(liveRenameParts(args.name, args.nickname), 15000);
          nicknameOk = true;
        } catch (err) {
          if (!(err instanceof Ts3ApiError)) throw err;
        }
      }
      if (args.channel) {
        try {
          await call(liveMoveParts(args.name, args.channel), 15000);
          moveOk = true;
        } catch (err) {
          if (!(err instanceof Ts3ApiError)) throw err;
        }
      }
      return {
        messageKey: hostingLiveMessage({
          nickname: Boolean(args.nickname),
          channel: Boolean(args.channel),
          connected: true,
          nicknameOk,
          moveOk,
        }),
      };
    },
    detail: (args) => ({ key: "Connection settings for {name}", params: { name: args.name } }),
  },
  commander: {
    control: true,
    audit: true,
    scoped: false,
    success: "Channel commander updated",
    parse: (input) => ({ mode: choice(input.mode, ["on", "off"], "Channel commander") }),
    async run(bot, args, call) {
      if (bot.instanceMode !== "template" || !bot.instanceRef) throw new ValidationError("This bot has no instance set");
      const name = bot.instanceRef;
      let current = "";
      try {
        current = presentSetting(await call(["settings", "bot", "get", name, "events.onconnect"], 15000));
      } catch (err) {
        if (!(err instanceof Ts3ApiError)) throw err;
      }
      const next = withCommander(current, args.mode === "on");
      const parts = ["settings", "bot", "set", name, "events.onconnect"];
      if (next) parts.push(next);
      await call(parts, 15000);
      let connected = false;
      try {
        connected = templateIsConnected(await call(["bot", "list"], 15000), name);
      } catch (err) {
        if (!(err instanceof Ts3ApiError)) throw err;
        connected = true;
      }
      if (!connected) {
        return {
          messageKey: args.mode === "on"
            ? "Channel commander is saved. It turns on when this bot connects."
            : "Channel commander is off",
        };
      }
      try {
        await call(scope(bot, ["bot", "commander", args.mode]), 15000);
      } catch (err) {
        if (!(err instanceof Ts3ApiError)) throw err;
        return {
          messageKey: args.mode === "on"
            ? "Channel commander is saved. It turns on when this bot connects."
            : "Channel commander is saved as off. The connected bot could not be changed.",
        };
      }
      return { messageKey: args.mode === "on" ? "Channel commander is on" : "Channel commander is off" };
    },
    detail: (args) => ({ key: args.mode === "on" ? "Channel commander is on" : "Channel commander is off" }),
  },
};

export function settingsRecord(args) {
  const patch = {};
  if (args.nickname) patch.nickname = args.nickname;
  if (args.channel) patch.channel = args.channel;
  if (args.bitrate != null) patch.bitrate = args.bitrate;
  if (args.volume != null) patch.volume = args.volume;
  if (args.run != null) patch.run = args.run ? 1 : 0;
  if (args.clearStartup) patch.startup = null;
  else if (args.startup) patch.startup = displayStreamUrl(args.startup);
  if (args.serverPassword) patch.serverPassword = 1;
  if (args.channelPassword) patch.channelPassword = 1;
  if (args.address) patch.address = args.address;
  return patch;
}

export function ownLiveId(data, name) {
  const item = presentBotList(data).find((row) => row.name === name && row.id != null);
  return item ? String(item.id) : "";
}

export function hostingCalls(args) {
  const calls = [];
  if (args.nickname) calls.push(["settings", "bot", "set", args.name, "connect.name", args.nickname]);
  if (args.channel) calls.push(["settings", "bot", "set", args.name, "connect.channel", args.channel]);
  if (args.serverPassword) calls.push(["settings", "bot", "set", args.name, "connect.server_password.pw", args.serverPassword]);
  if (args.channelPassword) calls.push(["settings", "bot", "set", args.name, "connect.channel_password.pw", args.channelPassword]);
  if (args.bitrate != null) calls.push(["settings", "bot", "set", args.name, "audio.bitrate", String(args.bitrate)]);
  if (args.volume != null) calls.push(["settings", "bot", "set", args.name, "audio.volume.default", String(args.volume)]);
  if (args.run != null) calls.push(["settings", "bot", "set", args.name, "run", args.run ? "true" : "false"]);
  return calls;
}

const COMMANDER_ON = "!bot commander on";

export function parseOnconnect(value) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  if (!text.startsWith("!xecute")) return [text];
  const body = text.slice("!xecute".length).trim();
  const commands = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const command = body.slice(start, i).trim();
        if (command) commands.push(command);
        start = -1;
      }
      if (depth < 0) return [text];
    }
  }
  if (depth !== 0 || commands.length === 0) return [text];
  return commands;
}

export function buildOnconnect(commands) {
  const list = [];
  for (const command of commands) {
    const text = String(command ?? "").trim();
    if (text && !list.includes(text)) list.push(text);
  }
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return `!xecute (${list.join(") (")})`;
}

export function withCommander(current, enabled) {
  const rest = parseOnconnect(current).filter((command) => command !== COMMANDER_ON);
  return buildOnconnect(enabled ? [COMMANDER_ON, ...rest] : rest);
}

export function withPlay(current, play) {
  const rest = parseOnconnect(current).filter((command) => !command.startsWith("!play "));
  return buildOnconnect(play ? [...rest, play] : rest);
}

export function commanderSaved(current) {
  return parseOnconnect(current).includes(COMMANDER_ON);
}

export function liveRenameParts(name, nickname) {
  return ["bot", "template", name, ["bot", "name", nickname]];
}

export function liveMoveParts(name, channel) {
  return ["bot", "template", name, ["bot", "move", channel]];
}

export function hostingLiveMessage({ nickname, channel, connected, nicknameOk = false, moveOk = false }) {
  if (!connected) {
    if (nickname && channel) return "Connection settings saved. The nickname and channel apply when this bot connects.";
    if (channel) return "Connection settings saved. The channel applies when this bot connects.";
    return "Connection settings saved. The nickname changes when this bot connects.";
  }
  if (nickname && channel) {
    if (nicknameOk && moveOk) return "Connection settings saved. The nickname is updated and the bot moved.";
    if (nicknameOk) return "Connection settings saved. The nickname is updated. The bot could not be moved.";
    if (moveOk) return "Connection settings saved. The bot moved. The connected name could not be changed.";
    return "Connection settings saved. The connected bot could not be updated.";
  }
  if (channel) {
    return moveOk
      ? "Connection settings saved. The bot moved to that channel."
      : "Connection settings saved. The bot could not be moved.";
  }
  return nicknameOk
    ? "Connection settings saved. The nickname is updated."
    : "Connection settings saved. The connected name could not be changed.";
}

export function templateIsConnected(data, name) {
  return presentBotList(data).some((item) => item.name === name && item.status === "connected");
}

const BULK_OPS = ["start", "stop"];

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
  if (rawIds.length > 25) throw new ValidationError("Select at most {count} bots", { count: 25 });
  const ids = [];
  const seen = new Set();
  for (const raw of rawIds) {
    const id = bulkId(raw);
    if (!id) throw new ValidationError("A selected bot is invalid");
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
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
