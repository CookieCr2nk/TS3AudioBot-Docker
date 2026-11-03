// Column choices stay in localStorage. Nothing here is sent to the server.

export const COLUMN_STORAGE_KEY = "ts3panel-columns";

function editableIds(columns) {
  return columns.filter((col) => col.locked !== "start" && col.locked !== "end").map((col) => col.id);
}

export function defaultLayout(columns) {
  return { order: editableIds(columns), hidden: [] };
}

export function sanitizeLayout(columns, stored) {
  const editable = editableIds(columns);
  const known = new Set(editable);
  const order = [];
  const seen = new Set();
  const rawOrder = stored && Array.isArray(stored.order) ? stored.order : [];
  for (const id of rawOrder) {
    if (typeof id === "string" && known.has(id) && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of editable) {
    if (!seen.has(id)) order.push(id);
  }
  const hidden = [];
  const rawHidden = stored && Array.isArray(stored.hidden) ? stored.hidden : [];
  for (const id of rawHidden) {
    if (typeof id === "string" && known.has(id) && !hidden.includes(id)) hidden.push(id);
  }
  const visible = order.filter((id) => !hidden.includes(id));
  if (editable.length && visible.length === 0) {
    return { order, hidden: hidden.filter((id) => id !== order[0]) };
  }
  return { order, hidden };
}

export function isDefaultLayout(columns, layout) {
  const clean = sanitizeLayout(columns, layout);
  const base = defaultLayout(columns);
  return clean.hidden.length === 0 && clean.order.join("\0") === base.order.join("\0");
}

export function visibleColumns(columns, layout) {
  const clean = sanitizeLayout(columns, layout);
  const byId = new Map(columns.map((col) => [col.id, col]));
  const hidden = new Set(clean.hidden);
  const start = columns.filter((col) => col.locked === "start");
  const end = columns.filter((col) => col.locked === "end");
  const middle = clean.order.filter((id) => !hidden.has(id)).map((id) => byId.get(id)).filter(Boolean);
  return [...start, ...middle, ...end];
}

export function toggleColumn(columns, layout, id) {
  const clean = sanitizeLayout(columns, layout);
  if (!clean.order.includes(id)) return clean;
  const hidden = new Set(clean.hidden);
  if (hidden.has(id)) hidden.delete(id);
  else {
    const shown = clean.order.filter((item) => !hidden.has(item));
    if (shown.length <= 1) return clean;
    hidden.add(id);
  }
  return { order: clean.order, hidden: clean.order.filter((item) => hidden.has(item)) };
}

export function moveColumn(columns, layout, id, direction) {
  const clean = sanitizeLayout(columns, layout);
  const order = [...clean.order];
  const index = order.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= order.length) return clean;
  const [item] = order.splice(index, 1);
  order.splice(next, 0, item);
  return { order, hidden: clean.hidden };
}

function readAll(storage) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(COLUMN_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function readTableLayout(storage, tableId, columns) {
  const stored = readAll(storage)[tableId];
  return sanitizeLayout(columns, stored && typeof stored === "object" ? stored : null);
}

export function writeTableLayout(storage, tableId, columns, layout) {
  const clean = sanitizeLayout(columns, layout);
  if (!storage) return clean;
  const all = readAll(storage);
  if (isDefaultLayout(columns, clean)) delete all[tableId];
  else all[tableId] = { order: clean.order, hidden: clean.hidden };
  try {
    if (Object.keys(all).length === 0) storage.removeItem(COLUMN_STORAGE_KEY);
    else storage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // The choice still applies for this page view when storage is blocked.
  }
  return clean;
}
