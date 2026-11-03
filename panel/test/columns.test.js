import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLUMN_STORAGE_KEY,
  defaultLayout,
  isDefaultLayout,
  moveColumn,
  readTableLayout,
  sanitizeLayout,
  toggleColumn,
  visibleColumns,
  writeTableLayout,
} from "../client/src/columns.js";

const columns = [
  { id: "select", locked: "start" },
  { id: "name", label: "Name" },
  { id: "owner", label: "Owner" },
  { id: "status", label: "Status" },
  { id: "open", locked: "end" },
];

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

describe("column layout", () => {
  it("keeps the declared order and every column when nothing is stored", () => {
    assert.deepEqual(visibleColumns(columns, null).map((col) => col.id), ["select", "name", "owner", "status", "open"]);
    assert.deepEqual(defaultLayout(columns), { order: ["name", "owner", "status"], hidden: [] });
  });

  it("hides and reorders only editable columns and keeps one visible", () => {
    const hidden = toggleColumn(columns, null, "owner");
    assert.deepEqual(hidden.hidden, ["owner"]);
    assert.deepEqual(visibleColumns(columns, hidden).map((col) => col.id), ["select", "name", "status", "open"]);
    const moved = moveColumn(columns, hidden, "status", -1);
    assert.deepEqual(moved.order, ["name", "status", "owner"]);
    assert.deepEqual(visibleColumns(columns, moved).map((col) => col.id), ["select", "name", "status", "open"]);
    const stuck = toggleColumn(columns, { order: ["name", "owner", "status"], hidden: ["owner", "status"] }, "name");
    assert.deepEqual(stuck.hidden, ["owner", "status"]);
    assert.equal(moveColumn(columns, null, "name", -1).order[0], "name");
    assert.equal(toggleColumn(columns, null, "select").order.includes("select"), false);
  });

  it("drops unknown ids and appends a new column", () => {
    const stored = { order: ["status", "gone", "name", "name"], hidden: ["open", "owner"] };
    const clean = sanitizeLayout(columns, stored);
    assert.deepEqual(clean, { order: ["status", "name", "owner"], hidden: ["owner"] });
    const next = sanitizeLayout([...columns, { id: "volume", label: "Volume" }], clean);
    assert.deepEqual(next.order, ["status", "name", "owner", "volume"]);
    assert.deepEqual(sanitizeLayout(columns, { order: "name", hidden: "owner" }), defaultLayout(columns));
  });

  it("stores the choice in the browser bucket and removes it on reset", () => {
    const storage = memoryStorage();
    writeTableLayout(storage, "bots", columns, toggleColumn(columns, null, "status"));
    writeTableLayout(storage, "users", columns, moveColumn(columns, null, "owner", -1));
    const saved = JSON.parse(storage.getItem(COLUMN_STORAGE_KEY));
    assert.deepEqual(saved.bots, { order: ["name", "owner", "status"], hidden: ["status"] });
    assert.deepEqual(readTableLayout(storage, "bots", columns).hidden, ["status"]);
    assert.equal(isDefaultLayout(columns, readTableLayout(storage, "users", columns)), false);
    writeTableLayout(storage, "bots", columns, defaultLayout(columns));
    writeTableLayout(storage, "users", columns, defaultLayout(columns));
    assert.equal(storage.getItem(COLUMN_STORAGE_KEY), null);
    assert.deepEqual(readTableLayout(storage, "bots", columns), defaultLayout(columns));
  });

  it("ignores a broken saved value", () => {
    const storage = memoryStorage();
    storage.setItem(COLUMN_STORAGE_KEY, "{");
    assert.deepEqual(readTableLayout(storage, "bots", columns), defaultLayout(columns));
    storage.setItem(COLUMN_STORAGE_KEY, "[]");
    assert.deepEqual(readTableLayout(storage, "bots", columns), defaultLayout(columns));
  });
});
