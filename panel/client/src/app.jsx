import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { Account, Audit, Connection, History, InstancePage, Login, Overview, Playback, Playlist, Playlists, Radio, Users } from "./pages.jsx";

export function App() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={user ? <Shell /> : <Navigate to="/login" replace />}>
        <Route index element={<Overview />} />
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
  const inBot = location.pathname.startsWith("/bots/");
  const [bot, setBot] = useState(null);
  const [open, setOpen] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    setOpen(false);
    contentRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!inBot || !id) {
      setBot(null);
      return;
    }
    let stop = false;
    api(`/api/bots/${id}`)
      .then((data) => {
        if (!stop) setBot(data.bot);
      })
      .catch(() => {
        if (!stop) setBot(null);
      });
    return () => {
      stop = true;
    };
  }, [inBot, id]);

  const section = inBot ? botSection(location.pathname, t) : pageSection(location.pathname, t);

  return (
    <div className="shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <a className="brand" href="/">
          <img src="/favicon.svg" alt="" />
          TS3 Panel
        </a>
        <div className="side-scroll">
          {inBot && bot ? (
            <>
              <NavLink className="side-link" to={bot.instanceId ? `/instances/${bot.instanceId}` : "/"}>
                {bot.instanceName || t("Instances")}
              </NavLink>
              <div className="side-label">{bot.name}</div>
              <SideLink to={`/bots/${id}`} end>{t("Playback")}</SideLink>
              <SideLink to={`/bots/${id}/playlists`}>{t("Playlists")}</SideLink>
              <SideLink to={`/bots/${id}/streams`}>{t("Radio")}</SideLink>
              <SideLink to={`/bots/${id}/history`}>{t("History")}</SideLink>
              {user.role === "admin" ? <SideLink to={`/bots/${id}/connection`}>{t("Connection")}</SideLink> : null}
            </>
          ) : null}
          <div className="side-label">{t("Main")}</div>
          <SideLink to="/" end>{t("Overview")}</SideLink>
          {user.role === "admin" ? <SideLink to="/users">{t("Users")}</SideLink> : null}
          {user.role === "admin" ? <SideLink to="/audit">{t("Audit")}</SideLink> : null}
          <SideLink to="/account">{t("Account")}</SideLink>
        </div>
        <div className="side-foot">
          <p className="who">{user.username}</p>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => signOut().then(() => navigate("/login"))}
          >
            {t("Sign out")}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="btn menu-toggle" type="button" onClick={() => setOpen((value) => !value)}>
            {t("Main")}
          </button>
          <div className="crumb">
            TS3 Panel <span aria-hidden="true"> / </span> <strong>{section}</strong>
          </div>
        </header>
        <main className="content" ref={contentRef}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SideLink({ to, end, children }) {
  return (
    <NavLink className={({ isActive }) => (isActive ? "side-link active" : "side-link")} to={to} end={end}>
      {children}
    </NavLink>
  );
}

function pageSection(pathname, t) {
  if (pathname.startsWith("/users")) return t("Users");
  if (pathname.startsWith("/audit")) return t("Audit");
  if (pathname.startsWith("/account")) return t("Account");
  if (pathname.startsWith("/instances")) return t("Instances");
  return t("Overview");
}

function botSection(pathname, t) {
  if (pathname.endsWith("/playlists") || pathname.includes("/playlists/")) return t("Playlists");
  if (pathname.endsWith("/streams")) return t("Radio");
  if (pathname.endsWith("/history")) return t("History");
  if (pathname.endsWith("/connection")) return t("Connection");
  return t("Playback");
}
