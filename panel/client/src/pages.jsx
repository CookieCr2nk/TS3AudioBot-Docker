import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api.js";
import { hostingChanges } from "./hostingForm.js";
import { useAuth } from "./auth.jsx";
import { usePlayer } from "./player.jsx";

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [loadedPath, setLoadedPath] = useState(path);
  if (loadedPath !== path) {
    setLoadedPath(path);
    setData(null);
    setError("");
  }
  useEffect(() => {
    let stop = false;
    api(path)
      .then((value) => {
        if (!stop) setData(value);
      })
      .catch((err) => {
        if (!stop) setError(err.message);
      });
    return () => {
      stop = true;
    };
  }, [path, tick]);
  return { data, error, setData, reload: () => setTick((value) => value + 1) };
}

const PAGE_SIZES = [10, 25, 50, 100];

function useToastDock() {
  const [dock, setDock] = useState(null);
  useLayoutEffect(() => {
    setDock(document.getElementById("toast-dock"));
  }, []);
  return dock;
}

export function Notice({ error, note }) {
  const dock = useToastDock();
  if (!error && !note) return null;
  const node = error
    ? <p className="flash flash-error" role="alert">{error}</p>
    : <p className="flash flash-ok" role="status">{note}</p>;
  return dock ? createPortal(node, dock) : node;
}

export function AddBot({ instanceId = "" }) {
  const { t } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState([]);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(String(instanceId || ""));
  const choices = instances.filter((item) => item.canCreate);

  useEffect(() => {
    if (!open) return undefined;
    let stop = false;
    api("/api/instances")
      .then((data) => {
        if (stop) return;
        const next = data.instances || [];
        setInstances(next);
        const allowed = next.filter((item) => item.canCreate);
        setPicked((current) => current || (instanceId ? String(instanceId) : (allowed[0] ? String(allowed[0].id) : "")));
      })
      .catch((err) => {
        if (!stop) setError(err.message);
      });
    return () => {
      stop = true;
    };
  }, [open]);

  if (!open) {
    return <button className="btn btn-plus" type="button" aria-label={t("Add bot")} onClick={() => { setError(""); setOpen(true); }}>+</button>;
  }
  return (
    <div className="add-pop">
    <form className="card add-card" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const target = String(form.get("instanceId") || picked);
      setError("");
      try {
        const result = await api(`/api/instances/${target}/bots`, { method: "POST", body: { name: form.get("name") } });
        navigate(`/bots/${result.botId}`);
      } catch (err) {
        setError(err.message);
      }
    }}>
      <h2>{t("Create a bot")}</h2>
      <Notice error={error || (choices.length ? "" : t("You cannot create bots. Ask an administrator to assign one."))} />
      <label>{t("Instance")}
        <select name="instanceId" value={picked} onChange={(event) => setPicked(event.target.value)} required>
          {choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className="split">
        <label className="grow">{t("Name")}<input name="name" required maxLength={120} placeholder="bot" /></label>
        <button className="btn btn-primary" type="submit" disabled={!choices.length}>{t("Create")}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
      </div>
    </form>
    </div>
  );
}

function AddInstance() {
  const { t } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  if (!open) {
    return <button className="btn btn-plus" type="button" aria-label={t("Add instance")} onClick={() => { setError(""); setOpen(true); }}>+</button>;
  }
  return (
    <div className="add-pop">
    <form className="card add-card" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setError("");
      try {
        const result = await api("/api/admin/instances", {
          method: "POST",
          body: { name: form.get("name"), baseUrl: form.get("baseUrl"), enabled: "on" },
        });
        navigate(`/instances/${result.id}`);
      } catch (err) {
        setError(err.message);
      }
    }}>
      <h2>{t("Add instance")}</h2>
      <Notice error={error} />
      <label>{t("Display name")}<input name="name" required maxLength={120} /></label>
      <label>{t("API address")}<input name="baseUrl" required maxLength={255} placeholder="http://ts3audiobot:58913" /></label>
      <div className="inline">
        <button className="btn btn-primary" type="submit">{t("Save")}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
      </div>
    </form>
    </div>
  );
}

export function Login() {
  const { signIn, t } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>TS3 Panel</h1>
        <p className="muted">{t("Sign in")}</p>
        <Notice error={error} />
        <label>{t("Username")}
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>{t("Password")}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary" type="submit">{t("Sign in")}</button>
      </form>
    </main>
  );
}

export function Overview() {
  const { user, t } = useAuth();
  const location = useLocation();
  const { data, error } = useLoad("/api/overview");
  const cards = data?.cards || [];
  const online = cards.filter((card) => card.online).length;
  const bots = cards.reduce((total, card) => total + (card.botCount || 0), 0);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Overview")}</h1>
          <p className="muted">{t("Each entry is one Docker container. Several TeamSpeak bots can run inside it.")}</p>
        </div>
        <span className="inline">
          {user.role === "admin" ? <AddInstance /> : null}
          <Link className="btn btn-primary" to="/bots">{t("Bots")}</Link>
        </span>
      </div>
      <Notice error={error} note={location.state?.note || ""} />
      {data ? (
        <section className="stats" aria-label={t("Dashboard")}>
          <div className="stat"><span>{t("Instances")}</span><strong>{cards.length}</strong></div>
          <div className="stat stat-ok"><span>{t("Online")}</span><strong>{online}</strong></div>
          <div className="stat stat-bad"><span>{t("Offline")}</span><strong>{cards.length - online}</strong></div>
          <div className="stat"><span>{t("Bots")}</span><strong>{bots}</strong></div>
          <div className="stat-meter">
            <div className="meter" role="img" aria-label={t("{online} of {count} instances are online", { online, count: cards.length })}>
              <span style={{ width: cards.length ? `${Math.round((online / cards.length) * 100)}%` : "0%" }} />
            </div>
            <p className="muted">{t("{online} of {count} instances are online", { online, count: cards.length })}</p>
          </div>
        </section>
      ) : null}
      {data && cards.length === 0 ? <p className="muted">{t("No instance has been added yet.")}</p> : null}
      {cards.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Status")}</th>
                <th>{t("Bots")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id}>
                  <td>
                    {card.name}
                    {card.ownerName ? <div className="muted">{card.ownerName}</div> : null}
                  </td>
                  <td>
                    <span className={card.online ? "pill pill-ok" : "pill pill-bad"}>{card.online ? t("Connected") : t("Offline")}</span>
                    {card.version ? <div className="muted mono">{card.version}</div> : null}
                    {card.error ? <div className="muted">{card.error}</div> : null}
                  </td>
                  <td><Link to={`/bots?instance=${card.id}`} aria-label={t("Open in Bots")}>{t("{count} bots", { count: card.botCount })}</Link></td>
                  <td><Link className="btn" to={`/instances/${card.id}`}>{t("Open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function BotsPage() {
  const { user, t } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useLoad("/api/bots");
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const allRef = useRef(null);
  const [dockSlot, setDockSlot] = useState(null);
  const bots = data?.bots || [];
  const instanceId = params.get("instance") || "";
  const instances = [];
  for (const bot of bots) {
    if (!instances.some((item) => item.id === bot.instanceId)) instances.push({ id: bot.instanceId, name: bot.instanceName || t("Instance") });
  }
  const filtered = bots.filter((bot) => {
    if (instanceId && String(bot.instanceId) !== instanceId) return false;
    if (query && !bot.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectable = visible.filter((bot) => bot.canControl);
  const allPicked = selectable.length > 0 && selectable.every((bot) => selected.includes(bot.id));
  const somePicked = selectable.some((bot) => selected.includes(bot.id));

  useEffect(() => {
    if (!data?.bots) return;
    const known = new Set(data.bots.map((bot) => bot.id));
    setSelected((current) => {
      const next = current.filter((id) => known.has(id));
      return next.length === current.length ? current : next;
    });
  }, [data]);

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = somePicked && !allPicked;
  }, [somePicked, allPicked]);

  useEffect(() => {
    setPage(1);
  }, [query, instanceId, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    setDockSlot(document.getElementById("bulk-slot"));
  }, []);

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleVisible() {
    setSelected((current) => {
      if (allPicked) return current.filter((id) => !selectable.some((bot) => bot.id === id));
      const next = new Set(current);
      for (const bot of selectable) next.add(bot.id);
      return [...next];
    });
  }

  async function apply(op) {
    if (!selected.length || busy) return;
    const ids = selected;
    setBusy(true);
    setFormError("");
    setNote("");
    try {
      const result = await api("/api/bots/bulk", { method: "POST", body: { ids, op } });
      const failed = (result.results || []).filter((item) => !item.ok);
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      if (failed.length) {
        const detail = failed.map((item) => `${item.name || item.id}: ${item.message}`).filter(Boolean).join(" ");
        setFormError([result.message, detail].filter(Boolean).join(" "));
      } else {
        setNote(result.message || "");
      }
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function setInstance(value) {
    const next = new URLSearchParams(params);
    if (!value) next.delete("instance");
    else next.set("instance", value);
    setParams(next);
  }

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>{t("Bots")}</h1>
          <p className="muted">{t("Every TeamSpeak bot you can open. Select several to start or stop them together.")}</p>
        </div>
        <span className="inline">
          {data?.canCreate ? <AddBot /> : null}
          <button className="btn" type="button" onClick={() => reload()}>{t("Refresh")}</button>
        </span>
      </div>
      <Notice error={formError || error} note={note} />
      {bots.length ? (
        <div className="split">
          <label className="grow">{t("Filter by name")}
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label>{t("Instance")}
            <select value={instanceId} onChange={(event) => setInstance(event.target.value)}>
              <option value="">{t("All instances")}</option>
              {instanceId && !instances.some((item) => String(item.id) === instanceId) ? <option value={instanceId}>{t("Instance")}</option> : null}
              {instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {instanceId || query ? <button className="btn" type="button" onClick={() => { setQuery(""); setInstance(""); }}>{t("Reset")}</button> : null}
        </div>
      ) : null}
      {bots.length ? (
        <div className="user-pager">
          <label>{t("Per page")}
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="transport">
            <button className="btn" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t("Previous page")}</button>
            <span className="muted">{t("Page {page} of {pages}", { page: currentPage, pages: pageCount })}</span>
            <button className="btn" type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{t("Next page")}</button>
          </div>
        </div>
      ) : null}
      {dockSlot && selected.length ? createPortal(
      <section className="card bulk-bar">
        <div className="split">
          <h2>{t("Apply to selected")}</h2>
          <span className="muted">{busy ? t("Working…") : t("{count} selected", { count: selected.length })}</span>
          <button className="btn" type="button" onClick={() => setSelected([])}>{t("Clear selection")}</button>
        </div>
        <div className="transport">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => apply("start")}>{t("Start")}</button>
          <button className="btn btn-danger" type="button" disabled={busy} onClick={() => apply("stop")}>{t("Stop")}</button>
        </div>
      </section>,
      dockSlot) : null}
      {data && filtered.length === 0 ? <p className="muted">{bots.length ? t("Nothing matches.") : t("No bots yet.")}</p> : null}
      {filtered.length ? (
        <div className="table-wrap bot-list">
          <table className="bot-table">
            <thead>
              <tr>
                <th>
                  <input ref={allRef} type="checkbox" checked={allPicked} disabled={!selectable.length} aria-label={t("Select all")} onChange={toggleVisible} />
                </th>
                <th>{t("Name")}</th>
                <th>{t("Owner")}</th>
                <th>{t("Instance")}</th>
                <th>{t("Status")}</th>
                <th className="bot-playing">{t("Now playing")}</th>
                <th className="bot-volume">{t("Volume")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((bot) => {
                const playback = bot.playback;
                const picked = selected.includes(bot.id);
                let status = t("Not playing");
                let pill = "pill";
                if (playback && !playback.online) {
                  status = t("Offline");
                  pill = "pill pill-bad";
                } else if (playback?.title && playback.paused === false) {
                  status = t("Playing");
                  pill = "pill pill-ok";
                } else if (playback?.title && playback.paused) {
                  status = t("Paused");
                  pill = "pill pill-warn";
                }
                const server = playback?.online && playback.server ? playback.server : bot.address;
                return (
                  <tr key={bot.id} className={picked ? "picked" : ""}>
                    <td className="bot-check">
                      <input
                        type="checkbox"
                        checked={picked}
                        disabled={!bot.canControl}
                        aria-label={t("Select {name}", { name: bot.name })}
                        title={bot.canControl ? "" : t("Read only")}
                        onChange={() => toggle(bot.id)}
                      />
                    </td>
                    <td className="bot-name"><Link className="bot-clip" to={`/bots/${bot.id}`} title={bot.name}>{bot.name}</Link></td>
                    <td className="owner">
                      {user.role === "admin" ? (
                        <select
                          className="owner-select"
                          aria-label={t("Owner")}
                          key={`${bot.id}-${bot.assigneeUserId || "none"}`}
                          defaultValue={bot.assigneeUserId || ""}
                          onChange={async (event) => {
                            setFormError("");
                            try {
                              const result = await api(`/api/bots/${bot.id}/assignee`, {
                                method: "POST",
                                body: { userId: event.target.value },
                              });
                              setNote(result.message || "");
                              reload();
                            } catch (err) {
                              setFormError(err.message);
                              reload();
                            }
                          }}
                        >
                          <option value="">{bot.ownerName ? t("Instance owner ({name})", { name: bot.ownerName }) : t("Instance owner")}</option>
                          {(data.users || []).map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
                        </select>
                      ) : (bot.ownerName || t("No owner"))}
                    </td>
                    <td>{bot.instanceId ? <Link className="bot-clip" to={`/instances/${bot.instanceId}`} title={bot.instanceName}>{bot.instanceName}</Link> : <span className="bot-clip" title={bot.instanceName}>{bot.instanceName}</span>}</td>
                    <td>
                      <span className={pill} title={playback?.error || ""}>{status}</span>
                      {server ? <span className="mono muted bot-server" title={server}>{server}</span> : null}
                    </td>
                    <td className="bot-playing"><span className="bot-clip" title={playback?.title || ""}>{playback?.title || "—"}</span></td>
                    <td className="mono bot-volume">{playback?.volume != null ? playback.volume : "—"}</td>
                    <td className="inline bot-actions">
                      <Link className="btn" to={`/bots/${bot.id}`}>{t("Open")}</Link>
                      {bot.canDelete ? (
                        <DeleteBot name={bot.name} onSubmit={async (confirm) => {
                          setFormError("");
                          try {
                            const result = await api(`/api/instances/${bot.instanceId}/bots/delete`, {
                              method: "POST",
                              body: { name: bot.template || bot.name, confirm },
                            });
                            setNote(result.message || "");
                            reload();
                          } catch (err) {
                            setFormError(err.message);
                          }
                        }} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function InstancePage() {
  const { id } = useParams();
  const { user, t } = useAuth();
  const navigate = useNavigate();
  const { data, error, reload } = useLoad(`/api/instances/${id}`);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const instance = data?.instance;

  async function run(path, body, after) {
    setFormError("");
    setNote("");
    try {
      const result = await api(path, { method: "POST", body });
      setNote(result.message || "");
      if (after) after(result);
      else reload();
      return result;
    } catch (err) {
      setFormError(err.message);
      return null;
    }
  }

  async function saveInstance(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const grants = [...form.getAll("grantUser")]
      .filter((userId) => userId && userId !== form.get("ownerUserId"))
      .map((userId) => ({ userId: Number(userId), canControl: true }));
    const result = await run(`/api/admin/instances/${id}`, {
      name: form.get("name"),
      baseUrl: form.get("baseUrl"),
      ownerUserId: form.get("ownerUserId"),
      apiUser: form.get("apiUser"),
      apiToken: form.get("apiToken"),
      clearToken: form.get("clearToken") === "on",
      notes: form.get("notes"),
      enabled: form.get("enabled") === "on",
      grants,
    });
    if (result) formElement.querySelector("input[name=apiToken]").value = "";
  }

  if (!instance && error) return <div className="page"><Notice error={error} /></div>;
  if (!instance) return null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{instance.name}</h1>
          <p className="muted">{t("TeamSpeak bots on this instance. The panel does not start the container.")}</p>
          {instance.baseUrl ? <p className="mono">{instance.baseUrl}</p> : null}
        </div>
        <Link className="btn" to={`/bots?instance=${id}`}>{t("Open in Bots")}</Link>
      </div>
      <Notice error={formError || error} note={note} />

      {data.canCreate ? (
        <form className="card" onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          run(`/api/instances/${id}/bots`, { name }, (result) => navigate(`/bots/${result.botId}`));
        }}>
          <h2>{t("Create a bot")}</h2>
          <div className="split">
            <label className="grow">{t("Name")}
              <input name="name" required maxLength={120} placeholder="bot" />
            </label>
            <button className="btn btn-primary" type="submit">{t("Create")}</button>
          </div>
        </form>
      ) : null}

      {data.canCreate ? (
        <form className="card" onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          run(`/api/instances/${id}/bots/attach`, { name }, (result) => navigate(`/bots/${result.botId}`));
        }}>
          <h2>{t("Add an existing bot")}</h2>
          <p className="muted">{t("Use the name TS3AudioBot already has, such as default. This does not create a bot.")}</p>
          <div className="split">
            <label className="grow">{t("Name")}
              <input name="name" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" placeholder="default" />
            </label>
            <button className="btn" type="submit">{t("Attach")}</button>
          </div>
        </form>
      ) : null}

      {user.role === "admin" ? (
        <form className="card" onSubmit={saveInstance}>
          <h2>{t("Settings")}</h2>
          <p className="muted">{t("On the Compose network the API address is enough. A token is stored encrypted only if you enter one.")}</p>
          <label>{t("Display name")}<input name="name" required maxLength={120} defaultValue={instance.name} /></label>
          <label>{t("API address")}<input name="baseUrl" required maxLength={255} defaultValue={instance.baseUrl} /></label>
          <label>{t("Owner")}
            <select name="ownerUserId" defaultValue={instance.ownerUserId || ""}>
              <option value="">{t("No owner")}</option>
              {(data.users || []).map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
            </select>
          </label>
          <div className="split">
            <label className="grow">{t("API UID")}<input name="apiUser" maxLength={128} defaultValue={instance.apiUser || ""} autoComplete="off" /></label>
            <label className="grow">{t("API token")}<input name="apiToken" type="password" maxLength={512} autoComplete="off" placeholder={instance.hasToken ? t("Leave blank to keep the saved token") : t("optional, or uid:token")} /></label>
          </div>
          {instance.hasToken ? <label className="check"><input type="checkbox" name="clearToken" value="on" /> {t("Remove saved token")}</label> : null}
          <label>{t("Note")}<textarea name="notes" maxLength={500} rows={3} defaultValue={instance.notes} /></label>
          <label className="check"><input type="checkbox" name="enabled" value="on" defaultChecked={instance.enabled} /> {t("Instance is enabled")}</label>
          <label>{t("Users")}
            <select name="grantUser" multiple size={Math.min(8, Math.max((data.users || []).length, 3))} defaultValue={(data.grants || []).map((item) => String(item.userId))}>
              {(data.users || []).filter((account) => account.role !== "admin").map((account) => (
                <option key={account.id} value={account.id}>{account.username}</option>
              ))}
            </select>
          </label>
          <p className="muted">{t("Selected accounts can open this instance. They only see bots assigned to them.")}</p>
          <div className="transport">
            <button className="btn btn-primary" type="submit">{t("Save")}</button>
            <button className="btn" type="button" onClick={() => run(`/api/admin/instances/${id}/test`, {})}>{t("Check connection")}</button>
          </div>
        </form>
      ) : null}
      {user.role === "admin" ? (
        <form className="card" onSubmit={async (event) => {
          event.preventDefault();
          const confirm = new FormData(event.currentTarget).get("confirm");
          setFormError("");
          setNote("");
          try {
            const result = await api(`/api/admin/instances/${id}`, { method: "DELETE", body: { confirm } });
            navigate("/", { state: { note: result.message } });
          } catch (err) {
            setFormError(err.message);
          }
        }}>
          <h2>{t("Delete instance")}</h2>
          <label>{t("Type the instance name to confirm")}<input name="confirm" required maxLength={120} /></label>
          <button className="btn btn-danger" type="submit">{t("Delete")}</button>
        </form>
      ) : null}
    </div>
  );
}

function DeleteBot({ name, onSubmit }) {
  const { t } = useAuth();
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-danger" type="button" onClick={() => setOpen(true)}>{t("Delete")}</button>;
  return (
    <form className="inline" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(new FormData(event.currentTarget).get("confirm"));
    }}>
      <input name="confirm" required maxLength={120} placeholder={t("Type the bot name to confirm")} aria-label={t("Type the bot name to confirm")} />
      <button className="btn btn-danger" type="submit">{t("Delete")}</button>
      <button className="btn" type="button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
    </form>
  );
}

function useBotAction(botId, onDone) {
  const navigate = useNavigate();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function act(body) {
    setError("");
    setNote("");
    try {
      const result = await api(`/api/bots/${botId}/action`, { method: "POST", body });
      if (result.redirect) navigate(result.redirect);
      else if (result.botId) navigate(`/bots/${result.botId}`);
      else setNote(result.message || "");
      onDoneRef.current?.();
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }
  return { note, error, act, setNote, setError };
}

export function Playback() {
  const { id } = useParams();
  const { t } = useAuth();
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [factory, setFactory] = useState("youtube");
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [loadedId, setLoadedId] = useState(id);
  if (loadedId !== id) {
    setLoadedId(id);
    setQuery("");
    setResults([]);
    setSearchError("");
  }
  const sameBot = String(player?.bot?.id || "") === String(id);
  const status = sameBot ? player.status : null;
  const song = status?.song;
  const queue = status?.queue;
  const canControl = Boolean(player?.canControl);
  function act(body) {
    return player?.act(body);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Playback")}</h1>
          <p className="muted song-title" title={song?.title || ""}>{song?.title || t("Nothing is playing.")}</p>
        </div>
        <span className="pill">{song ? (song.paused ? t("Paused") : t("Playing")) : t("Not playing")}</span>
      </div>
      <div className="transport">
        {[-30, -10, 10, 30].map((delta) => (
          <button key={delta} className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "nudge", delta })}>
            {delta > 0 ? `+${delta}` : delta}s
          </button>
        ))}
        <button className="btn" type="button" disabled={!canControl} onClick={() => window.confirm(t("Stop playback?")) && act({ op: "stop" })}>{t("Stop")}</button>
        <button className="btn btn-danger" type="button" disabled={!canControl} onClick={() => window.confirm(t("Clear the queue?")) && act({ op: "clear" })}>{t("Clear")}</button>
      </div>
      {queue?.items?.length ? (
        <div className="table-wrap">
          <table className="fit-table">
            <thead><tr><th className="col-index">#</th><th>{queue.title || t("Queue")}</th><th className="fit-action"></th></tr></thead>
            <tbody>
              {queue.items.map((item) => (
                <tr key={item.index} className={item.index === queue.index ? "picked" : ""}>
                  <td className="mono">{item.index}</td>
                  <td className="clip-cell" title={item.title}>{item.title}</td>
                  <td><button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "jump", index: item.index })}>{t("Jump")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        setSearchError("");
        const value = query.trim();
        if (/^https?:\/\//i.test(value)) {
          setResults([]);
          await act({ op: "play", resource: value });
          return;
        }
        try {
          const data = await api(`/api/bots/${id}/search?q=${encodeURIComponent(value)}&factory=${factory}`);
          setResults(data.results || []);
        } catch (err) {
          setResults([]);
          setSearchError(err.message);
        }
      }}>
        <h2>{t("Search")}</h2>
        <Notice error={searchError} />
        <div className="split">
          <label className="grow">{t("Search term")}
            <input value={query} onChange={(event) => setQuery(event.target.value)} required placeholder="https://" />
          </label>
          <label>{t("Source")}
            <select value={factory} onChange={(event) => setFactory(event.target.value)}>
              <option value="youtube">youtube</option>
              <option value="soundcloud">soundcloud</option>
              <option value="twitch">twitch</option>
              <option value="media">media</option>
            </select>
          </label>
          {/^https?:\/\//i.test(query.trim()) ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={!canControl}>{t("Play")}</button>
              <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "add", resource: query.trim() })}>{t("Add to queue")}</button>
            </>
          ) : <button className="btn btn-primary" type="submit">{t("Search")}</button>}
        </div>
        {results.map((item) => (
          <div className="split" key={`${item.index}-${item.title}`}>
            <span className="grow search-title" title={item.title}>{item.title}</span>
            <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "search-play", index: item.index })}>{t("Play")}</button>
            <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "search-add", index: item.index })}>{t("Append")}</button>
          </div>
        ))}
      </form>
    </div>
  );
}

export function Radio() {
  const { id } = useParams();
  const { user, t } = useAuth();
  const player = usePlayer();
  const { data, error, reload } = useLoad(`/api/bots/${id}/streams`);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [loadedId, setLoadedId] = useState(id);
  if (loadedId !== id) {
    setLoadedId(id);
    setNote("");
    setFormError("");
  }
  async function call(path, options) {
    setFormError("");
    try {
      const result = await api(path, options);
      setNote(result.message || "");
      player?.refresh();
      return result;
    } catch (err) {
      setFormError(err.message);
      return null;
    }
  }
  async function save(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setFormError("");
    try {
      const result = await api(`/api/bots/${id}/streams`, {
        method: "POST",
        body: { name: form.get("name"), url: form.get("url"), notes: form.get("notes"), shared: form.get("shared") === "on" },
      });
      setNote(result.message);
      formElement.reset();
      reload();
    } catch (err) {
      setFormError(err.message);
    }
  }
  return (
    <div className="page">
      <h1>{t("Radio")}</h1>
      <Notice error={formError || error} note={note} />
      <form className="card" onSubmit={save}>
        <h2>{t("New station")}</h2>
        <label>{t("Name")}<input name="name" required maxLength={80} /></label>
        <label>{t("Stream address")}<input name="url" required placeholder="https://" /></label>
        <label>{t("Note")}<input name="notes" maxLength={500} /></label>
        {user.role === "admin" ? <label className="check"><input type="checkbox" name="shared" value="on" /> {t("Shared catalog")}</label> : null}
        <button className="btn btn-primary" type="submit">{t("Save")}</button>
      </form>
      <div className="station-list">
        {(data?.streams || []).map((stream) => (
          <article className="card station" key={stream.id}>
            <div className="station-text">
              <h2>{stream.name}{stream.shared ? <span className="pill">{t("Shared")}</span> : null}</h2>
              <p className="mono muted">{stream.displayUrl}</p>
            </div>
            <div className="station-actions">
              <button className="btn btn-primary" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "play" } })}>{t("Play")}</button>
              <button className="btn" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "add" } })}>{t("Add to queue")}</button>
              {stream.canDelete ? <button className="btn btn-danger" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}`, { method: "DELETE", body: {} }).then((result) => { if (result) reload(); })}>{t("Delete")}</button> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function History() {
  const { id } = useParams();
  const { t } = useAuth();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [loadedId, setLoadedId] = useState(id);
  if (loadedId !== id) {
    setLoadedId(id);
    setQuery("");
    setSubmitted("");
  }
  const path = loadedId === id && submitted
    ? `/api/bots/${id}/history?q=${encodeURIComponent(submitted)}`
    : `/api/bots/${id}/history`;
  const { data, error } = useLoad(path);
  const player = usePlayer();
  const { note, error: actionError, act } = useBotAction(id, player?.refresh);
  return (
    <div className="page">
      <h1>{t("History")}</h1>
      <Notice error={error || actionError} note={note} />
      <form className="card" onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(query.trim());
      }}>
        <div className="split">
          <label className="grow">{t("Title contains")}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="btn" type="submit">{t("Search")}</button>
        </div>
      </form>
      <div className="table-wrap">
        <table className="fit-table">
          <thead><tr><th>{t("Name")}</th><th className="fit-action"></th></tr></thead>
          <tbody>
            {(data?.rows || []).map((row, index) => (
              <tr key={`${row.id}-${index}`}>
                <td>
                  <span className="clip-line" title={row.title}>{row.title}</span>
                  {row.meta ? <span className="muted clip-line" title={row.meta}>{row.meta}</span> : null}
                </td>
                <td>{row.id != null ? <button className="btn" type="button" onClick={() => act({ op: "history-play", historyId: row.id })}>{t("Play")}</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StartupStream({ hosting, stations }) {
  const { t } = useAuth();
  const saved = hosting?.startup || "";
  const savedId = hosting?.startupStreamId == null ? "" : String(hosting.startupStreamId);
  const byId = stations.find((station) => String(station.id) === savedId);
  const byUrl = stations.find((station) => station.url && station.url === saved.trim());
  const initial = byId || byUrl;
  const [choice, setChoice] = useState(initial ? String(initial.id) : saved ? "custom" : "");
  const [custom, setCustom] = useState(initial ? "" : saved);
  const station = stations.find((item) => String(item.id) === choice);
  const typed = custom.trim();
  const customMatch = choice === "custom"
    ? stations.find((item) => item.url && item.url === typed)
    : null;
  return (
    <div>
      <label>{t("Stream on connect")}
        <select value={choice} onChange={(event) => {
          const next = event.target.value;
          if (next === "custom" && !custom.trim()) setCustom(station?.url || saved);
          setChoice(next);
        }}>
          <option value="">{t("Not set")}</option>
          {stations.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
          <option value="custom">{t("Other address")}</option>
        </select>
      </label>
      {station ? <input type="hidden" name="streamId" value={station.id} /> : null}
      {choice === "custom" ? (
        <label>{t("Address")}
          <input
            name="startup"
            value={custom}
            placeholder="https://"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCustom(event.target.value)}
          />
          {customMatch ? <input type="hidden" name="streamId" value={customMatch.id} /> : null}
        </label>
      ) : station ? null : <input type="hidden" name="startup" value="" />}
      {station?.url ? <p className="muted mono startup-url">{station.url}</p> : null}
      <p className="muted">{t("Choose a saved station or another address. Not set removes the stream.")}</p>
    </div>
  );
}

export function Connection() {
  const { id } = useParams();
  const { t } = useAuth();
  const { data, error, reload } = useLoad(`/api/bots/${id}/connection`);
  const player = usePlayer();
  const { note, error: actionError, act, setError, setNote } = useBotAction(id, player?.refresh);
  const [localNote, setLocalNote] = useState("");
  if (!data && !error) return <div className="page"><h1>{t("Connection")}</h1></div>;
  return (
    <div className="page">
      <h1>{t("Connection")}</h1>
      <p className="muted">{t("The panel remembers these settings. Clear the nickname or the default channel and save to reset it. An empty password, bitrate, or volume stays as it is. Passwords go to the bot and are not stored here.")}</p>
      <Notice error={error || actionError} note={note || localNote} />
      <form className="card" key={[
        data?.bot?.name,
        data?.hosting?.name,
        data?.hosting?.nickname,
        data?.hosting?.channel,
        data?.hosting?.bitrate,
        data?.hosting?.volume,
        data?.hosting?.run,
        data?.hosting?.startup,
        data?.hosting?.startupStreamId,
      ].join("|") || "hosting"} onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const label = String(form.get("label") || "").trim();
        const labelChanged = Boolean(label && label !== (data?.bot?.name || ""));
        const patch = hostingChanges(Object.fromEntries(form.entries()), data?.hosting);
        setError("");
        setNote("");
        setLocalNote("");
        if (labelChanged) {
          try {
            const renamed = await api(`/api/bots/${id}/label`, { method: "POST", body: { name: label } });
            setLocalNote(renamed.message || "");
          } catch (err) {
            setError(err.message);
            return;
          }
        }
        if (!Object.keys(patch).length) {
          if (labelChanged) reload();
          else setLocalNote(t("Nothing changed."));
          return;
        }
        const result = await act({ op: "template-hosting", name: form.get("name"), ...patch });
        if (result) {
          setLocalNote(result.message || "");
          reload();
        } else if (labelChanged) reload();
      }}>
        <h2>{t("Connection settings")}</h2>
        <label>{t("Display name")}
          <input name="label" maxLength={120} defaultValue={data?.bot?.name || ""} />
        </label>
        <p className="muted">{t("This is the name in the panel. The TeamSpeak nickname is separate.")}</p>
        <input type="hidden" name="name" value={data?.hosting?.name || ""} />
        <label>{t("Nickname")}<input name="nickname" maxLength={30} placeholder="Music" defaultValue={data?.hosting?.nickname || ""} /></label>
        <p className="muted">{t("The connected name changes immediately. An offline bot uses it the next time it connects.")}</p>
        <label>{t("Default channel")}<input name="channel" maxLength={200} placeholder={t("/5 or Home/Lobby")} defaultValue={data?.hosting?.channel || ""} /></label>
        <p className="muted">{t("Saved as the channel this bot joins. Leave it empty and save to reset it. A connected bot moves only when you set a channel.")}</p>
        <div className="split">
          <label className="grow">{t("Server password")}
            <input name="serverPassword" type="password" autoComplete="off" />
            {data?.hosting?.hasServerPassword ? <span className="muted">{t("A server password is saved on the bot.")}</span> : null}
          </label>
          <label className="grow">{t("Channel password")}
            <input name="channelPassword" type="password" autoComplete="off" />
            {data?.hosting?.hasChannelPassword ? <span className="muted">{t("A channel password is saved on the bot.")}</span> : null}
          </label>
        </div>
        <div className="split">
          <label>{t("Bitrate (kbps)")}<input name="bitrate" inputMode="numeric" placeholder="96" defaultValue={data?.hosting?.bitrate ?? ""} /></label>
          <label>{t("Default volume")}<input name="volume" inputMode="numeric" min="0" max="100" placeholder="50" defaultValue={data?.hosting?.volume ?? ""} /></label>
          <label>{t("Start when the process launches")}
            <select name="run" defaultValue={data?.hosting?.run == null ? "" : data.hosting.run ? "on" : "off"}>
              {data?.hosting?.run == null ? <option value="">{t("Not set")}</option> : null}
              <option value="on">{t("Yes")}</option>
              <option value="off">{t("No")}</option>
            </select>
          </label>
        </div>
        <StartupStream hosting={data?.hosting} stations={data?.stations || []} />
        <button className="btn btn-primary" type="submit">{t("Save")}</button>
      </form>
      <section className="card">
        <h2>{t("Move now")}</h2>
        <p className="muted">{t("Moves this bot into a channel. The default channel stays unchanged.")}</p>
        <form className="split" onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const channel = new FormData(formElement).get("channel");
          act({ op: "move", channel }).then((result) => {
            if (result) formElement.reset();
          });
        }}>
          <label className="grow">{t("Channel")}
            <input name="channel" required maxLength={200} placeholder={t("/5 or Home/Lobby")} />
          </label>
          <button className="btn" type="submit">{t("Move")}</button>
        </form>
      </section>
      {data?.connection ? (
        <section className="card">
          <h2>{t("Server")}</h2>
          <p>
            <span className={`pill pill-${data.connection.status === "connected" ? "ok" : data.connection.status === "offline" ? "bad" : "warn"}`}>{data.connection.statusLabel}</span>
          </p>
          {data.connection.error ? <p className="muted">{data.connection.error}</p> : null}
          {data.connection.status === "connected" || data.connection.status === "connecting" ? <p className="mono">{data.connection.server || "—"}</p> : (
            <form className="split" key={data.connection.server || "address"} onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              act({ op: "template-address", name: data.connection.name, address: new FormData(formElement).get("address") }).then((result) => {
                if (result) reload();
              });
            }}>
              <label className="grow">{t("Server")}
                <input name="address" defaultValue={data.connection.server || data?.hosting?.address || ""} required maxLength={200} />
              </label>
              <button className="btn btn-primary" type="submit">{t("Save")}</button>
            </form>
          )}
          <div className="inline">
            {data.connection.status !== "connected" && data.connection.status !== "connecting" ? <button className="btn" type="button" onClick={() => act({ op: "connect", name: data.connection.name }).then((result) => { if (result) reload(); })}>{t("Start")}</button> : null}
            {data.connection.id != null ? <button className="btn btn-danger" type="button" onClick={() => act({ op: "disconnect", instanceId: data.connection.id }).then((result) => { if (result) reload(); })}>{t("Disconnect")}</button> : null}
          </div>
        </section>
      ) : null}
      <section className="card">
        <h2>{t("Channel commander")}</h2>
        <p className="muted">{t("The commander icon lets the bot use channel commands. It is saved and turns on again whenever the bot connects.")}</p>
        <p>{t("Next connect")}: {data.commanderSaved == null ? t("Unknown") : data.commanderSaved ? t("On") : t("Off")}{data.commanderSavedError ? <span className="muted"> {data.commanderSavedError}</span> : null}</p>
        <p>{t("Right now")}: {data.commander == null ? t("Unknown") : data.commander ? t("On") : t("Off")}{data.commanderError ? <span className="muted"> {data.commanderError}</span> : null}</p>
        <div className="inline">
          <button className="btn btn-primary" type="button" onClick={() => act({ op: "commander", mode: "on" }).then((result) => { if (result) reload(); })}>{t("Turn on")}</button>
          <button className="btn" type="button" onClick={() => act({ op: "commander", mode: "off" }).then((result) => { if (result) reload(); })}>{t("Turn off")}</button>
        </div>
      </section>
      <section className="card">
        <h2>{t("TeamSpeak ID")}</h2>
        <p className="muted">{t("The unique ID of this bot. It is shown while the bot is connected.")}</p>
        {data.teamspeakId ? (
          <div className="split">
            <p className="mono grow">{data.teamspeakId}</p>
            <button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(data.teamspeakId)}>{t("Copy")}</button>
          </div>
        ) : <p className="muted">{data.teamspeakError || t("Unknown")}</p>}
      </section>
    </div>
  );
}

export function Users() {
  const { user, t } = useAuth();
  const { data, error, setData } = useLoad("/api/admin/users");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  if (user.role !== "admin") return <p className="flash flash-error">{t("Administrators only")}</p>;
  async function post(path, body) {
    setFormError("");
    const result = await api(path, { method: "POST", body });
    setNote(result.message || "");
    if (result.users) setData({ users: result.users, instances: result.instances || [] });
    if (result.signedOut) window.location.assign("/login");
    return result;
  }
  const accounts = data?.users || [];
  const pageCount = Math.max(1, Math.ceil(accounts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = accounts.slice(start, start + pageSize);
  const instances = data?.instances || [];
  function instanceNames(ids) {
    const names = (ids || []).map((id) => instances.find((item) => item.id === id)?.name).filter(Boolean);
    return names.length ? names.join(", ") : t("None");
  }
  return (
    <div className="page">
      <h1>{t("Users")}</h1>
      <p className="muted">{t("Panel accounts. These are not TeamSpeak identities.")}</p>
      <p className="muted">{t("A bot limit counts bots assigned to this account. A bot with nobody assigned counts for the instance owner. Leave it empty for unlimited.")}</p>
      <p className="muted">{t("A user needs at least one instance. More than one is allowed. An administrator does not. Can create bots also lets that account pick any enabled instance.")}</p>
      <Notice error={formError || error} note={note} />
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
          const role = form.get("role");
          const instanceIds = [...form.getAll("instanceId")];
          if (role !== "admin" && instanceIds.length === 0) {
            setFormError(t("Assign at least one instance"));
            return;
          }
          await post("/api/admin/users", {
            username: form.get("username"),
            password: form.get("password"),
            role,
            botLimit: form.get("botLimit"),
            canCreateBots: form.get("canCreateBots") === "yes",
            instanceIds,
          });
          formElement.reset();
        } catch (err) {
          setFormError(err.message);
        }
      }}>
        <h2>{t("Create")}</h2>
        <div className="split">
          <label>{t("Username")}<input name="username" required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}" autoComplete="off" /></label>
          <label>{t("Password")}<input name="password" type="password" autoComplete="new-password" placeholder={t("Leave empty until you set a password")} /></label>
          <label>{t("Role")}
            <select name="role" defaultValue="user">
              <option value="user">{t("User")}</option>
              <option value="admin">{t("Administrator")}</option>
            </select>
          </label>
          <label>{t("Bot limit")}<input className="bot-limit" name="botLimit" inputMode="numeric" placeholder={t("Unlimited")} /></label>
          <label>{t("Can create bots")}
            <select name="canCreateBots" defaultValue="no">
              <option value="no">{t("No")}</option>
              <option value="yes">{t("Yes")}</option>
            </select>
          </label>
          <label>{t("Instances")}
            <select name="instanceId" multiple size={Math.min(6, Math.max(instances.length, 3))}>
              {instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" type="submit">{t("Create")}</button>
        </div>
      </form>
      <div className="user-pager">
        <label>{t("Per page")}
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="transport">
          <button className="btn" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t("Previous page")}</button>
          <span className="muted">{t("Page {page} of {pages}", { page: currentPage, pages: pageCount })}</span>
          <button className="btn" type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{t("Next page")}</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("Username")}</th>
              <th>{t("Role")}</th>
              <th>{t("Status")}</th>
              <th>{t("Can create bots")}</th>
              <th>{t("Bot limit")}</th>
              <th>{t("Instances")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((account) => (
              <Fragment key={account.id}>
                <tr>
                  <td className="nowrap">
                    {account.username}
                    {account.hasPassword ? null : <span className="pill pill-warn" title={t("Cannot sign in until a password is set")}>{t("No password")}</span>}
                  </td>
                  <td className="nowrap">{account.role === "admin" ? t("Administrator") : t("User")}</td>
                  <td className="nowrap"><span className={account.suspended ? "pill pill-bad" : "pill pill-ok"}>{account.suspended ? t("Suspended") : t("Active")}</span></td>
                  <td className="nowrap">{account.canCreateBots ? t("Yes") : t("No")}</td>
                  <td className="nowrap">{account.botLimit ?? t("Unlimited")}</td>
                  <td><span className="user-instances" title={instanceNames(account.instanceIds)}>{instanceNames(account.instanceIds)}</span></td>
                  <td>
                    <button className="btn" type="button" onClick={() => setOpenId(openId === account.id ? null : account.id)}>{openId === account.id ? t("Close") : t("Edit")}</button>
                  </td>
                </tr>
                {openId === account.id ? (
                  <tr>
                    <td colSpan={7}>
                      <form className="user-edit" key={`${account.id}-${account.role}-${account.suspended}-${account.canCreateBots}-${(account.instanceIds || []).join(".")}`} onSubmit={async (event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        const role = form.get("role");
                        const instanceIds = [...form.getAll("instanceId")];
                        if (role !== "admin" && instanceIds.length === 0) {
                          setFormError(t("Assign at least one instance"));
                          return;
                        }
                        try {
                          await post(`/api/admin/users/${account.id}/role`, { role });
                          await post(`/api/admin/users/${account.id}/limit`, { botLimit: form.get("botLimit") });
                          await post(`/api/admin/users/${account.id}/create-bots`, { canCreateBots: form.get("canCreateBots") === "yes" });
                          await post(`/api/admin/users/${account.id}/instances`, { instanceIds });
                          const suspend = form.get("suspended") === "yes";
                          if (suspend !== account.suspended && account.id !== user.id) {
                            await post(`/api/admin/users/${account.id}/suspend`, { suspended: suspend });
                          }
                        } catch (err) {
                          setFormError(err.message);
                        }
                      }}>
                        <div className="split">
                          <label>{t("Role")}
                            <select name="role" defaultValue={account.role}>
                              <option value="user">{t("User")}</option>
                              <option value="admin">{t("Administrator")}</option>
                            </select>
                          </label>
                          <label>{t("Can create bots")}
                            <select name="canCreateBots" defaultValue={account.canCreateBots ? "yes" : "no"}>
                              <option value="no">{t("No")}</option>
                              <option value="yes">{t("Yes")}</option>
                            </select>
                          </label>
                          <label>{t("Status")}
                            <select name="suspended" defaultValue={account.suspended ? "yes" : "no"} disabled={account.id === user.id}>
                              <option value="no">{t("Active")}</option>
                              <option value="yes">{t("Suspended")}</option>
                            </select>
                          </label>
                          <label>{t("Bot limit")}<input className="bot-limit" name="botLimit" inputMode="numeric" placeholder={t("Unlimited")} defaultValue={account.botLimit ?? ""} /></label>
                        </div>
                        <label>{t("Instances")}
                          <select name="instanceId" multiple size={Math.min(6, Math.max(instances.length, 3))} defaultValue={(account.instanceIds || []).map(String)}>
                            {instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                        </label>
                        <div className="split">
                          <label className="grow">{t("New password")}<input name="password" type="password" minLength={10} autoComplete="new-password" /></label>
                          <button className="btn" type="button" onClick={async (event) => {
                            const password = new FormData(event.currentTarget.form).get("password");
                            if (!password) return;
                            try { await post(`/api/admin/users/${account.id}/password`, { password }); }
                            catch (err) { setFormError(err.message); }
                          }}>{t("Set")}</button>
                          <button className="btn btn-primary" type="submit">{t("Save")}</button>
                          {account.id !== user.id ? (
                            <button className="btn btn-danger" type="button" onClick={async () => {
                              if (!window.confirm(t("Delete this account?"))) return;
                              try {
                                const result = await api(`/api/admin/users/${account.id}`, { method: "DELETE", body: { confirm: true } });
                                setNote(result.message);
                                setOpenId(null);
                                setData({ users: result.users, instances: result.instances || [] });
                              } catch (err) { setFormError(err.message); }
                            }}>{t("Remove")}</button>
                          ) : null}
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Audit() {
  const { user, t } = useAuth();
  const { data, error } = useLoad("/api/admin/audit");
  if (user.role !== "admin") return <p className="flash flash-error">{t("Administrators only")}</p>;
  return (
    <div className="page">
      <h1>{t("Audit")}</h1>
      <Notice error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Time")}</th><th>{t("Name")}</th><th>{t("Action")}</th><th>{t("Detail")}</th></tr></thead>
          <tbody>
            {(data?.rows || []).map((row, index) => (
              <tr key={`${row.createdAt}-${index}`}>
                <td className="mono">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}</td>
                <td>{row.username}</td>
                <td>{row.action}</td>
                <td className="audit-detail">{row.detail}{row.botName ? <div className="muted">{row.botName}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Account() {
  const { t } = useAuth();
  const { data, error: loadError } = useLoad("/api/account");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const limitText = !data ? "" : data.botLimit == null
    ? t("No bot limit. {count} bots are in use.", { count: data.botCount })
    : t("{used} of {limit} bots are in use.", { used: data.botCount, limit: data.botLimit });
  return (
    <div className="page">
      <h1>{t("Account")}</h1>
      <Notice error={error || loadError} note={note} />
      {limitText ? <p className="muted">{limitText}</p> : null}
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setError("");
        try {
          const result = await api("/api/account/password", {
            method: "POST",
            body: { current: form.get("current"), password: form.get("password"), confirm: form.get("confirm") },
          });
          setNote(result.message);
          formElement.reset();
        } catch (err) {
          setError(err.message);
        }
      }}>
        <h2>{t("Password")}</h2>
        <label>{t("Current password")}<input name="current" type="password" required autoComplete="current-password" /></label>
        <label>{t("New password")}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label>{t("Confirm")}<input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
        <button className="btn btn-primary" type="submit">{t("Change password")}</button>
      </form>
    </div>
  );
}
