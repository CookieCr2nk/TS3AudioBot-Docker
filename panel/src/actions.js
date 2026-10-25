import { HttpError, ValidationError } from "./errors.js";
import { callBot, scope } from "./ts3ab.js";
import {
  parseChannel,
  parseIndex,
  parseListId,
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
  if (!allowed.includes(text)) throw new ValidationError(`${label} ist ungültig`);
  return text;
}

function listTarget(input) {
  const id = parseListId(input.listId);
  if (input.index === undefined || input.index === "") return { id, index: null };
  return { id, index: parseIndex(input.index, "Position", 100000) };
}

export const actions = {
  pause: { control: true, audit: true, success: "Wiedergabe pausiert", build: () => ["pause"] },
  resume: { control: true, audit: true, success: "Wiedergabe fortgesetzt", build: () => ["play"] },
  stop: { control: true, audit: true, success: "Wiedergabe gestoppt", build: () => ["stop"] },
  next: { control: true, audit: true, success: "Nächster Titel", timeoutMs: SLOW, build: () => ["next"] },
  previous: { control: true, audit: true, success: "Vorheriger Titel", timeoutMs: SLOW, build: () => ["previous"] },
  clear: { control: true, audit: true, success: "Warteschlange geleert", build: () => ["clear"] },
  volume: {
    control: true,
    audit: true,
    success: "Lautstärke gesetzt",
    parse: (input) => ({ volume: parseVolume(input.volume) }),
    build: (args) => ["volume", String(args.volume)],
    detail: (args) => `Lautstärke ${args.volume}`,
  },
  seek: {
    control: true,
    audit: true,
    success: "Position gesetzt",
    parse: (input) => ({ seconds: parseIndex(input.seconds, "Position", 86400) }),
    build: (args) => ["seek", String(args.seconds)],
    detail: (args) => `Position ${args.seconds}s`,
  },
  nudge: {
    control: true,
    audit: true,
    success: "Position gesetzt",
    parse: (input) => {
      const delta = Number(input.delta);
      if (![-30, -10, 10, 30].includes(delta)) throw new ValidationError("Der Sprung ist ungültig");
      return { delta };
    },
    async run(bot, args, call) {
      const song = await call(scope(bot, ["song"]), 15000);
      const position = song && typeof song === "object" ? Number(song.Position) || 0 : 0;
      const seconds = Math.max(0, Math.min(86400, Math.floor(position + args.delta)));
      await call(scope(bot, ["seek", String(seconds)]), 15000);
      return { seconds };
    },
    detail: (args) => `Sprung ${args.delta}s`,
  },
  repeat: {
    control: true,
    audit: true,
    success: "Wiederholung gesetzt",
    parse: (input) => ({ mode: choice(input.mode, ["off", "one", "all"], "Wiederholung") }),
    build: (args) => ["repeat", args.mode],
    detail: (args) => `Wiederholung ${args.mode}`,
  },
  random: {
    control: true,
    audit: true,
    success: "Zufall gesetzt",
    parse: (input) => ({ mode: choice(input.mode, ["on", "off"], "Zufall") }),
    build: (args) => ["random", args.mode],
    detail: (args) => `Zufall ${args.mode}`,
  },
  play: {
    control: true,
    audit: true,
    success: "Wiedergabe gestartet",
    timeoutMs: SLOW,
    parse: (input) => ({ resource: parseResource(input.resource) }),
    build: (args) => ["play", args.resource],
    detail: (args) => args.resource.slice(0, 180),
  },
  add: {
    control: true,
    audit: true,
    success: "Zur Warteschlange hinzugefügt",
    timeoutMs: SLOW,
    parse: (input) => ({ resource: parseResource(input.resource) }),
    build: (args) => ["add", args.resource],
    detail: (args) => args.resource.slice(0, 180),
  },
  jump: {
    control: true,
    audit: true,
    success: "In der Warteschlange gesprungen",
    timeoutMs: SLOW,
    parse: (input) => ({ index: parseIndex(input.index, "Position", 100000) }),
    build: (args) => ["jump", String(args.index)],
    detail: (args) => `Index ${args.index}`,
  },
  move: {
    admin: true,
    audit: true,
    success: "Bot verschoben",
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
    success: "Aus dem Verlauf gestartet",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseIndex(input.historyId, "Verlaufs-ID", 1_000_000_000) }),
    build: (args) => ["history", "play", String(args.id)],
    detail: (args) => `Verlauf ${args.id}`,
  },
  search: {
    control: true,
    timeoutMs: SLOW,
    parse: (input) => ({
      factory: choice(input.factory || "youtube", ["youtube", "soundcloud", "twitch", "media"], "Quelle"),
      query: parseSearchQuery(input.query),
    }),
    build: (args) => ["search", "from", args.factory, args.query],
  },
  "search-play": {
    control: true,
    audit: true,
    success: "Treffer wird abgespielt",
    timeoutMs: SLOW,
    parse: (input) => ({ index: parseIndex(input.index, "Treffer", 1000) }),
    build: (args) => ["search", "play", String(args.index)],
    detail: (args) => `Treffer ${args.index}`,
  },
  "search-add": {
    control: true,
    audit: true,
    success: "Treffer zur Warteschlange hinzugefügt",
    timeoutMs: SLOW,
    parse: (input) => ({ index: parseIndex(input.index, "Treffer", 1000) }),
    build: (args) => ["search", "add", String(args.index)],
    detail: (args) => `Treffer ${args.index}`,
  },
  "list-list": {
    build: () => ["list", "list"],
  },
  "list-show": {
    parse: (input) => ({
      id: parseListId(input.listId),
      offset: parseIndex(input.offset ?? 0, "Offset", 1_000_000),
      count: parseIndex(input.count ?? 50, "Anzahl", 100),
    }),
    build: (args) => ["list", "show", args.id, String(args.offset), String(args.count)],
  },
  "list-create": {
    control: true,
    audit: true,
    success: "Playlist angelegt",
    parse: (input) => ({ id: parseListId(input.listId), title: parseTitle(input.title) }),
    build: (args) => ["list", "create", args.id, args.title],
    detail: (args) => args.id,
  },
  "list-rename": {
    control: true,
    audit: true,
    success: "Playlist umbenannt",
    parse: (input) => ({ id: parseListId(input.listId), title: parseTitle(input.title) }),
    build: (args) => ["list", "name", args.id, args.title],
    detail: (args) => `${args.id} → ${args.title}`,
  },
  "list-delete": {
    control: true,
    audit: true,
    success: "Playlist gelöscht",
    parse: (input) => {
      if (input.confirm !== "on") throw new ValidationError("Löschen muss bestätigt werden");
      return { id: parseListId(input.listId) };
    },
    build: (args) => ["list", "delete", args.id],
    detail: (args) => args.id,
  },
  "list-add": {
    control: true,
    audit: true,
    success: "Titel zur Playlist hinzugefügt",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseListId(input.listId), resource: parseResource(input.resource) }),
    build: (args) => ["list", "add", args.id, args.resource],
    detail: (args) => `${args.id}: ${args.resource.slice(0, 140)}`,
  },
  "list-import": {
    control: true,
    audit: true,
    success: "Playlist importiert",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseListId(input.listId), resource: parseResource(input.resource) }),
    build: (args) => ["list", "import", args.id, args.resource],
    detail: (args) => `${args.id}: ${args.resource.slice(0, 140)}`,
  },
  "list-play": {
    control: true,
    audit: true,
    success: "Playlist gestartet",
    timeoutMs: SLOW,
    parse: listTarget,
    build: (args) => (args.index === null ? ["list", "play", args.id] : ["list", "play", args.id, String(args.index)]),
    detail: (args) => (args.index === null ? args.id : `${args.id} ab ${args.index}`),
  },
  "list-queue": {
    control: true,
    audit: true,
    success: "Playlist an die Warteschlange gehängt",
    timeoutMs: SLOW,
    parse: (input) => ({ id: parseListId(input.listId) }),
    build: (args) => ["list", "queue", args.id],
    detail: (args) => args.id,
  },
  "list-item-delete": {
    control: true,
    audit: true,
    success: "Titel aus der Playlist entfernt",
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
    success: "Instanz wird gestartet",
    timeoutMs: 30000,
    parse: (input) => ({ name: parseTemplateName(input.name) }),
    build: (args) => ["bot", "connect", "template", args.name],
    detail: (args) => args.name,
  },
  disconnect: {
    admin: true,
    audit: true,
    scoped: false,
    success: "Instanz wird getrennt",
    timeoutMs: 20000,
    parse: (input) => ({ instanceId: String(parseIndex(input.instanceId, "Instanz-ID", 1_000_000)) }),
    build: (args) => ["bot", "use", args.instanceId, ["bot", "disconnect"]],
    detail: (args) => `ID ${args.instanceId}`,
  },
  "template-create": {
    admin: true,
    audit: true,
    scoped: false,
    success: "Instanzvorlage angelegt",
    parse: (input) => ({ name: parseTemplateName(input.name) }),
    build: (args) => ["settings", "create", args.name],
    detail: (args) => args.name,
  },
  "template-delete": {
    admin: true,
    audit: true,
    scoped: false,
    success: "Instanzvorlage gelöscht",
    parse: (input) => {
      const name = parseTemplateName(input.name);
      if (String(input.confirm ?? "").trim() !== name) {
        throw new ValidationError("Zur Bestätigung den Instanznamen exakt eingeben");
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
    success: "Serveradresse gespeichert",
    parse: (input) => ({ name: parseTemplateName(input.name), address: parseTsAddress(input.address) }),
    build: (args) => ["settings", "bot", "set", args.name, "connect.address", args.address],
    detail: (args) => `${args.name} → ${args.address}`,
  },
};

export function buildActionRequest(bot, name, input, auth) {
  const action = actions[name];
  if (!action) throw new ValidationError("Unbekannte Aktion");
  if (action.admin && auth.role !== "admin") throw new HttpError("Nur für Administratoren", 403);
  if (action.control && !auth.canControl) throw new HttpError("Keine Steuerrechte für diesen Bot", 403);
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
