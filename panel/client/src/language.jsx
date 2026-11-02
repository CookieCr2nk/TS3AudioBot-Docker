import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "./auth.jsx";

function DeFlag() {
  return (
    <svg viewBox="0 0 5 3" aria-hidden="true">
      <rect width="5" height="3" fill="#000" />
      <rect width="5" height="2" y="1" fill="#dd0000" />
      <rect width="5" height="1" y="2" fill="#ffce00" />
    </svg>
  );
}

function GbFlag() {
  return (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <path fill="#012169" d="M0 0h60v30H0z" />
      <path stroke="#fff" strokeWidth="6" d="M0 0l60 30M60 0L0 30" />
      <path stroke="#C8102E" strokeWidth="4" d="M0 0l60 30M60 0L0 30" />
      <path stroke="#fff" strokeWidth="10" d="M30 0v30M0 15h60" />
      <path stroke="#C8102E" strokeWidth="6" d="M30 0v30M0 15h60" />
    </svg>
  );
}

function AutoMark() {
  return (
    <svg className="lang-auto" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" d="M3 12h18M12 3c2.4 2.7 3.6 5.7 3.6 9s-1.2 6.3-3.6 9c-2.4-2.7-3.6-5.7-3.6-9s1.2-6.3 3.6-9z" />
    </svg>
  );
}

function Flag({ id }) {
  if (id === "de") return <DeFlag />;
  if (id === "en") return <GbFlag />;
  if (id === "auto") return <AutoMark />;
  return <span className="lang-code">{String(id || "").slice(0, 2).toUpperCase()}</span>;
}

export function LanguageSelect() {
  const { t, languages, langChoice, setLanguage } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const menuId = useId();
  const choice = langChoice || "auto";

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

  function pick(next) {
    setOpen(false);
    if (next !== choice) setLanguage(next);
  }

  const options = [{ id: "auto", name: t("Automatic") }, ...(languages || [])];

  return (
    <div className="lang-pick" ref={root}>
      <button
        className="lang-flag"
        type="button"
        aria-label={t("Language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Flag id={choice} />
      </button>
      {open ? (
        <ul className="lang-menu" id={menuId} role="listbox" aria-label={t("Language")}>
          {options.map((item) => (
            <li key={item.id}>
              <button type="button" role="option" aria-selected={choice === item.id} onClick={() => pick(item.id)}>
                <Flag id={item.id} />
                <span>{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
