import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { LanguageSelect } from "./language.jsx";
import { Account, AddBot, Audit, BotsPage, Connection, InstancePage, Login, Notice, Overview, Playback, Radio, Register, Users } from "./pages.jsx";
import { PlayerBar, PlayerProvider } from "./player.jsx";

export function App() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route element={user ? <Shell /> : <Navigate to="/login" replace />}>
        <Route index element={<Overview />} />
        <Route path="bots" element={<BotsPage />} />
        <Route path="instances/:id" element={<InstancePage />} />
        <Route path="bots/:id" element={<Playback />} />
        <Route path="bots/:id/streams" element={<Radio />} />
        <Route path="bots/:id/history" element={<Navigate to=".." replace />} />
        <Route path="bots/:id/connection" element={<Connection />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<Audit />} />
        <Route path="account" element={<Account />} />
      </Route>
    </Routes>
  );
}

function Shell() {
  const { user, t, signOut } = useAuth();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routeBotId = /^\/bots\/\d+(?:\/|$)/.test(location.pathname) ? id : "";
  const [bot, setBot] = useState(null);
  const [botError, setBotError] = useState("");
  const [roster, setRoster] = useState([]);
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const playerBotId = routeBotId;
  const inBot = Boolean(routeBotId);

  useEffect(() => {
    setOpen(false);
    document.getElementById("content")?.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const label = inBot ? botSection(location.pathname, t) : pageSection(location.pathname, t);
    document.title = `${label} · TS-Bot Panel`;
  }, [location.pathname, t, inBot]);

  const rosterScope = routeBotId ? "bot" : location.pathname;
  useEffect(() => {
    let stop = false;
    api("/api/bots?status=0")
      .then((data) => {
        if (!stop) setRoster(data.bots || []);
      })
      .catch(() => {
        if (!stop) setRoster([]);
      });
    return () => {
      stop = true;
    };
  }, [rosterScope]);

  useEffect(() => {
    if (!playerBotId) {
      setBot(null);
      setBotError("");
      setStatus(null);
      return undefined;
    }
    let stop = false;
    setNote("");
    setActionError("");
    setBotError("");
    api(`/api/bots/${playerBotId}`)
      .then((data) => {
        if (stop) return;
        setStatus(null);
        setBotError("");
        setBot(data.bot);
      })
      .catch((err) => {
        if (stop) return;
        setBot(null);
        setStatus(null);
        setBotError(err.message || "");
      });
    return () => {
      stop = true;
    };
  }, [playerBotId]);

  useEffect(() => {
    if (!bot?.id || String(bot.id) !== String(playerBotId)) return undefined;
    let stop = false;
    async function pull() {
      try {
        const data = await api(`/api/bots/${bot.id}/status`);
        if (!stop) setStatus(data.status);
      } catch {
        if (!stop) {
          setStatus({
            unreachable: true,
            song: null,
            volume: null,
            repeat: null,
            shuffle: null,
            queue: null,
            problems: [],
          });
        }
      }
    }
    pull();
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [bot?.id, playerBotId, tick]);

  const openBotId = useRef(playerBotId);
  openBotId.current = playerBotId;
  const act = useCallback(async (body) => {
    const here = openBotId.current;
    if (!here) return null;
    setActionError("");
    setNote("");
    try {
      const result = await api(`/api/bots/${here}/action`, { method: "POST", body });
      if (openBotId.current !== here) return result;
      if (result.redirect) navigate(result.redirect);
      else if (result.botId && String(result.botId) !== String(here)) navigate(`/bots/${result.botId}`);
      else if (body.op !== "volume" && body.op !== "seek") setNote(result.message || "");
      setTick((value) => value + 1);
      return result;
    } catch (err) {
      if (openBotId.current !== here) return null;
      setActionError(err.message);
      return null;
    }
  }, [navigate, playerBotId]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const shownBot = bot && String(bot.id) === String(playerBotId) ? bot : null;
  const player = {
    botId: playerBotId,
    bot: shownBot,
    status: shownBot ? status : null,
    botError,
    note,
    error: actionError,
    act,
    refresh,
    canControl: Boolean(shownBot?.canControl),
  };
  const section = inBot ? botSection(location.pathname, t) : pageSection(location.pathname, t);

  return (
    <PlayerProvider value={player}>
      <a className="skip" href="#content">{t("Skip to content")}</a>
      <div className="shell">
        <aside id="sidebar" className={open ? "sidebar open" : "sidebar"}>
          <div className="brand-row">
            <Link className="brand" to="/">
              <img src="/favicon.svg" alt="" />
              TS-Bot Panel
            </Link>
            <LanguageSelect />
          </div>
          <nav className="side-scroll" aria-label={t("Main")}>
            <div className="side-label">{t("Library")}</div>
            <SideLink to="/" end>{t("Overview")}</SideLink>
            <SideLink to="/bots">{t("Bots")}</SideLink>
            {user.role === "admin" ? (
              <>
                <div className="side-label">{t("Admin")}</div>
                <SideLink to="/users">{t("Users")}</SideLink>
                <SideLink to="/audit">{t("Audit")}</SideLink>
              </>
            ) : null}
          </nav>
          <div className="side-foot">
            <SideLink to="/account">{t("Account")}</SideLink>
            <p className="who">{user.username}</p>
            <button className="btn btn-ghost" type="button" onClick={() => signOut().then(() => navigate("/login")).catch((err) => setActionError(err.message))}>
              {t("Sign out")}
            </button>
            <a className="side-link" href="https://github.com/CookieCr2nk/TS3AudioBot-Docker" target="_blank" rel="noopener noreferrer">
              <svg className="github-mark" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.7 7.7 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {t("GitHub")}
            </a>
          </div>
        </aside>
        {open ? <button className="backdrop" type="button" aria-label={t("Close menu")} onClick={() => setOpen(false)} /> : null}
        <div className="workspace">
          <header className="topbar">
            <button
              className="btn menu-toggle"
              type="button"
              aria-expanded={open}
              aria-controls="sidebar"
              onClick={() => setOpen((value) => !value)}
            >
              {t("Menu")}
            </button>
            <div className="crumb">
              {inBot ? (
                <>
                  {shownBot?.instanceId ? <NavLink to={`/instances/${shownBot.instanceId}`}>{shownBot.instanceName || t("Instances")}</NavLink> : <span>{t("Instances")}</span>}
                  <span aria-hidden="true"> / </span>
                  <strong>{shownBot?.name || section}</strong>
                </>
              ) : (
                <strong>{section}</strong>
              )}
            </div>
          </header>
          {inBot ? <BotTabs id={id} bot={shownBot || { id, name: section }} roster={roster} pathname={location.pathname} admin={user.role === "admin"} /> : null}
          <main className="content" id="content" tabIndex={-1}>
            <Outlet />
          </main>
          <div id="bulk-slot" />
          <div id="toast-dock" className="toast-dock" />
          <Notice error={actionError} note={note} />
          {(shownBot ? status?.problems || [] : []).map((problem, index) => <Notice key={`${index}:${problem}`} error={problem} />)}
          <PlayerBar />
        </div>
      </div>
    </PlayerProvider>
  );
}

function BotTabs({ id, bot, roster, pathname, admin }) {
  const { user, t } = useAuth();
  const navigate = useNavigate();
  const options = roster.some((item) => String(item.id) === String(bot.id)) ? roster : [bot, ...roster];
  return (
    <div className="bot-context">
      <nav className="bot-tabs" aria-label={bot.name}>
        <Tab to={`/bots/${id}`} end>{t("Playback")}</Tab>
        <Tab to={`/bots/${id}/streams`}>{t("Radio")}</Tab>
        <Tab to={`/bots/${id}/connection`}>{t("Connection")}</Tab>
      </nav>
      {admin || user.canCreateBots || bot.canManage ? <AddBot instanceId={bot.instanceId || ""} /> : null}
      {options.length > 1 ? (
        <BotSwitch
          current={String(bot.id)}
          options={options}
          onPick={(item) => navigate(`/bots/${item.id}${sectionPath(pathname)}`)}
        />
      ) : null}
    </div>
  );
}

// A menu the panel renders itself, so bots can be grouped by instance and show their server on a second line.
function BotSwitch({ current, options, onPick }) {
  const { t } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const toggleRef = useRef(null);
  const searchable = options.length > 6;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? options.filter((item) => [item.name, item.address, item.instanceName].some((value) => String(value || "").toLowerCase().includes(needle)))
    : options;
  const groups = [];
  for (const item of shown) {
    const key = item.instanceName || "";
    let group = groups.find((entry) => entry.name === key);
    if (!group) {
      group = { name: key, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  const flat = groups.flatMap((group) => group.items);
  const currentItem = options.find((item) => String(item.id) === current) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const start = flat.findIndex((item) => String(item.id) === current);
    setActive(start < 0 ? 0 : start);
    (searchRef.current || panelRef.current)?.focus();
    function onDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery("");
    toggleRef.current?.focus();
  }

  function pick(item) {
    close();
    if (String(item.id) !== current) onPick(item);
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(flat.length - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter" && flat[active]) {
      event.preventDefault();
      pick(flat[active]);
    }
  }

  let index = -1;
  return (
    <div className="bot-switch" ref={rootRef}>
      <button
        ref={toggleRef}
        className="bot-switch-toggle"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Switch bot")}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="bot-switch-text">
          <strong>{currentItem?.name}</strong>
          <span>{currentItem?.address || currentItem?.instanceName || ""}</span>
        </span>
        <span className="bot-switch-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="bot-switch-panel" ref={panelRef} tabIndex={-1} onKeyDown={onKey}>
          {searchable ? (
            <input
              ref={searchRef}
              className="bot-switch-search"
              type="search"
              value={query}
              placeholder={t("Search bots")}
              aria-label={t("Search bots")}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
            />
          ) : null}
          <div className="bot-switch-list" role="listbox" aria-label={t("Switch bot")}>
            {groups.map((group) => (
              <div className="bot-switch-group" role="group" aria-label={group.name || t("Instances")} key={group.name}>
                {groups.length > 1 || group.name ? <div className="bot-switch-heading">{group.name || t("Instances")}</div> : null}
                {group.items.map((item) => {
                  index += 1;
                  const at = index;
                  const selected = String(item.id) === current;
                  return (
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={selected}
                      data-index={at}
                      className={`bot-switch-option${selected ? " current" : ""}${at === active ? " active" : ""}`}
                      onMouseEnter={() => setActive(at)}
                      onClick={() => pick(item)}
                    >
                      <span className="bot-switch-text">
                        <strong>{item.name}</strong>
                        {item.address ? <span>{item.address}</span> : null}
                      </span>
                      {selected ? <span className="bot-switch-check" aria-hidden="true">✓</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {!flat.length ? <p className="bot-switch-none">{t("No bot matches.")}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tab({ to, end, children }) {
  return (
    <NavLink className={({ isActive }) => (isActive ? "tab-link active" : "tab-link")} to={to} end={end}>
      {children}
    </NavLink>
  );
}

function SideLink({ to, end, children }) {
  return (
    <NavLink className={({ isActive }) => (isActive ? "side-link active" : "side-link")} to={to} end={end}>
      {children}
    </NavLink>
  );
}

function sectionPath(pathname) {
  if (pathname.endsWith("/streams")) return "/streams";
  if (pathname.endsWith("/connection")) return "/connection";
  return "";
}

function pageSection(pathname, t) {
  if (pathname.startsWith("/users")) return t("Users");
  if (pathname.startsWith("/audit")) return t("Audit");
  if (pathname.startsWith("/account")) return t("Account");
  if (pathname.startsWith("/instances")) return t("Instances");
  if (pathname === "/bots") return t("Bots");
  return t("Overview");
}

function botSection(pathname, t) {
  if (pathname.endsWith("/streams")) return t("Radio");
  if (pathname.endsWith("/connection")) return t("Connection");
  return t("Playback");
}
