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
  const { t } = useAuth();
  const location = useLocation();
  const { data, error } = useLoad("/api/overview");
  const cards = data?.cards || [];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("Overview")}</h1>
          <p className="muted">{t("Each entry is one Docker container. Several TeamSpeak bots can run inside it.")}</p>
        </div>
        <Link className="btn btn-primary" to="/bots">{t("Bots")}</Link>
      </div>
      <Notice error={error} note={location.state?.note || ""} />
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
  const [volume, setVolume] = useState("40");
  const [resource, setResource] = useState("");
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
          <p className="muted">{t("Every TeamSpeak bot you can open. Select several to apply one playback action to all of them.")}</p>
        </div>
        <button className="btn" type="button" onClick={() => reload()}>{t("Refresh")}</button>
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
        <p className="muted">{t("Select bots in the list. Pause, volume, and stop run together. Play and append are limited to 10 bots.")}</p>
        <div className="transport">
          <button className="btn" type="button" disabled={busy || !selected.length} onClick={() => apply("previous")}>{t("Previous")}</button>
          <button className="btn" type="button" disabled={busy || !selected.length} onClick={() => apply("pause")}>{t("Pause")}</button>
          <button className="btn" type="button" disabled={busy || !selected.length} onClick={() => apply("resume")}>{t("Resume")}</button>
          <button className="btn" type="button" disabled={busy || !selected.length} onClick={() => apply("next")}>{t("Skip")}</button>
          <button className="btn" type="button" disabled={busy || !selected.length} onClick={() => apply("stop", {}, t("Stop playback on {count} bots?", { count: selected.length }))}>{t("Stop")}</button>
          <button className="btn btn-danger" type="button" disabled={busy || !selected.length} onClick={() => apply("clear", {}, t("Clear the queue on {count} bots?", { count: selected.length }))}>{t("Clear")}</button>
        </div>
        <div className="split">
          <label className="grow">{t("Volume")}
            <input type="number" min="0" max="100" step="1" value={volume} disabled={busy || !selected.length} onChange={(event) => setVolume(event.target.value)} />
          </label>
          <button className="btn" type="button" disabled={busy || !selected.length} onClick={() => apply("volume", { volume: Number(volume) })}>{t("Apply")}</button>
        </div>
        <div className="split">
          <label className="grow">{t("Link or resource")}
            <input value={resource} disabled={busy || !selected.length} placeholder={t("https://… or media/file.mp3")} onChange={(event) => setResource(event.target.value)} />
          </label>
          <button className="btn btn-primary" type="button" disabled={busy || !selected.length} onClick={() => {
            if (!resource.trim()) {
              setFormError(t("Link is missing or too long"));
              return;
            }
            apply("play", { resource });
          }}>{t("Play")}</button>
          <button className="btn" type="button" disabled={busy || !selected.length} onClick={() => {
            if (!resource.trim()) {
              setFormError(t("Link is missing or too long"));
              return;
            }
            apply("add", { resource });
          }}>{t("Append")}</button>
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
                    <td>
                      <div>{bot.ownerName || t("No owner")}</div>
                      {user.role === "admin" ? (
                        <form className="inline" onSubmit={async (event) => {
                          event.preventDefault();
                          const formElement = event.currentTarget;
                          setFormError("");
                          try {
                            const result = await api(`/api/bots/${bot.id}/assignee`, {
                              method: "POST",
                              body: { userId: new FormData(formElement).get("userId") },
                            });
                            setNote(result.message || "");
                            reload();
                          } catch (err) {
                            setFormError(err.message);
                          }
                        }}>
                          <select name="userId" defaultValue={bot.assigneeUserId || ""} key={`${bot.id}-${bot.assigneeUserId || "none"}`}>
                            <option value="">{t("Instance owner")}</option>
                            {(data.users || []).map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}
                          </select>
                          <button className="btn" type="submit">{t("Save")}</button>
                        </form>
                      ) : null}
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
                              body: { name: bot.name, confirm },
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
    const grants = (data.users || [])
      .filter((account) => account.role !== "admin" && String(account.id) !== form.get("ownerUserId"))
      .filter((account) => form.get(`grant_${account.id}`) === "on")
      .map((account) => ({ userId: account.id, canControl: form.get(`control_${account.id}`) === "on" }));
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
              <input name="name" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" placeholder="lobby" />
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
          <h2>{t("Grants")}</h2>
          {(data.users || []).filter((account) => account.role !== "admin" && String(account.id) !== String(instance.ownerUserId)).map((account) => {
            const grant = (data.grants || []).find((item) => item.userId === account.id);
            return (
              <div className="grant" key={account.id}>
                <label className="check"><input type="checkbox" name={`grant_${account.id}`} value="on" defaultChecked={Boolean(grant)} /> {account.username}</label>
                <label className="check"><input type="checkbox" name={`control_${account.id}`} value="on" defaultChecked={!grant || grant.canControl} /> {t("Control")}</label>
              </div>
            );
          })}
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
  const { note, error: actionError, act } = useBotAction(id, player?.refresh);
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
        const result = await act({
          op: "template-hosting",
          name: form.get("name"),
          nickname: form.get("nickname"),
          channel: form.get("channel"),
          serverPassword: form.get("serverPassword"),
          channelPassword: form.get("channelPassword"),
          bitrate: form.get("bitrate"),
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
        <div className="split">
          <label>{t("Name")}<input name="name" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" defaultValue={data?.hosting?.name || ""} /></label>
          <label className="grow">{t("Nickname")}<input name="nickname" maxLength={30} placeholder="Music" /></label>
        </div>
        <p className="muted">{t("The connected name changes immediately. An offline bot uses it the next time it connects.")}</p>
        <label>{t("Default channel")}<input name="channel" maxLength={200} placeholder={t("/5 or Home/Lobby")} /></label>
        <div className="split">
          <label className="grow">{t("Server password")}<input name="serverPassword" type="password" autoComplete="off" /></label>
          <label className="grow">{t("Channel password")}<input name="channelPassword" type="password" autoComplete="off" /></label>
        </div>
        <div className="split">
          <label>{t("Bitrate")}<input name="bitrate" inputMode="numeric" placeholder="96" /></label>
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
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th>{t("Server")}</th><th>{t("Status")}</th><th></th></tr></thead>
          <tbody>
            {(data?.instances || []).map((item) => (
              <tr key={`${item.id}-${item.name}`}>
                <td>{item.name || "—"}{item.current ? <span className="pill pill-ok">{t("Active")}</span> : null}</td>
                <td>
                  {item.name && item.status === "offline" ? (
                    <form className="inline" onSubmit={(event) => {
                      event.preventDefault();
                      act({ op: "template-address", name: item.name, address: new FormData(event.currentTarget).get("address") }).then(() => reload());
                    }}>
                      <input name="address" defaultValue={item.server || ""} required maxLength={200} />
                      <button className="btn" type="submit">{t("Save")}</button>
                    </form>
                  ) : item.server || "—"}
                </td>
                <td><span className={`pill pill-${item.status === "connected" ? "ok" : item.status === "connecting" ? "warn" : "bad"}`}>{item.statusLabel}</span></td>
                <td className="inline">
                  {item.name && item.status === "offline" ? <button className="btn" type="button" onClick={() => act({ op: "connect", name: item.name }).then(() => reload())}>{t("Start")}</button> : null}
                  {item.id != null ? <button className="btn btn-danger" type="button" onClick={() => window.confirm(t("Disconnect this instance?")) && act({ op: "disconnect", instanceId: item.id }).then(() => reload())}>{t("Disconnect")}</button> : null}
                  <button className="btn" type="button" onClick={() => act({ op: "use-instance", name: item.name, instanceId: item.id ?? "" })}>{t("Open")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card">
        <h2>{t("Channel commander")}</h2>
        <p className="muted">{t("The commander icon lets the bot use channel commands. It applies to the connected bot and is not saved.")}</p>
        <p>{data.commander == null ? t("Unknown") : data.commander ? t("On") : t("Off")}{data.commanderError ? <span className="muted"> {data.commanderError}</span> : null}</p>
        <div className="inline">
          <button className="btn btn-primary" type="button" onClick={() => act({ op: "commander", mode: "on" }).then((result) => { if (result) reload(); })}>{t("Turn on")}</button>
          <button className="btn" type="button" onClick={() => act({ op: "commander", mode: "off" }).then((result) => { if (result) reload(); })}>{t("Turn off")}</button>
        </div>
      </section>
      <form className="card" onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        act({ op: "bot-setup", key: new FormData(formElement).get("key") }).then((result) => {
          if (result) formElement.reset();
        });
      }}>
        <h2>{t("Privilege key")}</h2>
        <p className="muted">{t("Paste a TeamSpeak privilege key once. It applies to the instance currently used for playback. The key is not stored.")}</p>
        <label>{t("Privilege key")}<input name="key" required autoComplete="off" /></label>
        <button className="btn" type="submit">{t("Apply")}</button>
      </form>
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
    if (result.users) setData({ users: result.users });
    if (result.signedOut) window.location.assign("/login");
    return result;
  }
  return (
    <div className="page">
      <h1>{t("Users")}</h1>
      <p className="muted">{t("Panel accounts. These are not TeamSpeak identities.")}</p>
      <p className="muted">{t("A bot limit counts bots assigned to this account. A bot with nobody assigned counts for the instance owner. Leave it empty for unlimited.")}</p>
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
            canCreateBots: form.get("canCreateBots") === "on",
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
          <label className="check"><input type="checkbox" name="canCreateBots" value="on" /> {t("Can create bots")}</label>
          <button className="btn btn-primary" type="submit">{t("Create")}</button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Name")}</th><th>{t("Role")}</th><th>{t("Bot limit")}</th><th>{t("Can create bots")}</th><th>{t("Status")}</th><th></th></tr></thead>
          <tbody>
            {(data?.users || []).map((account) => (
              <tr key={account.id}>
                <td>
                  {account.username}
                  {account.hasPassword ? null : <div className="muted">{t("Cannot sign in until a password is set")}</div>}
                </td>
                <td>
                  <form className="inline" onSubmit={async (event) => {
                    event.preventDefault();
                    try { await post(`/api/admin/users/${account.id}/role`, { role: new FormData(event.currentTarget).get("role") }); }
                    catch (err) { setFormError(err.message); }
                  }}>
                    <select name="role" defaultValue={account.role}>
                      <option value="user">{t("User")}</option>
                      <option value="admin">{t("Administrator")}</option>
                    </select>
                    <button className="btn" type="submit">{t("Save")}</button>
                  </form>
                </td>
                <td>
                  <form className="inline" onSubmit={async (event) => {
                    event.preventDefault();
                    try { await post(`/api/admin/users/${account.id}/limit`, { botLimit: new FormData(event.currentTarget).get("botLimit") }); }
                    catch (err) { setFormError(err.message); }
                  }}>
                    <input className="bot-limit" name="botLimit" inputMode="numeric" placeholder={t("Unlimited")} defaultValue={account.botLimit ?? ""} key={account.botLimit ?? "unlimited"} />
                    <button className="btn" type="submit">{t("Save")}</button>
                  </form>
                </td>
                <td>
                  <form className="inline" key={account.canCreateBots ? "yes" : "no"} onSubmit={async (event) => {
                    event.preventDefault();
                    try {
                      await post(`/api/admin/users/${account.id}/create-bots`, {
                        canCreateBots: new FormData(event.currentTarget).get("canCreateBots") === "on",
                      });
                    } catch (err) { setFormError(err.message); }
                  }}>
                    <label className="check"><input type="checkbox" name="canCreateBots" value="on" defaultChecked={account.canCreateBots} /> {t("Can create bots")}</label>
                    <button className="btn" type="submit">{t("Save")}</button>
                  </form>
                </td>
                <td>
                  <span className={account.suspended ? "pill pill-bad" : "pill pill-ok"}>{account.suspended ? t("Suspended") : t("Active")}</span>
                  {account.id !== user.id ? (
                    <button className="btn" type="button" onClick={async () => {
                      try { await post(`/api/admin/users/${account.id}/suspend`, { suspended: !account.suspended }); }
                      catch (err) { setFormError(err.message); }
                    }}>{account.suspended ? t("Restore") : t("Suspend")}</button>
                  ) : null}
                </td>
                <td className="inline">
                  <form className="inline" onSubmit={async (event) => {
                    event.preventDefault();
                    const formElement = event.currentTarget;
                    try {
                      await post(`/api/admin/users/${account.id}/password`, { password: new FormData(formElement).get("password") });
                      formElement.reset();
                    } catch (err) { setFormError(err.message); }
                  }}>
                    <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder={t("New password")} />
                    <button className="btn" type="submit">{t("Set")}</button>
                  </form>
                  {account.id !== user.id ? (
                    <button className="btn btn-danger" type="button" onClick={async () => {
                      if (!window.confirm(t("Delete"))) return;
                      try { await api(`/api/admin/users/${account.id}`, { method: "DELETE", body: { confirm: true } }).then((result) => { setNote(result.message); setData({ users: result.users }); }); }
                      catch (err) { setFormError(err.message); }
                    }}>{t("Remove")}</button>
                  ) : null}
                </td>
              </tr>
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
