import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { Account, Audit, BotsPage, Connection, History, InstancePage, Login, Overview, Playback, Playlist, Playlists, Radio, Users } from "./pages.jsx";
import { PlayerBar, PlayerProvider } from "./player.jsx";

const PINNED_BOT = "ts3panel.activeBot";

function readPinned() {
  try {
    return sessionStorage.getItem(PINNED_BOT) || "";
  } catch {
    return "";
  }
}

function writePinned(id) {
  try {
    if (id) sessionStorage.setItem(PINNED_BOT, String(id));
    else sessionStorage.removeItem(PINNED_BOT);
  } catch {
    /* The bar still works for this page when storage is blocked. */
  }
}

export function App() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={user ? <Shell /> : <Navigate to="/login" replace />}>
        <Route index element={<Overview />} />
        <Route path="bots" element={<BotsPage />} />
        <Route path="instances/:id" element={<InstancePage />} />
        <Route path="bots/:id" element={<Playback />} />
        <Route path="bots/:id/playlists" element={<Playlists />} />
        <Route path="bots/:id/playlists/:listId" element={<Playlist />} />
        <Route path="bots/:id/streams" element={<Radio />} />
        <Route path="bots/:id/history" element={<History />} />
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
  const [pinnedId, setPinnedId] = useState(readPinned);
  const [bot, setBot] = useState(null);
  const [roster, setRoster] = useState([]);
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const playerBotId = routeBotId || pinnedId || "";
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
    document.title = `${label} · TS3 Panel`;
  }, [location.pathname, t, inBot]);

  useEffect(() => {
    if (!routeBotId) return;
    setPinnedId(routeBotId);
    writePinned(routeBotId);
  }, [routeBotId]);

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
  }, [location.pathname]);

  useEffect(() => {
    if (!playerBotId) {
      setBot(null);
      setStatus(null);
      return undefined;
    }
    let stop = false;
    setNote("");
    setActionError("");
    api(`/api/bots/${playerBotId}`)
      .then((data) => {
        if (stop) return;
        setStatus(null);
        setBot(data.bot);
      })
      .catch(() => {
        if (stop) return;
        setBot(null);
        setStatus(null);
        setPinnedId("");
        writePinned("");
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
      } catch (err) {
        if (!stop) setStatus({ problems: [err.message], song: null, volume: null, queue: null });
      }
    }
    pull();
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [bot?.id, playerBotId, tick]);

  const act = useCallback(async (body) => {
    if (!playerBotId) return null;
    setActionError("");
    setNote("");
    try {
      const result = await api(`/api/bots/${playerBotId}/action`, { method: "POST", body });
      if (result.redirect) navigate(result.redirect);
      else if (result.botId && String(result.botId) !== String(playerBotId)) navigate(`/bots/${result.botId}`);
      else if (body.op !== "volume" && body.op !== "seek") setNote(result.message || "");
      setTick((value) => value + 1);
      return result;
    } catch (err) {
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
          <a className="brand" href="/">
            <img src="/favicon.svg" alt="" />
            TS3 Panel
          </a>
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
            <button className="btn btn-ghost" type="button" onClick={() => signOut().then(() => navigate("/login"))}>
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
          <PlayerBar />
        </div>
      </div>
    </PlayerProvider>
  );
}

function BotTabs({ id, bot, roster, pathname, admin }) {
  const { t } = useAuth();
  const navigate = useNavigate();
  const options = roster.some((item) => String(item.id) === String(bot.id)) ? roster : [bot, ...roster];
  return (
    <div className="bot-context">
      <nav className="bot-tabs" aria-label={bot.name}>
        <Tab to={`/bots/${id}`} end>{t("Playback")}</Tab>
        <Tab to={`/bots/${id}/playlists`}>{t("Playlists")}</Tab>
        <Tab to={`/bots/${id}/streams`}>{t("Radio")}</Tab>
        <Tab to={`/bots/${id}/history`}>{t("History")}</Tab>
        {admin ? <Tab to={`/bots/${id}/connection`}>{t("Connection")}</Tab> : null}
      </nav>
      {options.length > 1 ? (
        <label className="bot-switch">
          <span className="visually-hidden">{t("Switch bot")}</span>
          <select value={String(id)} onChange={(event) => navigate(`/bots/${event.target.value}${sectionPath(pathname)}`)}>
            {options.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.instanceName ? `${item.name} · ${item.instanceName}` : item.name}
              </option>
            ))}
          </select>
        </label>
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
  if (pathname.includes("/playlists")) return "/playlists";
  if (pathname.endsWith("/streams")) return "/streams";
  if (pathname.endsWith("/history")) return "/history";
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
  if (pathname.includes("/playlists")) return t("Playlists");
  if (pathname.endsWith("/streams")) return t("Radio");
  if (pathname.endsWith("/history")) return t("History");
  if (pathname.endsWith("/connection")) return t("Connection");
  return t("Playback");
}
