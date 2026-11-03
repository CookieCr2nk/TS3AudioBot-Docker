import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "./auth.jsx";
import {
  defaultLayout,
  isDefaultLayout,
  moveColumn,
  readTableLayout,
  toggleColumn,
  visibleColumns,
  writeTableLayout,
} from "./columns.js";

function browserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function useColumns(tableId, columns) {
  const { t } = useAuth();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(() => readTableLayout(browserStorage(), tableId, columns));
  const root = useRef(null);
  const menuId = useId();
  const signature = columns.map((col) => `${col.id}:${col.locked || ""}`).join("|");
  const signatureRef = useRef(signature);
  if (signatureRef.current !== signature) {
    signatureRef.current = signature;
    setLayout(readTableLayout(browserStorage(), tableId, columns));
  }

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(next) {
    setLayout(writeTableLayout(browserStorage(), tableId, columns, next));
  }

  const byId = new Map(columns.map((col) => [col.id, col]));
  const rows = layout.order.map((id) => byId.get(id)).filter(Boolean);
  const shownIds = layout.order.filter((id) => !layout.hidden.includes(id));

  const picker = (
    <div className="column-pick" ref={root}>
      <button
        className="btn"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {t("Columns")}
      </button>
      {open ? (
        <div className="column-menu" id={menuId} role="dialog" aria-label={t("Columns")}>
          <p className="muted">{t("Saved in this browser.")}</p>
          {rows.map((col, index) => {
            const name = t(col.label);
            const shown = !layout.hidden.includes(col.id);
            const last = shown && shownIds.length === 1;
            return (
              <div className="column-row" key={col.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={shown}
                    disabled={last}
                    title={last ? t("At least one column stays visible.") : ""}
                    onChange={() => commit(toggleColumn(columns, layout, col.id))}
                  />
                  <span>{name}</span>
                </label>
                <button
                  className="btn"
                  type="button"
                  disabled={index === 0}
                  aria-label={t("Move {name} up", { name })}
                  onClick={() => commit(moveColumn(columns, layout, col.id, -1))}
                >
                  {t("Up")}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={index === rows.length - 1}
                  aria-label={t("Move {name} down", { name })}
                  onClick={() => commit(moveColumn(columns, layout, col.id, 1))}
                >
                  {t("Down")}
                </button>
              </div>
            );
          })}
          <button
            className="btn"
            type="button"
            disabled={isDefaultLayout(columns, layout)}
            onClick={() => commit(defaultLayout(columns))}
          >
            {t("Reset columns")}
          </button>
        </div>
      ) : null}
    </div>
  );

  return { shown: visibleColumns(columns, layout), picker };
}

export function ColumnFrame({ picker, wrapClass, children }) {
  return (
    <>
      <div className="table-tools">{picker}</div>
      <div className={wrapClass ? `table-wrap ${wrapClass}` : "table-wrap"}>{children}</div>
    </>
  );
}

export function ColumnTable({ columns, rows, rowKey, rowClass, tableClass, extra }) {
  const { t } = useAuth();
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.id} className={col.headerClass}>
              {col.header ? col.header() : col.label ? t(col.label) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <Fragment key={rowKey(row, index)}>
            <tr className={rowClass ? rowClass(row, index) || undefined : undefined}>
              {columns.map((col) => (
                <td key={col.id} className={col.cellClass} title={col.cellTitle ? col.cellTitle(row) : undefined}>
                  {col.cell(row, index)}
                </td>
              ))}
            </tr>
            {extra ? extra(row, columns.length, index) : null}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
