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

export function formatTime(value, lang = "en") {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

export function displayStreamUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return "";
  }
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
  return {
    title: value.Title || t("Unknown title"),
    source: value.Source || value.Link || "",
    sourceHref: safeHttpUrl(value.Source || value.Link || ""),
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
      title: item.Title || item.Link || t("Untitled"),
      link: item.Link || "",
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

export function presentVersion(data) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object" || isApiError(data)) return null;
  return data.Version || data.version || null;
}

export function presentHistory(data, t = applyParams) {
  if (typeof data === "string") {
    return presentSearch(data, t).map((item) => ({ id: item.index, title: item.title, meta: "" }));
  }
  const list = asList(data) || [];
  return list.map((item, index) => {
    if (typeof item === "string") return { id: null, title: item, meta: "" };
    const meta = [item.AudioType, item.UserUid, item.PlayCount != null ? `${item.PlayCount}×` : null]
      .filter(Boolean)
      .join(" · ");
    return {
      id: item.Id ?? item.id ?? null,
      title: item.Title || item.ResourceTitle || item.Name || t("Entry {n}", { n: index + 1 }),
      meta,
    };
  });
}

export function presentPlaylists(data) {
  const list = asList(data) || [];
  return list
    .map((item) => {
      if (typeof item === "string") return { id: item, title: item, count: null };
      const id = item.Id ?? item.id;
      if (id === undefined || id === null || id === "") return null;
      return {
        id: String(id),
        title: item.Title || String(id),
        count: item.SongCount ?? null,
      };
    })
    .filter(Boolean);
}

export function presentPlaylist(data, t = applyParams) {
  if (!data || typeof data !== "object" || isApiError(data)) return null;
  const offset = Number(data.DisplayOffset) || 0;
  const items = Array.isArray(data.Items) ? data.Items : [];
  return {
    id: data.Id ? String(data.Id) : "",
    title: data.Title || data.Id || "Playlist",
    count: Number.isFinite(Number(data.SongCount)) ? Number(data.SongCount) : items.length,
    offset,
    items: items.map((item, index) => ({
      index: offset + index,
      title: item.Title || item.Link || t("Untitled"),
      link: item.Link || "",
      audioType: item.AudioType || "",
    })),
  };
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

export function presentCommander(data) {
  const value = unwrap(data);
  if (value === true || value === "true" || value === "True" || value === "on") return true;
  if (value === false || value === "false" || value === "False" || value === "off") return false;
  return null;
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

export function needsRightsHint(message) {
  return /unauthor|recht|forbidden|401|missing context|token|anonymous/i.test(message || "");
}
