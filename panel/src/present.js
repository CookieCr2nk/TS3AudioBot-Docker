import { applyParams } from "./i18n.js";

const REPEAT = new Map([
  ["0", "off"],
  ["1", "one"],
  ["2", "all"],
  ["off", "off"],
  ["one", "one"],
  ["all", "all"],
]);

const BOT_STATUS = {
  0: "offline",
  1: "connecting",
  2: "connected",
  Offline: "offline",
  Connecting: "connecting",
  Connected: "connected",
};

const STATUS_LABEL = {
  offline: "Offline",
  connecting: "Connecting",
  connected: "Connected",
};

export function isApiError(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (typeof value.ErrorName === "string" || typeof value.ErrorMessage === "string") &&
      ("ErrorCode" in value || "ErrorName" in value),
  );
}

export function asList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return null;
  for (const key of ["Value", "Items", "Songs", "Results", "Playlists"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  return null;
}

function unwrap(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && "Value" in value) {
    return value.Value;
  }
  return value;
}

export function formatSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const total = Math.floor(number);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const sec = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${sec}`;
  return `${minutes}:${sec}`;
}

// Query parameters that usually carry a secret. Their values are hidden in every address the panel shows.
const SECRET_PARAM = /^(auth|authorization|token|access_token|api_?key|key|pass|passwd|password|pwd|secret|sig|signature|session|sid)$/i;

export function displayStreamUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    const secret = [...url.searchParams.keys()].filter((key) => SECRET_PARAM.test(key));
    for (const key of new Set(secret)) {
      const count = url.searchParams.getAll(key).length;
      url.searchParams.delete(key);
      for (let index = 0; index < count; index += 1) url.searchParams.append(key, "***");
    }
    return url.href;
  } catch {
    return "";
  }
}

// The bot reports the address it plays as source, and as title when the stream has none.
// That address can hold the credentials of a saved station, so an http address is shown without them.
export function hideStreamSecrets(value) {
  const text = String(value ?? "");
  if (!/^https?:\/\//i.test(text.trim())) return text;
  return displayStreamUrl(text.trim()) || text;
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

function slot(value, t) {
  if (isApiError(value)) return { error: value.ErrorMessage || value.ErrorName || t("Error"), value: null };
  return { error: null, value: unwrap(value) };
}

function presentRepeat(value) {
  if (value === null || value === undefined) return null;
  return REPEAT.get(String(value).toLowerCase()) || null;
}

function presentBool(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "on" || value === "true") return true;
  if (value === 0 || value === "0" || value === "off" || value === "false") return false;
  return null;
}

function presentSong(value, t) {
  if (!value || typeof value !== "object" || isApiError(value)) return null;
  const length = Number(value.Length);
  const position = Number(value.Position);
  const hasLength = Number.isFinite(length) && length > 0;
  const source = hideStreamSecrets(value.Source || value.Link || "");
  return {
    title: value.Title ? hideStreamSecrets(value.Title) : t("Unknown title"),
    source,
    // A hidden query value would make the link useless, so such a source is shown as text only.
    sourceHref: source.includes("=***") ? null : safeHttpUrl(source),
    position: Number.isFinite(position) ? position : null,
    length: hasLength ? length : null,
    positionLabel: formatSeconds(position),
    lengthLabel: hasLength ? formatSeconds(length) : null,
    progress: hasLength && Number.isFinite(position) ? Math.max(0, Math.min(100, (position / length) * 100)) : null,
    paused: typeof value.Paused === "boolean" ? value.Paused : null,
  };
}

function presentQueue(value, t) {
  if (!value || typeof value !== "object" || isApiError(value) || !Array.isArray(value.Items)) return null;
  const offset = Number(value.DisplayOffset) || 0;
  return {
    title: value.Title || t("Queue"),
    index: Number.isFinite(Number(value.PlaybackIndex)) ? Number(value.PlaybackIndex) : null,
    count: Number.isFinite(Number(value.SongCount)) ? Number(value.SongCount) : value.Items.length,
    items: value.Items.slice(0, 40).map((item, index) => ({
      index: offset + index,
      title: hideStreamSecrets(item.Title || item.Link || "") || t("Untitled"),
      link: hideStreamSecrets(item.Link || ""),
      audioType: item.AudioType || "",
    })),
  };
}

export function presentStatus(data, t = applyParams) {
  const empty = {
    song: null,
    volume: null,
    repeat: null,
    shuffle: null,
    queue: null,
    problems: [],
  };
  if (!Array.isArray(data)) {
    empty.problems.push(t("The bot API did not return a status."));
    return empty;
  }
  const slots = data.map((value) => slot(value, t));
  const labels = ["Title", "Volume", "Repeat", "Shuffle", "Queue"];
  const problems = [];
  slots.forEach((item, index) => {
    if (item.error && labels[index]) problems.push(t("{label}: {error}", { label: labels[index], error: item.error }));
  });
  const volume = Number(slots[1]?.value);
  return {
    song: presentSong(slots[0]?.value, t),
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : null,
    repeat: presentRepeat(slots[2]?.value),
    shuffle: presentBool(slots[3]?.value),
    queue: presentQueue(slots[4]?.value, t),
    problems,
  };
}

// TS3AudioBot answers `version` with BuildData. Its fields are not serialized, so the API often returns {}.
// `print (version)` returns the text form "Version: x / CommitHash: y", wrapped as {"Value": "..."}, which this also reads.
function versionText(version, commit) {
  const known = (value) => typeof value === "string" && value.trim() && value.trim() !== "<?>";
  if (!known(version)) return null;
  const sha = known(commit) ? commit.trim() : "";
  const short = /^[0-9a-f]{12,}$/i.test(sha) ? sha.slice(0, 7) : sha;
  return short ? `${version.trim()} (${short})` : version.trim();
}

export function presentVersion(data) {
  if (typeof data === "string") {
    const text = data.trim();
    if (!text) return null;
    const version = text.match(/^\s*Version:\s*(.+?)\s*$/im);
    if (version) return versionText(version[1], text.match(/^\s*CommitHash:\s*(.+?)\s*$/im)?.[1]);
    return text.split(/\r?\n/)[0].trim() || null;
  }
  if (!data || typeof data !== "object" || isApiError(data)) return null;
  // A text result arrives as {"Value": "..."}.
  if (typeof data.Value === "string") return presentVersion(data.Value);
  return versionText(data.Version || data.version, data.CommitSha || data.commitSha);
}

export function presentSearch(data, t = applyParams) {
  if (typeof data === "string") {
    return data
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const match = line.match(/^(\d+)\s*[:.)-]\s*(.*)$/);
        if (!match) return { index, title: line, link: "" };
        return { index: Number(match[1]), title: match[2] || line, link: "" };
      });
  }
  const list = asList(data) || [];
  return list.map((item, index) => {
    if (typeof item === "string") return { index, title: item, link: "" };
    return {
      index: item.Index ?? item.index ?? index,
      title: item.Title || item.ResourceTitle || item.Link || t("Result {index}", { index }),
      link: item.Link || item.Source || "",
    };
  });
}

export function presentSetting(data) {
  let value = data;
  for (let i = 0; i < 3; i += 1) {
    if (typeof value === "string") return value;
    if (value == null) return "";
    if (typeof value === "object" && !Array.isArray(value) && "Value" in value) {
      value = value.Value;
      continue;
    }
    return "";
  }
  return typeof value === "string" ? value : "";
}

export function presentTsIdentity(data) {
  const value = unwrap(data);
  if (!value || typeof value !== "object") return { uid: "", clientId: "" };
  return {
    uid: settingText(value.Uid ?? value.uid),
    clientId: settingText(value.Id ?? value.ClientId),
  };
}

function settingText(value) {
  const inner = unwrap(value);
  if (inner == null || typeof inner === "object") return "";
  return String(inner);
}

export function presentCommander(data) {
  const value = unwrap(data);
  if (value === true || value === "true" || value === "True" || value === "on") return true;
  if (value === false || value === "false" || value === "False" || value === "off") return false;
  return null;
}

const WHISPER_MODE = {
  0: "none",
  1: "voice",
  2: "whisper",
  3: "group",
  none: "none",
  voice: "voice",
  whisper: "whisper",
  whispergroup: "group",
};

export function presentWhisper(data) {
  const value = unwrap(data);
  const raw = value && typeof value === "object" ? value.SendMode ?? value.sendMode : value;
  return whisperToken(raw);
}

export function presentWhisperTargets(data) {
  const value = unwrap(data);
  if (!value || typeof value !== "object" || Array.isArray(value)) return { clients: [], channels: [] };
  return {
    clients: idList(value.WhisperClients ?? value.whisperClients, 65535),
    channels: idList(value.WhisperChannel ?? value.WhisperChannels ?? value.whisperChannel, 4294967295),
  };
}

export function presentServerTree(data) {
  const value = unwrap(data);
  if (!value || typeof value !== "object" || Array.isArray(value)) return { channels: [], clients: [] };
  const channels = [];
  const seenChannel = new Set();
  for (const row of pairs(value.Channels ?? value.channels)) {
    const id = rowId(row.key, row.value);
    if (!id || seenChannel.has(id) || channels.length >= 500) continue;
    const record = row.value && typeof row.value === "object" ? row.value : {};
    seenChannel.add(id);
    channels.push({
      id,
      name: cleanLabel(record.Name ?? record.name ?? record.ChannelName) || `#${id}`,
      parent: positiveId(record.Parent ?? record.ParentId ?? record.parent ?? record.Pid),
    });
  }
  const byId = new Map(channels.map((item) => [item.id, item]));
  const paths = new Map();
  const pathOf = (id, trail) => {
    if (paths.has(id) && trail.size === 0) return paths.get(id);
    const item = byId.get(id);
    if (!item || trail.has(id)) return item?.name || "";
    const next = new Set(trail);
    next.add(id);
    let path = item.name;
    if (item.parent && item.parent !== id && byId.has(item.parent) && !next.has(item.parent)) {
      const parent = pathOf(item.parent, next);
      if (parent) path = `${parent} / ${item.name}`;
    }
    if (trail.size === 0) paths.set(id, path);
    return path;
  };
  const listed = channels
    .map((item) => ({ id: item.id, name: item.name, path: pathOf(item.id, new Set()) }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }) || a.id - b.id);
  const clients = [];
  const seenClient = new Set();
  for (const row of pairs(value.Clients ?? value.clients)) {
    const record = row.value && typeof row.value === "object" ? row.value : {};
    if (isServerQuery(record)) continue;
    const id = rowId(row.key, row.value);
    if (!id || id > 65535 || seenClient.has(id) || clients.length >= 500) continue;
    seenClient.add(id);
    const channelId = positiveId(record.Channel ?? record.ChannelId ?? record.channel);
    clients.push({
      id,
      name: cleanLabel(record.Name ?? record.name ?? record.NickName ?? record.Nickname) || `#${id}`,
      channelId,
    });
  }
  clients.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id - b.id);
  return { channels: listed, clients };
}

function pairs(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => (
      item && typeof item === "object" && "Key" in item && "Value" in item
        ? { key: item.Key, value: item.Value }
        : { key: null, value: item }
    ));
  }
  if (raw && typeof raw === "object") return Object.entries(raw).map(([key, value]) => ({ key, value }));
  return [];
}

function positiveId(value, depth = 0) {
  if (depth > 4 || value == null) return null;
  const inner = unwrap(value);
  if (typeof inner === "number" && Number.isInteger(inner) && inner > 0 && inner <= 4294967295) return inner;
  if (typeof inner === "string") {
    const text = inner.trim();
    if (!/^[1-9]\d*$/.test(text)) return null;
    const id = Number(text);
    if (!Number.isSafeInteger(id) || id > 4294967295) return null;
    return id;
  }
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    if ("Value" in inner) return positiveId(inner.Value, depth + 1);
    if ("Id" in inner) return positiveId(inner.Id, depth + 1);
    if ("id" in inner) return positiveId(inner.id, depth + 1);
  }
  return null;
}

function rowId(key, value) {
  if (value && typeof value === "object") {
    const fromValue = positiveId(value.Id ?? value.id ?? value.ChannelId ?? value.ClientId);
    if (fromValue) return fromValue;
  }
  return positiveId(value) || positiveId(key);
}

function idList(raw, max) {
  const items = [];
  if (Array.isArray(raw)) items.push(...raw);
  else if (typeof raw === "number" || typeof raw === "string") items.push(...String(raw).split(/[\s,;]+/));
  else if (raw && typeof raw === "object") items.push(...Object.values(raw));
  const ids = [];
  const seen = new Set();
  for (const item of items) {
    const id = positiveId(item);
    if (!id || id > max || seen.has(id) || ids.length >= 100) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function cleanLabel(value) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80);
}

function isServerQuery(value) {
  const raw = unwrap(value?.ClientType ?? value?.clientType);
  if (raw === 1 || raw === "1") return true;
  const text = String(raw ?? "").trim().toLowerCase();
  return text === "query" || text === "serverquery";
}

function whisperToken(value) {
  const inner = unwrap(value);
  if (inner && typeof inner === "object") return null;
  if (typeof inner === "number" && Number.isInteger(inner)) return WHISPER_MODE[inner] || null;
  const text = String(inner ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) return WHISPER_MODE[Number(text)] || null;
  return WHISPER_MODE[text] || null;
}

export function presentSendMode(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const mode = text.toLowerCase();
  if (mode === "whisper" || mode === "voice") return mode;
  if (text.startsWith("!")) return "custom";
  return null;
}

export function presentClientChannel(data) {
  const value = unwrap(data);
  if (!value || typeof value !== "object") return "";
  const text = settingText(value.ChannelId ?? value.channelId).trim();
  if (!/^[1-9]\d*$/.test(text)) return "";
  return text;
}

export function countRunningBots(listed, names) {
  const live = [];
  for (const item of listed || []) {
    if (item?.status !== "connected" && item?.status !== "connecting") continue;
    if (item.name) live.push(item.name);
  }
  if (!names) return live.length;
  const known = names instanceof Set ? names : new Set(names);
  let running = 0;
  for (const name of known) {
    if (live.includes(name)) running += 1;
  }
  return running;
}

export function presentBotList(data, t = applyParams) {
  const list = asList(data) || [];
  return list.map((item) => {
    const status = BOT_STATUS[item.Status] || "unknown";
    return {
      id: item.Id === undefined ? null : item.Id,
      name: item.Name || "",
      server: item.Server || "",
      status,
      statusLabel: t(STATUS_LABEL[status] || "Unknown"),
    };
  });
}
