import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { usePlayer } from "./player.jsx";

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let stop = false;
    setError("");
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

function Notice({ error, note }) {
  if (error) return <p className="flash flash-error" role="alert">{error}</p>;
  if (note) return <p className="flash flash-ok" role="status">{note}</p>;
  return null;
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
        <label className="grow">{t("Name")}<input name="name" required maxLength={120} placeholder="lobby" /></label>
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
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
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
  const selectable = filtered.filter((bot) => bot.canControl);
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

  async function apply(op, extra = {}, confirmText = "") {
    if (!selected.length || busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setFormError("");
    setNote("");
    try {
      const result = await api("/api/bots/bulk", { method: "POST", body: { ids: selected, op, ...extra } });
      setNote(result.message || "");
      setResults(result.results || []);
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
      {dockSlot && (selected.length || results.length) ? createPortal(
      <section className="card bulk-bar">
        <div className="split">
          <h2>{t("Apply to selected")}</h2>
          <span className="muted">{busy ? t("Working…") : t("{count} selected", { count: selected.length })}</span>
          {selected.length ? <button className="btn" type="button" onClick={() => setSelected([])}>{t("Clear selection")}</button> : null}
        </div>
        <div className="transport">
          <button className="btn btn-primary" type="button" disabled={busy || !selected.length} onClick={() => apply("start", {}, t("Start {count} bots?", { count: selected.length }))}>{t("Start")}</button>
          <button className="btn btn-danger" type="button" disabled={busy || !selected.length} onClick={() => apply("stop", {}, t("Stop {count} bots?", { count: selected.length }))}>{t("Stop")}</button>
        </div>
        {results.length ? (
          <ul className="bulk-results">
            {results.map((item) => (
              <li key={item.id} className={item.ok ? "ok" : "bad"}>
                <span>{item.name || item.id}</span>
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>,
      dockSlot) : null}
      {data && filtered.length === 0 ? <p className="muted">{bots.length ? t("Nothing matches.") : t("No bots yet.")}</p> : null}
      {filtered.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input ref={allRef} type="checkbox" checked={allPicked} disabled={!selectable.length} aria-label={t("Select all")} onChange={toggleVisible} />
                </th>
                <th>{t("Name")}</th>
                <th>{t("Owner")}</th>
                <th>{t("Instance")}</th>
                <th>{t("Status")}</th>
                <th>{t("Now playing")}</th>
                <th>{t("Volume")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bot) => {
                const playback = bot.playback;
                const picked = selected.includes(bot.id);
                let status = t("Empty");
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
                return (
                  <tr key={bot.id} className={picked ? "picked" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked}
                        disabled={!bot.canControl}
                        aria-label={t("Select {name}", { name: bot.name })}
                        title={bot.canControl ? "" : t("Read only")}
                        onChange={() => toggle(bot.id)}
                      />
                    </td>
                    <td><Link to={`/bots/${bot.id}`}>{bot.name}</Link></td>
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
                          <option value="">{bot.ownerName && !bot.assigneeUserId ? bot.ownerName : t("Instance owner")}</option>
                          {(data.users || []).map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
                        </select>
                      ) : (bot.ownerName || t("No owner"))}
                    </td>
                    <td>{bot.instanceId ? <Link to={`/instances/${bot.instanceId}`}>{bot.instanceName}</Link> : bot.instanceName}</td>
                    <td><span className={pill}>{status}</span>{playback?.error ? <div className="muted">{playback.error}</div> : null}</td>
                    <td>{playback?.title || "—"}</td>
                    <td className="mono">{playback?.volume != null ? playback.volume : "—"}</td>
                    <td className="inline">
                      <Link className="btn" to={`/bots/${bot.id}`}>{t("Open")}</Link>
                      {bot.canManage ? (
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
              <input name="name" required maxLength={120} placeholder="lobby" />
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
          <h2>{t("Add existing template")}</h2>
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
      <input name="confirm" required maxLength={64} placeholder={t("Type the bot name to confirm")} aria-label={t("Type the bot name to confirm")} />
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
          <p className="muted">{song?.title || t("Nothing is playing.")}</p>
        </div>
        <span className="pill">{song ? (song.paused ? t("Paused") : t("Playing")) : t("Empty")}</span>
      </div>
      <Notice error={player?.error || ""} note={player?.note || ""} />
      {(status?.problems || []).map((problem) => <p key={problem} className="flash flash-error">{problem}</p>)}
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
          <table>
            <thead><tr><th>#</th><th>{queue.title || t("Queue")}</th><th></th></tr></thead>
            <tbody>
              {queue.items.map((item) => (
                <tr key={item.index} className={item.index === queue.index ? "picked" : ""}>
                  <td className="mono">{item.index}</td>
                  <td>{item.title}</td>
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
        try {
          const data = await api(`/api/bots/${id}/search?q=${encodeURIComponent(query)}&factory=${factory}`);
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} required />
          </label>
          <label>{t("Source")}
            <select value={factory} onChange={(event) => setFactory(event.target.value)}>
              <option value="youtube">youtube</option>
              <option value="soundcloud">soundcloud</option>
              <option value="twitch">twitch</option>
              <option value="media">media</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">{t("Search")}</button>
        </div>
        {results.map((item) => (
          <div className="split" key={`${item.index}-${item.title}`}>
            <span className="grow">{item.title}</span>
            <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "search-play", index: item.index })}>{t("Play")}</button>
            <button className="btn" type="button" disabled={!canControl} onClick={() => act({ op: "search-add", index: item.index })}>{t("Append")}</button>
          </div>
        ))}
      </form>
    </div>
  );
}

export function Playlists() {
  const { id } = useParams();
  const { t } = useAuth();
  const { data, error } = useLoad(`/api/bots/${id}/playlists`);
  return (
    <div className="page">
      <h1>{t("Playlists")}</h1>
      <Notice error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th></th></tr></thead>
          <tbody>
            {(data?.lists || []).map((list) => (
              <tr key={list.id}>
                <td>{list.title}{list.count != null ? <span className="muted"> · {list.count}</span> : null}</td>
                <td><Link className="btn" to={`/bots/${id}/playlists/${encodeURIComponent(list.id)}`}>{t("Open")}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Playlist() {
  const { id, listId } = useParams();
  const { t } = useAuth();
  const player = usePlayer();
  const { note, error, act } = useBotAction(id, player?.refresh);
  const { data, error: loadError } = useLoad(`/api/bots/${id}/playlists/${listId}`);
  return (
    <div className="page">
      <h1>{data?.playlist?.title || t("Playlists")}</h1>
      <Notice error={error || loadError} note={note} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>{t("Name")}</th><th></th></tr></thead>
          <tbody>
            {(data?.playlist?.items || []).map((item) => (
              <tr key={item.index}>
                <td className="mono">{item.index}</td>
                <td>{item.title}</td>
                <td><button className="btn" type="button" onClick={() => act({ op: "list-play", listId, index: item.index })}>{t("Play from here")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th>{t("Stream address")}</th><th></th></tr></thead>
          <tbody>
            {(data?.streams || []).map((stream) => (
              <tr key={stream.id}>
                <td>{stream.name}{stream.shared ? <span className="pill">{t("Shared")}</span> : null}</td>
                <td className="mono">{stream.displayUrl}</td>
                <td className="inline">
                  <button className="btn btn-primary" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "play" } })}>{t("Play")}</button>
                  <button className="btn" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}/play`, { method: "POST", body: { op: "add" } })}>{t("Add to queue")}</button>
                  {stream.canDelete ? <button className="btn btn-danger" type="button" onClick={() => call(`/api/bots/${id}/streams/${stream.id}`, { method: "DELETE", body: {} }).then((result) => { if (result) reload(); })}>{t("Delete")}</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function History() {
  const { id } = useParams();
  const { t } = useAuth();
  const [query, setQuery] = useState("");
  const [path, setPath] = useState(`/api/bots/${id}/history`);
  const { data, error } = useLoad(path);
  const player = usePlayer();
  const { note, error: actionError, act } = useBotAction(id, player?.refresh);
  return (
    <div className="page">
      <h1>{t("History")}</h1>
      <Notice error={error || actionError} note={note} />
      <form className="card" onSubmit={(event) => {
        event.preventDefault();
        setPath(`/api/bots/${id}/history?q=${encodeURIComponent(query)}`);
      }}>
        <div className="split">
          <label className="grow">{t("Title contains")}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="btn" type="submit">{t("Search")}</button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th></th></tr></thead>
          <tbody>
            {(data?.rows || []).map((row, index) => (
              <tr key={`${row.id}-${index}`}>
                <td>{row.title}<div className="muted">{row.meta}</div></td>
                <td>{row.id != null ? <button className="btn" type="button" onClick={() => act({ op: "history-play", historyId: row.id })}>{t("Play")}</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Connection() {
  const { id } = useParams();
  const { t } = useAuth();
  const { data, error, reload } = useLoad(`/api/bots/${id}/connection`);
  const player = usePlayer();
  const { note, error: actionError, act, setError } = useBotAction(id, player?.refresh);
  const [localNote, setLocalNote] = useState("");
  if (!data && !error) return <div className="page"><h1>{t("Connection")}</h1></div>;
  return (
    <div className="page">
      <h1>{t("Connection")}</h1>
      <p className="muted">{t("Saved on the bot template. Empty fields stay unchanged. Passwords are sent to the bot and are not stored in the panel.")}</p>
      <Notice error={error || actionError} note={note || localNote} />
      <form className="card" key={data?.hosting?.name || "hosting"} onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const label = String(form.get("label") || "").trim();
        if (label && label !== (data?.bot?.name || "")) {
          try {
            const renamed = await api(`/api/bots/${id}/label`, { method: "POST", body: { name: label } });
            setLocalNote(renamed.message || "");
          } catch (err) {
            setError(err.message);
            return;
          }
        }
        const touched = ["nickname", "channel", "serverPassword", "channelPassword", "bitrate", "volume", "run", "startup", "clearStartup"]
          .some((key) => String(form.get(key) || "").trim());
        if (!touched) {
          reload();
          return;
        }
        const result = await act({
          op: "template-hosting",
          name: form.get("name"),
          nickname: form.get("nickname"),
          channel: form.get("channel"),
          serverPassword: form.get("serverPassword"),
          channelPassword: form.get("channelPassword"),
          bitrate: form.get("bitrate"),
          volume: form.get("volume"),
          run: form.get("run"),
          startup: form.get("startup"),
          clearStartup: form.get("clearStartup"),
        });
        if (result) {
          setLocalNote(result.message || "");
          formElement.querySelectorAll("input[type=password], input[name=startup]").forEach((input) => { input.value = ""; });
          const clearStartup = formElement.querySelector("input[name=clearStartup]");
          if (clearStartup) clearStartup.checked = false;
        }
      }}>
        <h2>{t("Connection settings")}</h2>
        <label>{t("Display name")}
          <input name="label" maxLength={120} defaultValue={data?.bot?.name || ""} />
        </label>
        <p className="muted">{t("This is the name in the panel. The TeamSpeak nickname is separate.")}</p>
        <input type="hidden" name="name" value={data?.hosting?.name || ""} />
        <label>{t("Nickname")}<input name="nickname" maxLength={30} placeholder="Music" /></label>
        <p className="muted">{t("The connected name changes immediately. An offline bot uses it the next time it connects.")}</p>
        <label>{t("Default channel")}<input name="channel" maxLength={200} placeholder={t("/5 or Home/Lobby")} /></label>
        <div className="split">
          <label className="grow">{t("Server password")}<input name="serverPassword" type="password" autoComplete="off" /></label>
          <label className="grow">{t("Channel password")}<input name="channelPassword" type="password" autoComplete="off" /></label>
        </div>
        <div className="split">
          <label>{t("Bitrate")}<input name="bitrate" inputMode="numeric" placeholder="96" /></label>
          <label>{t("Default volume")}<input name="volume" inputMode="numeric" min="0" max="100" placeholder="50" /></label>
          <label>{t("Start when the process launches")}
            <select name="run" defaultValue="">
              <option value="">{t("Leave unchanged")}</option>
              <option value="on">{t("Yes")}</option>
              <option value="off">{t("No")}</option>
            </select>
          </label>
        </div>
        <label>{t("Stream on connect")}<input name="startup" placeholder="https://" /></label>
        <p className="muted">{t("An http or https address. The bot plays it when it connects. Leave empty to keep the current stream.")}</p>
        <label className="check"><input type="checkbox" name="clearStartup" value="on" /> {t("Clear the stream on connect")}</label>
        <button className="btn btn-primary" type="submit">{t("Save")}</button>
      </form>
      {data?.connection ? (
        <section className="card">
          <h2>{t("Server")}</h2>
          <p>
            <span className={`pill pill-${data.connection.status === "connected" ? "ok" : data.connection.status === "connecting" ? "warn" : "bad"}`}>{data.connection.statusLabel}</span>
          </p>
          {data.connection.status === "offline" ? (
            <form className="split" key={data.connection.server || "address"} onSubmit={(event) => {
              event.preventDefault();
              act({ op: "template-address", name: data.connection.name, address: new FormData(event.currentTarget).get("address") }).then(() => reload());
            }}>
              <label className="grow">{t("Server")}
                <input name="address" defaultValue={data.connection.server || ""} required maxLength={200} />
              </label>
              <button className="btn btn-primary" type="submit">{t("Save")}</button>
            </form>
          ) : <p className="mono">{data.connection.server || "—"}</p>}
          <div className="inline">
            {data.connection.status === "offline" ? <button className="btn" type="button" onClick={() => act({ op: "connect", name: data.connection.name }).then(() => reload())}>{t("Start")}</button> : null}
            {data.connection.id != null ? <button className="btn btn-danger" type="button" onClick={() => window.confirm(t("Disconnect this instance?")) && act({ op: "disconnect", instanceId: data.connection.id }).then(() => reload())}>{t("Disconnect")}</button> : null}
          </div>
        </section>
      ) : null}
      <section className="card">
        <h2>{t("Channel commander")}</h2>
        <p className="muted">{t("The commander icon lets the bot use channel commands. It is saved and turns on again whenever the bot connects.")}</p>
        <p>{t("Saved")}: {data.commanderSaved == null ? t("Unknown") : data.commanderSaved ? t("On") : t("Off")}{data.commanderSavedError ? <span className="muted"> {data.commanderSavedError}</span> : null}</p>
        <p>{t("Connected")}: {data.commander == null ? t("Unknown") : data.commander ? t("On") : t("Off")}{data.commanderError ? <span className="muted"> {data.commanderError}</span> : null}</p>
        <div className="inline">
          <button className="btn btn-primary" type="button" onClick={() => act({ op: "commander", mode: "on" }).then((result) => { if (result) reload(); })}>{t("Turn on")}</button>
          <button className="btn" type="button" onClick={() => act({ op: "commander", mode: "off" }).then((result) => { if (result) reload(); })}>{t("Turn off")}</button>
        </div>
      </section>
      <section className="card">
        <h2>{t("TeamSpeak admins")}</h2>
        <p className="muted">{t("A TeamSpeak UID listed here can run every command on this bot. Other bots stay unchanged.")}</p>
        <form className="split" onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          try {
            const result = await api(`/api/bots/${id}/admins`, { method: "POST", body: { uid: new FormData(formElement).get("uid") } });
            setLocalNote(result.message || "");
            formElement.reset();
            reload();
          } catch (err) {
            setError(err.message);
          }
        }}>
          <label className="grow">{t("TeamSpeak UID")}<input name="uid" required maxLength={64} placeholder="VG90YWxseU5vdEZha2U=" /></label>
          <button className="btn btn-primary" type="submit">{t("Add")}</button>
        </form>
        {(data.admins || []).map((uid) => (
          <div className="split" key={uid}>
            <p className="mono grow">{uid}</p>
            <button className="btn btn-danger" type="button" onClick={async () => {
              try {
                const result = await api(`/api/bots/${id}/admins`, { method: "DELETE", body: { uid } });
                setLocalNote(result.message || "");
                reload();
              } catch (err) {
                setError(err.message);
              }
            }}>{t("Remove")}</button>
          </div>
        ))}
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
  if (user.role !== "admin") return <p className="flash flash-error">{t("Administrators only")}</p>;
  async function post(path, body) {
    setFormError("");
    const result = await api(path, { method: "POST", body });
    setNote(result.message || "");
    if (result.users) setData({ users: result.users, instances: result.instances || [] });
    if (result.signedOut) window.location.assign("/login");
    return result;
  }
  return (
    <div className="page">
      <h1>{t("Users")}</h1>
      <p className="muted">{t("Panel accounts. These are not TeamSpeak identities.")}</p>
      <p className="muted">{t("A bot limit counts bots assigned to this account. A bot with nobody assigned counts for the instance owner. Leave it empty for unlimited.")}</p>
      <p className="muted">{t("Check the instances an account may open. Can create bots also lets that account pick any enabled instance.")}</p>
      <Notice error={formError || error} note={note} />
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
          await post("/api/admin/users", {
            username: form.get("username"),
            password: form.get("password"),
            role: form.get("role"),
            botLimit: form.get("botLimit"),
            canCreateBots: form.get("canCreateBots") === "yes",
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
          <button className="btn btn-primary" type="submit">{t("Create")}</button>
        </div>
      </form>
      <div className="user-list">
        {(data?.users || []).map((account) => (
          <form className="card user-card" key={`${account.id}-${account.role}-${account.suspended}-${account.canCreateBots}-${(account.instanceIds || []).join(".")}`} onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await post(`/api/admin/users/${account.id}/role`, { role: form.get("role") });
              await post(`/api/admin/users/${account.id}/limit`, { botLimit: form.get("botLimit") });
              await post(`/api/admin/users/${account.id}/create-bots`, { canCreateBots: form.get("canCreateBots") === "yes" });
              await post(`/api/admin/users/${account.id}/instances`, { instanceIds: [...form.getAll("instanceId")] });
              const suspend = form.get("suspended") === "yes";
              if (suspend !== account.suspended && account.id !== user.id) {
                await post(`/api/admin/users/${account.id}/suspend`, { suspended: suspend });
              }
            } catch (err) {
              setFormError(err.message);
            }
          }}>
            <div className="user-card-head">
              <h2>{account.username}</h2>
              <span className={account.suspended ? "pill pill-bad" : "pill pill-ok"}>{account.suspended ? t("Suspended") : t("Active")}</span>
            </div>
            {account.hasPassword ? null : <p className="muted">{t("Cannot sign in until a password is set")}</p>}
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
              <select name="instanceId" multiple size={Math.min(6, Math.max((data.instances || []).length, 3))} defaultValue={(account.instanceIds || []).map(String)}>
                {(data.instances || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
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
                  if (!window.confirm(t("Delete"))) return;
                  try { await api(`/api/admin/users/${account.id}`, { method: "DELETE", body: { confirm: true } }).then((result) => { setNote(result.message); setData({ users: result.users, instances: result.instances || [] }); }); }
                  catch (err) { setFormError(err.message); }
                }}>{t("Remove")}</button>
              ) : null}
            </div>
          </form>
        ))}
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
                <td>{row.detail}{row.botName ? <div className="muted">{row.botName}</div> : null}</td>
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
