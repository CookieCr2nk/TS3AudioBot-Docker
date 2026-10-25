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
  connecting: "Verbindet",
  connected: "Verbunden",
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

export function formatTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
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

function slot(value) {
  if (isApiError(value)) return { error: value.ErrorMessage || value.ErrorName || "Fehler", value: null };
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

function presentSong(value) {
  if (!value || typeof value !== "object" || isApiError(value)) return null;
  const length = Number(value.Length);
  const position = Number(value.Position);
  const hasLength = Number.isFinite(length) && length > 0;
  return {
    title: value.Title || "Unbekannter Titel",
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

function presentQueue(value) {
  if (!value || typeof value !== "object" || isApiError(value) || !Array.isArray(value.Items)) return null;
  const offset = Number(value.DisplayOffset) || 0;
  return {
    title: value.Title || "Warteschlange",
    index: Number.isFinite(Number(value.PlaybackIndex)) ? Number(value.PlaybackIndex) : null,
    count: Number.isFinite(Number(value.SongCount)) ? Number(value.SongCount) : value.Items.length,
    items: value.Items.slice(0, 40).map((item, index) => ({
      index: offset + index,
      title: item.Title || item.Link || "Ohne Titel",
      link: item.Link || "",
      audioType: item.AudioType || "",
    })),
  };
}

export function presentStatus(data) {
  const empty = {
    song: null,
    volume: null,
    repeat: null,
    shuffle: null,
    queue: null,
    problems: [],
  };
  if (!Array.isArray(data)) {
    empty.problems.push("Die Bot-API hat keinen Status geliefert.");
    return empty;
  }
  const slots = data.map(slot);
  const labels = ["Titel", "Lautstärke", "Wiederholen", "Zufall", "Warteschlange"];
  const problems = [];
  slots.forEach((item, index) => {
    if (item.error && labels[index]) problems.push(`${labels[index]}: ${item.error}`);
  });
  const volume = Number(slots[1]?.value);
  return {
    song: presentSong(slots[0]?.value),
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : null,
    repeat: presentRepeat(slots[2]?.value),
    shuffle: presentBool(slots[3]?.value),
    queue: presentQueue(slots[4]?.value),
    problems,
  };
}

export function presentVersion(data) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object" || isApiError(data)) return null;
  return data.Version || data.version || null;
}

export function presentHistory(data) {
  if (typeof data === "string") {
    return presentSearch(data).map((item) => ({ id: item.index, title: item.title, meta: "" }));
  }
  const list = asList(data) || [];
  return list.map((item, index) => {
    if (typeof item === "string") return { id: null, title: item, meta: "" };
    const meta = [item.AudioType, item.UserUid, item.PlayCount != null ? `${item.PlayCount}×` : null]
      .filter(Boolean)
      .join(" · ");
    return {
      id: item.Id ?? item.id ?? null,
      title: item.Title || item.ResourceTitle || item.Name || `Eintrag ${index + 1}`,
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

export function presentPlaylist(data) {
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
      title: item.Title || item.Link || "Ohne Titel",
      link: item.Link || "",
      audioType: item.AudioType || "",
    })),
  };
}

export function presentSearch(data) {
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
      title: item.Title || item.ResourceTitle || item.Link || `Treffer ${index}`,
      link: item.Link || item.Source || "",
    };
  });
}

export function presentBotList(data) {
  const list = asList(data) || [];
  return list.map((item) => {
    const status = BOT_STATUS[item.Status] || "unknown";
    return {
      id: item.Id === undefined ? null : item.Id,
      name: item.Name || "",
      server: item.Server || "",
      status,
      statusLabel: STATUS_LABEL[status] || "Unbekannt",
    };
  });
}

export function needsRightsHint(message) {
  return /unauthor|recht|forbidden|401|missing context|token|anonymous/i.test(message || "");
}
